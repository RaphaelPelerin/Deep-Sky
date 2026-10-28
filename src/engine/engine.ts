import type {
  EngineClick,
  EngineConfig,
  EngineEvent,
  EngineInit,
  EngineMessage,
  EnginePalette,
  RGB,
} from './protocol';
import { FRAG, VERT } from './shader';

/**
 * The render engine: a WebGL shader (nebula, aurora, beams, light, shockwaves) and a 2D layer
 * (stars, constellations, shooting stars, spotlight, click rings).
 *
 * No DOM access: it runs in a Web Worker on OffscreenCanvases, so the page's own work and the
 * animation never slow each other down. It also runs on the main thread when workers can't.
 */

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

interface Star {
  x: number;
  y: number;
  /** depth, 0.15 (far) .. 1 (near) */
  z: number;
  vx: number;
  vy: number;
  /** impulse from the cursor and clicks, damped every frame */
  ix: number;
  iy: number;
  size: number;
  phase: number;
  tint: number;
}

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  len: number;
}

interface Ring {
  x: number;
  y: number;
  start: number;
  strong: boolean;
}

interface Near {
  x: number;
  y: number;
  d: number;
}

const UNIFORMS = [
  'uFrame',
  'uPointer',
  'uRipples',
  'uMix',
  'uFx',
  'uShape',
  'uBg',
  'uNeb0',
  'uNeb1',
  'uNeb2',
  'uNeb3',
  'uAur0',
  'uAur1',
  'uRays',
  'uGlow',
] as const;
type Uniform = (typeof UNIFORMS)[number];

/** shader fade-in duration (s) */
const INTRO = 2.2;

const raf: (cb: () => void) => number =
  typeof requestAnimationFrame === 'function'
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(cb, 16) as unknown as number;
const cancelRaf: (id: number) => void =
  typeof cancelAnimationFrame === 'function'
    ? (id) => cancelAnimationFrame(id)
    : (id) => clearTimeout(id);

/** getContext on a DOM canvas or an OffscreenCanvas (signatures TypeScript can't unify) */
function context<T>(canvas: AnyCanvas, type: string, attrs?: object): T | null {
  try {
    return (canvas as unknown as { getContext(t: string, a?: object): T | null }).getContext(
      type,
      attrs,
    );
  } catch {
    return null;
  }
}

function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const css = (c: RGB) =>
  `${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)}`;

function mixPalette(a: EnginePalette, b: EnginePalette, t: number): EnginePalette {
  const mix = (x: RGB, y: RGB): RGB => [
    x[0] + (y[0] - x[0]) * t,
    x[1] + (y[1] - x[1]) * t,
    x[2] + (y[2] - x[2]) * t,
  ];
  return {
    background: mix(a.background, b.background),
    nebula: [
      mix(a.nebula[0], b.nebula[0]),
      mix(a.nebula[1], b.nebula[1]),
      mix(a.nebula[2], b.nebula[2]),
      mix(a.nebula[3], b.nebula[3]),
    ],
    aurora: [mix(a.aurora[0], b.aurora[0]), mix(a.aurora[1], b.aurora[1])],
    rays: mix(a.rays, b.rays),
    glow: mix(a.glow, b.glow),
    stars: [mix(a.stars[0], b.stars[0]), mix(a.stars[1], b.stars[1]), mix(a.stars[2], b.stars[2])],
    spotlight: [mix(a.spotlight[0], b.spotlight[0]), mix(a.spotlight[1], b.spotlight[1])],
    lines: mix(a.lines, b.lines),
    meteor: mix(a.meteor, b.meteor),
  };
}

export class Engine {
  private gl: WebGLRenderingContext | null = null;
  /** WebGL renders here, then the frame is shown through a bitmaprenderer context (see initGl) */
  private off: OffscreenCanvas | null = null;
  private view: ImageBitmapRenderingContext | null = null;
  private readonly u = {} as Record<Uniform, WebGLUniformLocation | null>;
  private readonly ctx: Ctx2D | null;

  private cfg: EngineConfig;
  private dark: boolean;
  /** 0 = light theme, 1 = dark theme, cross-faded */
  private darkMix: number;
  private palette: EnginePalette;
  private paletteMix = -1;
  private animated: boolean;
  private visible = true;
  private sized = false;
  private running = false;
  private rafId = 0;
  private readonly t0 = performance.now();
  /** animation time: scaled by `speed`, frozen while paused */
  private time = 0;
  private last = 0;
  private lastGl = -1;
  private lastFx = -1;
  /** min interval between two shader frames, grows on slow machines */
  private glStep: number;
  /** shader resolution relative to CSS pixels, shrinks on slow machines */
  private glScale: number;
  private busyUntil = 0;
  private lastPointer = -99;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private spotAlpha = 0;

  /** x,y: eased light position for the shader (0..1, y up); px,py: raw pointer; sx,sy: spotlight */
  private readonly mouse = {
    x: 0.5,
    y: 0.6,
    tx: 0.5,
    ty: 0.6,
    px: -9999,
    py: -9999,
    sx: -9999,
    sy: -9999,
    inside: false,
  };
  /** 4 shockwaves × (x, y, start, strength) */
  private readonly ripples = new Float32Array(16);
  private nextRipple = 0;
  private sweepAt = 0;

  private stars: Star[] = [];
  private meteors: Meteor[] = [];
  private rings: Ring[] = [];
  private readonly near: Near[] = [];
  private nextMeteor = 2;
  private sprites: AnyCanvas[] = [];
  private spriteKey = '';
  private frameTimes = 0;
  private frameCount = 0;
  private adaptAt = 0;
  private stats: boolean;
  private statsAt = 0;
  private statFx = 0;
  private statGl = 0;
  private readySent = false;

  constructor(
    private readonly glCanvas: AnyCanvas,
    private readonly fxCanvas: AnyCanvas,
    private readonly emit: (event: EngineEvent) => void,
    init: EngineInit,
  ) {
    this.cfg = init.config;
    this.dark = init.dark;
    this.darkMix = init.dark ? 1 : 0;
    this.palette = init.dark ? init.config.palettes.dark : init.config.palettes.light;
    this.animated = init.animated;
    this.stats = init.stats;
    this.glScale = init.config.scale;
    this.glStep = 1 / (init.config.fps + 1);
    // a ring of light rises from the bottom as the page opens
    if (init.config.intro) {
      this.ripples.set([0.5, 0.8, 0.35, 1], 0);
      this.nextRipple = 1;
    }
    if (!this.initGl()) this.fail();
    this.ctx = context<Ctx2D>(fxCanvas, '2d');
  }

  handle(msg: EngineMessage) {
    switch (msg.type) {
      case 'config':
        this.setConfig(msg.config);
        break;
      case 'resize':
        this.resize(msg.w, msg.h, msg.dpr);
        break;
      case 'pointer':
        this.pointer(msg.x, msg.y, msg.inside);
        break;
      case 'click':
        this.click(msg.x, msg.y, msg.effect ?? this.cfg.click);
        break;
      case 'pulse':
        this.sweepAt = this.now();
        break;
      case 'theme':
        if (this.dark === msg.dark) break;
        this.dark = msg.dark;
        if (!this.running) this.renderStatic();
        break;
      case 'animated':
        this.animated = msg.on;
        this.sync();
        break;
      case 'visible':
        this.visible = msg.on;
        this.sync();
        break;
      case 'busy':
        this.busyUntil = this.now() + 2;
        break;
      case 'stats':
        this.stats = msg.on;
        break;
    }
  }

  destroy() {
    this.stop();
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null;
  }

  private now() {
    return (performance.now() - this.t0) / 1000;
  }

  private fail() {
    this.gl = null;
    this.emit({ type: 'glFailed' });
  }

  private markReady() {
    if (this.readySent) return;
    this.readySent = true;
    this.emit({ type: 'ready' });
  }

  // ---------- WebGL ----------

  private initGl(): boolean {
    const attrs: WebGLContextAttributes = {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    };
    let gl: WebGLRenderingContext | null = null;
    // Render into an internal OffscreenCanvas and present the frame as a bitmap: on some machines
    // the direct presentation of a WebGL canvas is throttled to ~1 fps, this path is not.
    if (typeof OffscreenCanvas !== 'undefined') {
      const off = new OffscreenCanvas(1, 1);
      gl = context<WebGLRenderingContext>(off, 'webgl', attrs);
      const view = gl ? context<ImageBitmapRenderingContext>(this.glCanvas, 'bitmaprenderer') : null;
      if (gl && view) {
        this.off = off;
        this.view = view;
      } else {
        gl = null;
      }
    }
    gl ??= context<WebGLRenderingContext>(this.glCanvas, 'webgl', attrs);
    if (!gl || !this.setupProgram(gl)) return false;

    const g = gl;
    const target = (this.off ?? this.glCanvas) as unknown as EventTarget;
    target.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.gl = null;
    });
    target.addEventListener('webglcontextrestored', () => {
      if (this.setupProgram(g)) this.gl = g;
      else this.fail();
    });
    this.gl = gl;
    return true;
  }

  private setupProgram(gl: WebGLRenderingContext): boolean {
    const compile = (type: number, src: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        if (!gl.isContextLost()) console.warn('[deep-sky]', gl.getShaderInfoLog(shader));
        return null;
      }
      return shader;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) return false;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      if (!gl.isContextLost()) console.warn('[deep-sky]', gl.getProgramInfoLog(prog));
      return false;
    }
    gl.useProgram(prog);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    for (const name of UNIFORMS) this.u[name] = gl.getUniformLocation(prog, name);
    return true;
  }

  /** shader colors, cross-faded between the light and dark palettes */
  private shaderPalette(): EnginePalette {
    if (this.paletteMix !== this.darkMix) {
      const { dark, light } = this.cfg.palettes;
      this.palette =
        this.darkMix >= 1 ? dark : this.darkMix <= 0 ? light : mixPalette(light, dark, this.darkMix);
      this.paletteMix = this.darkMix;
    }
    return this.palette;
  }

  private renderGl(clock: number) {
    const gl = this.gl;
    if (!gl) return;
    const { u, cfg, mouse: m } = this;
    const p = this.shaderPalette();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    gl.viewport(0, 0, w, h);
    gl.uniform4f(u.uFrame, w, h, this.time, clock);
    gl.uniform4f(u.uPointer, m.x, m.y, this.darkMix, this.sweepAt);
    gl.uniform4fv(u.uRipples, this.ripples);
    gl.uniform4f(u.uMix, cfg.nebula, cfg.aurora, cfg.rays, cfg.glow);
    gl.uniform4f(u.uFx, cfg.lens, cfg.grain, cfg.vignette, cfg.shimmer);
    gl.uniform4f(
      u.uShape,
      cfg.nebulaScale,
      cfg.auroraPosition - 0.5,
      cfg.raysSpread,
      cfg.intro ? INTRO : 0,
    );
    gl.uniform3fv(u.uBg, p.background);
    gl.uniform3fv(u.uNeb0, p.nebula[0]);
    gl.uniform3fv(u.uNeb1, p.nebula[1]);
    gl.uniform3fv(u.uNeb2, p.nebula[2]);
    gl.uniform3fv(u.uNeb3, p.nebula[3]);
    gl.uniform3fv(u.uAur0, p.aurora[0]);
    gl.uniform3fv(u.uAur1, p.aurora[1]);
    gl.uniform3fv(u.uRays, p.rays);
    gl.uniform3fv(u.uGlow, p.glow);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (this.off && this.view) this.view.transferFromImageBitmap(this.off.transferToImageBitmap());
    this.statGl++;
    this.markReady();
  }

  // ---------- loop ----------

  private sync() {
    if (this.animated && this.visible) {
      this.start();
    } else {
      this.stop();
      if (!this.animated) this.renderStatic();
    }
  }

  private start() {
    if (this.running || !this.sized || !this.animated || !this.visible) return;
    this.running = true;
    this.last = this.now();
    this.statsAt = this.last;
    this.statFx = 0;
    this.statGl = 0;
    // no quality changes while the shader compiles and the page starts up
    this.adaptAt = this.last + 3;
    const frame = () => {
      if (!this.running) return;
      this.rafId = raf(frame);
      const t = this.now();
      const dt = t - this.last;
      this.last = t;
      this.time += Math.min(dt, 0.1) * this.cfg.speed;
      const busy = t < this.busyUntil;
      const active = t - this.lastPointer < 5;
      // particles: 60 fps while the pointer moves (or on high quality), 30 otherwise;
      // shader: the configured rate, 12 fps while the page is busy
      const fxStep = !busy && (active || this.cfg.fps > 45) ? 1 / 62 : 1 / 31;
      if (t - this.lastFx >= fxStep) {
        const k = Math.min(0.05, Math.max(0.001, t - this.lastFx)) * 60;
        this.lastFx = t;
        this.step(k);
        this.renderFx(t, k);
      }
      if (t - this.lastGl >= (busy ? 1 / 12 : this.glStep)) {
        this.lastGl = t;
        this.renderGl(t);
      }
      this.adapt(t, dt);
      this.report(t);
    };
    this.rafId = raf(frame);
  }

  private stop() {
    this.running = false;
    cancelRaf(this.rafId);
  }

  private renderStatic() {
    if (!this.sized) return;
    this.darkMix = this.dark ? 1 : 0;
    this.mouse.x = 0.5;
    this.mouse.y = 0.6;
    this.spotAlpha = 0;
    // a clock past the intro and any shockwave
    const clock = this.now() + 100;
    this.renderGl(clock);
    this.renderFx(clock, 0);
  }

  private step(k: number) {
    const m = this.mouse;
    // without a pointer, the light wanders on its own
    if (!m.inside) {
      m.tx = 0.5 + 0.32 * Math.sin(this.time * 0.11);
      m.ty = 0.62 + 0.18 * Math.sin(this.time * 0.17 + 1);
    }
    const ease = 1 - Math.pow(0.93, k);
    m.x += (m.tx - m.x) * ease;
    m.y += (m.ty - m.y) * ease;
    const target = this.dark ? 1 : 0;
    this.darkMix += (target - this.darkMix) * (1 - Math.pow(0.9, k));
    if (Math.abs(target - this.darkMix) < 0.002) this.darkMix = target;
  }

  /** slow machine (< 40 fps): lower the shader resolution first, then its frame rate */
  private adapt(t: number, dt: number) {
    if (!this.cfg.adaptive) return;
    // a frame over 250 ms means a throttled tab or window, not a slow GPU
    if (dt < 0.25) {
      this.frameTimes += dt;
      this.frameCount++;
    }
    if (t - this.adaptAt < 1.5) return;
    const count = this.frameCount;
    const avg = count ? this.frameTimes / count : 0;
    this.frameTimes = 0;
    this.frameCount = 0;
    this.adaptAt = t;
    if (count < 20 || avg <= 1 / 40) return;
    if (this.glScale > this.cfg.minScale + 0.01) {
      this.glScale = Math.max(this.cfg.minScale, this.glScale * 0.7);
      this.applySize();
    } else if (this.glStep < 1 / 15) {
      this.glStep += 1 / 60;
    }
  }

  private report(t: number) {
    if (!this.stats) return;
    const span = t - this.statsAt;
    if (span < 1) return;
    this.emit({
      type: 'stats',
      fps: Math.round(this.statFx / span),
      shaderFps: Math.round(this.statGl / span),
      scale: Math.round(this.glScale * 100) / 100,
      particles: this.stars.length,
    });
    this.statsAt = t;
    this.statFx = 0;
    this.statGl = 0;
  }

  private setConfig(cfg: EngineConfig) {
    const prev = this.cfg;
    this.cfg = cfg;
    this.paletteMix = -1;
    const tints = (c: EngineConfig) =>
      JSON.stringify([c.palettes.dark.stars, c.palettes.dark.meteor, c.palettes.light.stars, c.palettes.light.meteor]);
    if (tints(cfg) !== tints(prev)) this.spriteKey = '';
    if (cfg.scale !== prev.scale || cfg.minScale !== prev.minScale) {
      this.glScale = cfg.scale;
      if (this.sized) this.applySize();
    }
    if (cfg.fps !== prev.fps) this.glStep = 1 / (cfg.fps + 1);
    if (cfg.meteors !== prev.meteors) this.nextMeteor = this.time + 0.5;
    if (this.sized) this.fitStars();
    if (!this.running) this.renderStatic();
  }

  private resize(w: number, h: number, dpr: number) {
    const sx = Math.max(1, w) / this.w;
    const sy = Math.max(1, h) / this.h;
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.dpr = dpr;
    this.applySize();
    if (this.sized) {
      for (const s of this.stars) {
        s.x *= sx;
        s.y *= sy;
      }
    }
    this.fitStars();
    if (!this.sized) {
      this.sized = true;
      this.sync();
    } else if (!this.running) {
      this.renderStatic();
    }
  }

  private applySize() {
    const gw = Math.max(1, Math.round(this.w * this.glScale));
    const gh = Math.max(1, Math.round(this.h * this.glScale));
    this.glCanvas.width = gw;
    this.glCanvas.height = gh;
    if (this.off) {
      this.off.width = gw;
      this.off.height = gh;
    }
    this.fxCanvas.width = Math.max(1, Math.round(this.w * this.dpr));
    this.fxCanvas.height = Math.max(1, Math.round(this.h * this.dpr));
    this.ctx?.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private pointer(x: number, y: number, inside: boolean) {
    const m = this.mouse;
    m.inside = inside;
    if (!inside) return;
    if (m.sx < -1000) {
      m.sx = x;
      m.sy = y;
    }
    m.px = x;
    m.py = y;
    m.tx = x / this.w;
    m.ty = 1 - y / this.h;
    this.lastPointer = this.now();
  }

  /** click: a ring, a shockwave in the shader (strong effect) and nearby stars pushed away */
  private click(x: number, y: number, effect: EngineClick) {
    if (!this.running || effect === 'none') return;
    const now = this.now();
    const strong = effect === 'shockwave';
    if (this.rings.length < 24) this.rings.push({ x, y, start: now, strong });
    if (strong) {
      this.ripples.set([x / this.w, 1 - y / this.h, now, 1], (this.nextRipple++ % 4) * 4);
    }
    const reach = strong ? 260 : 160;
    const force = strong ? 6 : 2.2;
    for (const s of this.stars) {
      const dx = s.x - x;
      const dy = s.y - y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d > reach) continue;
      const f = (1 - d / reach) * force;
      s.ix += (dx / d) * f;
      s.iy += (dy / d) * f;
    }
  }

  // ---------- particles ----------

  private fitStars() {
    const base = Math.min(220, Math.max(70, (this.w * this.h) / 8000));
    const count = Math.round(base * this.cfg.stars);
    while (this.stars.length < count) this.stars.push(this.newStar(true));
    if (this.stars.length > count) this.stars.length = count;
  }

  private newStar(anywhere: boolean): Star {
    const z = 0.15 + Math.pow(Math.random(), 1.5) * 0.85;
    return {
      x: Math.random() * this.w,
      y: anywhere ? Math.random() * this.h : this.h + 10,
      z,
      vx: (Math.random() - 0.5) * 0.1 * z,
      vy: -(0.05 + Math.random() * 0.25) * z,
      ix: 0,
      iy: 0,
      size: 0.5 + z * 1.6,
      phase: Math.random() * Math.PI * 2,
      tint: Math.floor(Math.random() * 3),
    };
  }

  /** one pre-rendered halo per tint: drawImage is much cheaper than a gradient per particle */
  private buildSprites(pal: EnginePalette, key: string) {
    this.sprites = [...pal.stars, pal.meteor].map((color) => {
      const c = makeCanvas(64, 64);
      const g = context<Ctx2D>(c, '2d');
      if (g) {
        const rgb = css(color);
        const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, `rgba(${rgb},1)`);
        grad.addColorStop(0.12, `rgba(${rgb},0.85)`);
        grad.addColorStop(0.35, `rgba(${rgb},0.2)`);
        grad.addColorStop(1, `rgba(${rgb},0)`);
        g.fillStyle = grad;
        g.fillRect(0, 0, 64, 64);
      }
      return c;
    });
    this.spriteKey = key;
  }

  private renderFx(clock: number, k: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const cfg = this.cfg;
    const dark = this.darkMix > 0.5;
    const pal = dark ? cfg.palettes.dark : cfg.palettes.light;
    const key = dark ? 'dark' : 'light';
    if (this.spriteKey !== key) this.buildSprites(pal, key);

    ctx.clearRect(0, 0, this.w, this.h);
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    const strength = dark ? 1 : 0.55;
    const m = this.mouse;

    // spotlight under the cursor: lights the background and shows through glassy UIs
    if (k > 0) {
      const on = m.inside && cfg.spotlight > 0 ? 1 : 0;
      this.spotAlpha += (on - this.spotAlpha) * (1 - Math.pow(0.85, k));
      const follow = 1 - Math.pow(0.55, k);
      m.sx += (m.px - m.sx) * follow;
      m.sy += (m.py - m.sy) * follow;
    }
    if (this.spotAlpha > 0.01 && cfg.spotlight > 0) {
      const a = this.spotAlpha * cfg.spotlight;
      const r = cfg.spotlightRadius;
      const [inner, outer] = pal.spotlight;
      const spot = ctx.createRadialGradient(m.sx, m.sy, 0, m.sx, m.sy, r);
      spot.addColorStop(0, `rgba(${css(inner)},${(dark ? 0.45 : 0.3) * a})`);
      spot.addColorStop(dark ? 0.35 : 0.4, `rgba(${css(outer)},${(dark ? 0.16 : 0.1) * a})`);
      spot.addColorStop(1, `rgba(${css(outer)},0)`);
      ctx.globalAlpha = 1;
      ctx.fillStyle = spot;
      ctx.fillRect(m.sx - r, m.sy - r, r * 2, r * 2);
    }

    // stars: parallax with the light, swirl around the cursor like iron filings
    const par = 46 * cfg.parallax;
    const offX = (m.x - 0.5) * -par;
    const offY = (m.y - 0.5) * par;
    const damp = Math.pow(0.94, k);
    const drift = k * cfg.starSpeed * cfg.speed;
    const swirl = m.inside && k > 0 && cfg.field > 0;
    const reach = cfg.fieldRadius;
    const near = this.near;
    near.length = 0;
    const size = 5 * cfg.starSize;
    const twinkle = cfg.twinkle * 0.45;

    for (const s of this.stars) {
      const x = s.x + offX * s.z;
      const y = s.y + offY * s.z;
      if (swirl) {
        const dx = x - m.px;
        const dy = y - m.py;
        const d2 = dx * dx + dy * dy;
        if (d2 < reach * reach) {
          const d = Math.sqrt(d2) || 1;
          const f = (1 - d / reach) * s.z * k * cfg.field;
          s.ix += ((-dy / d) * 0.32 + (dx / d) * 0.1) * f;
          s.iy += ((dx / d) * 0.32 + (dy / d) * 0.1) * f;
          if (cfg.constellations) near.push({ x, y, d });
        }
      }
      s.ix *= damp;
      s.iy *= damp;
      s.x += s.vx * drift + s.ix * k;
      s.y += s.vy * drift + s.iy * k;
      if (s.y < -20 || s.y > this.h + 20 || s.x < -40 || s.x > this.w + 40) {
        Object.assign(s, this.newStar(false));
      }

      const tw = 1 - twinkle * (1 - Math.sin(this.time * (1.2 + s.z * 1.5) + s.phase));
      const r = s.size * size;
      const alpha = (0.2 + 0.8 * s.z) * tw * strength;
      const sprite = this.sprites[s.tint];
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
      // the nearest stars get a cross flare
      if (cfg.flares && s.z > 0.88) {
        const len = r * 1.8 * tw;
        ctx.globalAlpha = alpha * 0.55;
        ctx.drawImage(sprite, x - len, y - 0.6, len * 2, 1.2);
        ctx.drawImage(sprite, x - 0.6, y - len, 1.2, len * 2);
      }
    }

    // constellation lines around the cursor
    if (near.length) {
      const link = cfg.linkDistance;
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = `rgb(${css(pal.lines)})`;
      for (let i = 0; i < near.length; i++) {
        const a = near[i];
        const fa = 1 - a.d / reach;
        ctx.globalAlpha = fa * 0.35 * strength;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(m.px, m.py);
        ctx.stroke();
        for (let j = i + 1; j < near.length; j++) {
          const b = near[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > link) continue;
          ctx.globalAlpha = (1 - d / link) * fa * 0.7 * strength;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // shooting stars
    if (k > 0 && cfg.meteors > 0 && this.time > this.nextMeteor) {
      this.nextMeteor = this.time + (2.5 + Math.random() * 4.5) / cfg.meteors;
      const dir = Math.random() < 0.5 ? 1 : -1;
      const angle = (0.35 + Math.random() * 0.35) * Math.PI * 0.5;
      const speed = 9 + Math.random() * 7;
      this.meteors.push({
        x: this.w * (0.15 + Math.random() * 0.7),
        y: this.h * Math.random() * 0.35,
        vx: Math.cos(angle) * speed * dir,
        vy: Math.sin(angle) * speed,
        life: 1,
        len: 140 + Math.random() * 180,
      });
    }
    const pace = k * Math.max(0, cfg.speed);
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const me = this.meteors[i];
      me.x += me.vx * pace;
      me.y += me.vy * pace;
      me.life -= 0.013 * pace;
      if (me.life <= 0) {
        this.meteors.splice(i, 1);
        continue;
      }
      const v = Math.hypot(me.vx, me.vy);
      const tx = me.x - (me.vx / v) * me.len;
      const ty = me.y - (me.vy / v) * me.len;
      const head = css(pal.meteor);
      const grad = ctx.createLinearGradient(tx, ty, me.x, me.y);
      grad.addColorStop(0, `rgba(${head},0)`);
      grad.addColorStop(1, `rgba(${head},${0.9 * me.life})`);
      ctx.globalAlpha = strength;
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(me.x, me.y);
      ctx.stroke();
      ctx.globalAlpha = me.life * strength;
      ctx.drawImage(this.sprites[3], me.x - 9, me.y - 9, 18, 18);
    }

    // click rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      const p = (clock - ring.start) / (ring.strong ? 1.1 : 0.9);
      if (p >= 1 || p < 0) {
        this.rings.splice(i, 1);
        continue;
      }
      ctx.strokeStyle = `rgb(${css(pal.lines)})`;
      ctx.globalAlpha = (1 - p) * (ring.strong ? 0.5 : 0.35) * strength;
      ctx.lineWidth = (ring.strong ? 1.8 : 1.2) * (1 - p) + 0.3;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, (1 - Math.pow(1 - p, 3)) * (ring.strong ? 190 : 110), 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this.statFx++;
    this.markReady();
  }
}
