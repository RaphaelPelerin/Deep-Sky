import type {
  EngineEvent,
  EngineModel,
  ModelAsset,
  ModelFrame,
  ModelLayerApi,
  RGB,
} from '../engine/protocol';
import { normalize, shape, unweld, type MeshData } from './geometry';
import { parseGltf } from './gltf';
import {
  compose,
  normalMatrix,
  perspective,
  quatEuler,
  quatIntegrate,
  quatMultiply,
  type Quat,
  type Vec3,
} from './math';
import { BLUR_FRAG, BRIGHT_FRAG, COMPOSITE_FRAG, POST_VERT, SCENE_FRAG, SCENE_VERT } from './shaders';

/**
 * The 3D layer: models rendered with WebGL 2 (4× MSAA, HDR when the GPU allows it, bloom and
 * light shafts), lit by the sky. It shares the engine's thread and clock: the engine hands it
 * the shader frame (reflected and refracted), the roaming light, the shockwaves and the palette.
 */

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type GL = WebGL2RenderingContext;

/** camera: vertical field of view, distance to the models, distance to the roaming light */
const FOV = (30 * Math.PI) / 180;
const TAN = Math.tan(FOV / 2);
const DEPTH = 8;
const LIGHT_DEPTH = DEPTH - 2.6;
/** seconds to materialize */
const APPEAR = 1.8;

const MODE = { auto: 0, chrome: 1, glass: 2, hologram: 3, iridescent: 4, wire: 5, nebula: 6 };

interface Geometry {
  vao: WebGLVertexArrayObject;
  count: number;
  indexed: boolean;
}

interface Prim {
  mesh: MeshData;
  geo: Geometry | null;
  wire: Geometry | null;
}

interface Asset {
  prims: Prim[];
  images: (ImageBitmap | null)[];
  textures: (WebGLTexture | null)[] | null;
  /** built-in shapes default to chrome, and have a low-poly version for the wireframe */
  shape: string | null;
  lowPoly: Prim[] | null;
}

interface Instance {
  cfg: EngineModel;
  /** turned by the spin and the shockwaves */
  q: Quat;
  /** angular velocity from shockwaves, rad/s */
  w: Vec3;
  yaw: number;
  pitch: number;
  /** scale spring, kicked by shockwaves */
  pop: number;
  popV: number;
  /** 0 → 1 while it materializes; it advances per frame, so a slow first frame skips nothing */
  appear: number;
  phase: number;
  hits: { at: number; axis: Vec3; force: number }[];
}

interface Target {
  tex: WebGLTexture;
  fb: WebGLFramebuffer;
  w: number;
  h: number;
}

interface Targets {
  w: number;
  h: number;
  msaa: WebGLFramebuffer;
  buffers: WebGLRenderbuffer[];
  scene: Target;
  bloom: [Target, Target];
  wide: [Target, Target];
}

type Program = { p: WebGLProgram; u: (name: string) => WebGLUniformLocation | null };

const decode = (c: readonly number[]): RGB => [c[0] * c[0], c[1] * c[1], c[2] * c[2]];

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

export class ModelLayer implements ModelLayerApi {
  private gl: GL | null = null;
  private off: OffscreenCanvas | null = null;
  private view: ImageBitmapRenderingContext | null = null;
  private scene!: Program;
  private bright!: Program;
  private blur!: Program;
  private composite!: Program;
  private white: WebGLTexture | null = null;
  private sky: WebGLTexture | null = null;
  private empty: WebGLVertexArrayObject | null = null;
  private hdr = false;
  private targets: Targets | null = null;
  private failed = false;
  private readonly assets = new Map<string, Asset | 'loading' | Error>();
  private instances: Instance[] = [];
  private readonly seen = new Map<number, number>();
  private w = 1;
  private h = 1;
  private dpr = 1;
  private last = NaN;
  private drawn = false;
  onChange?: () => void;

  constructor(
    private readonly canvas: AnyCanvas,
    private readonly emit: (event: EngineEvent) => void,
  ) {
    if (!this.init()) this.fail('WebGL 2 is not available for the 3D layer');
  }

  get active() {
    return !this.failed && this.instances.length > 0;
  }

  // ---------- setup ----------

  private fail(message: string) {
    this.failed = true;
    this.gl = null;
    this.emit({ type: 'modelError', key: '*', message });
  }

  private init(): boolean {
    const attrs: WebGLContextAttributes = {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    };
    let gl: GL | null = null;
    // same presentation path as the sky: an internal canvas, shown as a bitmap
    if (typeof OffscreenCanvas !== 'undefined') {
      const off = new OffscreenCanvas(1, 1);
      gl = context<GL>(off, 'webgl2', attrs);
      const view = gl ? context<ImageBitmapRenderingContext>(this.canvas, 'bitmaprenderer') : null;
      if (gl && view) {
        this.off = off;
        this.view = view;
      } else {
        gl = null;
      }
    }
    gl ??= context<GL>(this.canvas, 'webgl2', attrs);
    if (!gl) return false;
    const target = (this.off ?? this.canvas) as unknown as EventTarget;
    target.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.gl = null;
    });
    target.addEventListener('webglcontextrestored', () => {
      this.gl = gl;
      this.targets = null;
      for (const a of this.assets.values()) {
        if (typeof a !== 'object' || a instanceof Error) continue;
        a.textures = null;
        for (const p of [...a.prims, ...(a.lowPoly ?? [])]) p.geo = p.wire = null;
      }
      if (!this.setup()) this.fail('the 3D layer could not restart');
    });
    this.gl = gl;
    return this.setup();
  }

  private program(vs: string, fs: string): Program {
    const gl = this.gl!;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
        throw new Error(gl.getShaderInfoLog(s) ?? 'shader error');
      }
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) {
      throw new Error(gl.getProgramInfoLog(p) ?? 'link error');
    }
    const cache = new Map<string, WebGLUniformLocation | null>();
    return {
      p,
      u: (name) => {
        if (!cache.has(name)) cache.set(name, gl.getUniformLocation(p, name));
        return cache.get(name)!;
      },
    };
  }

  private setup(): boolean {
    const gl = this.gl!;
    try {
      this.scene = this.program(SCENE_VERT, SCENE_FRAG);
      this.bright = this.program(POST_VERT, BRIGHT_FRAG);
      this.blur = this.program(POST_VERT, BLUR_FRAG);
      this.composite = this.program(POST_VERT, COMPOSITE_FRAG);
    } catch (e) {
      console.warn('[deep-sky]', e);
      return false;
    }
    gl.useProgram(this.scene.p);
    ['uBackdrop', 'uBaseTex', 'uMrTex', 'uNormalTex', 'uEmissiveTex', 'uOccTex'].forEach((name, i) =>
      gl.uniform1i(this.scene.u(name), i),
    );
    gl.useProgram(this.composite.p);
    ['uScene', 'uBloom', 'uBloomWide'].forEach((name, i) => gl.uniform1i(this.composite.u(name), i));

    const pixel = (rgba: number[]) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(rgba));
      return t;
    };
    this.white = pixel([255, 255, 255, 255]);
    this.sky = pixel([8, 10, 24, 255]);
    this.empty = gl.createVertexArray();
    this.hdr = !!(gl.getExtension('EXT_color_buffer_float') ?? gl.getExtension('EXT_color_buffer_half_float'));
    return true;
  }

  // ---------- assets ----------

  configure(models: EngineModel[]) {
    const prev = this.instances;
    this.instances = models.map((cfg, i) => {
      const old = prev[i];
      if (old && old.cfg.key === cfg.key) {
        old.cfg = cfg;
        return old;
      }
      return {
        cfg,
        q: [0, 0, 0, 1],
        w: [0, 0, 0],
        yaw: 0,
        pitch: 0,
        pop: 0,
        popV: 0,
        appear: 0,
        phase: Math.random() * 10,
        hits: [],
      };
    });
    for (const { key } of models) {
      if (!key.startsWith('shape:') || this.assets.has(key)) continue;
      const meshes = shape(key.slice(6));
      normalize(meshes);
      this.assets.set(key, {
        prims: meshes.map((mesh) => ({ mesh, geo: null, wire: null })),
        images: [],
        textures: null,
        shape: key.slice(6),
        lowPoly: null,
      });
    }
  }

  load(key: string, asset: ModelAsset) {
    if (this.assets.has(key)) return;
    this.assets.set(key, 'loading');
    let meshes: MeshData[];
    try {
      meshes = parseGltf(asset);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      this.assets.set(key, error);
      this.emit({ type: 'modelError', key, message: error.message });
      return;
    }
    // textures decode off the render loop; the model appears once they are ready
    void Promise.all(
      asset.images.map((img) =>
        img && typeof createImageBitmap === 'function'
          ? createImageBitmap(new Blob([img.data], { type: img.type }), {
              premultiplyAlpha: 'none',
              colorSpaceConversion: 'none',
            }).catch(() => null)
          : null,
      ),
    ).then((images) => {
      this.assets.set(key, {
        prims: meshes.map((mesh) => ({ mesh, geo: null, wire: null })),
        images,
        textures: null,
        shape: null,
        lowPoly: null,
      });
      this.onChange?.();
    });
  }

  resize(w: number, h: number, dpr: number) {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.dpr = dpr;
  }

  backdrop(source: TexImageSource) {
    const gl = this.gl;
    if (!gl || !this.active) return;
    gl.bindTexture(gl.TEXTURE_2D, this.sky);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  destroy() {
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null;
    this.failed = true;
  }

  // ---------- GPU resources ----------

  private upload(data: {
    positions: Float32Array;
    normals: Float32Array;
    uvs: Float32Array | null;
    colors: Float32Array | null;
    bary?: Float32Array;
    indices?: Uint32Array | null;
  }): Geometry {
    const gl = this.gl!;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const attr = (loc: number, arr: Float32Array | null | undefined, size: number) => {
      if (!arr) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    attr(0, data.positions, 3);
    attr(1, data.normals, 3);
    attr(2, data.uvs, 2);
    attr(3, data.colors, 4);
    attr(4, data.bary, 3);
    if (data.indices) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);
    }
    gl.bindVertexArray(null);
    return {
      vao,
      count: data.indices ? data.indices.length : data.positions.length / 3,
      indexed: !!data.indices,
    };
  }

  private textures(asset: Asset): (WebGLTexture | null)[] {
    if (asset.textures) return asset.textures;
    const gl = this.gl!;
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    asset.textures = asset.images.map((img) => {
      if (!img) return null;
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
      return t;
    });
    return asset.textures;
  }

  private renderTargets(w: number, h: number): Targets | null {
    const gl = this.gl!;
    const t = this.targets;
    if (t && t.w === w && t.h === h) return t;
    if (t) {
      gl.deleteFramebuffer(t.msaa);
      for (const b of t.buffers) gl.deleteRenderbuffer(b);
      for (const x of [t.scene, ...t.bloom, ...t.wide]) {
        gl.deleteTexture(x.tex);
        gl.deleteFramebuffer(x.fb);
      }
      this.targets = null;
    }
    const build = (hdr: boolean): Targets | null => {
      const fmt = hdr ? gl.RGBA16F : gl.RGBA8;
      const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) as number);
      const msaa = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, msaa);
      const color = gl.createRenderbuffer()!;
      gl.bindRenderbuffer(gl.RENDERBUFFER, color);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, fmt, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
      const depth = gl.createRenderbuffer()!;
      gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
      let ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      const target = (tw: number, th: number): Target => {
        const tex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, fmt, tw, th, 0, gl.RGBA, hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const fb = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        ok &&= gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        return { tex, fb, w: tw, h: th };
      };
      const q = (d: number) => [Math.max(1, Math.round(w / d)), Math.max(1, Math.round(h / d))] as const;
      const result: Targets = {
        w,
        h,
        msaa,
        buffers: [color, depth],
        scene: target(w, h),
        bloom: [target(...q(4)), target(...q(4))],
        wide: [target(...q(8)), target(...q(8))],
      };
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return ok ? result : null;
    };
    this.targets = (this.hdr && build(true)) || build(false);
    if (!this.targets && this.hdr) this.hdr = false;
    return this.targets;
  }

  // ---------- frame ----------

  private ready(key: string): Asset | null {
    const a = this.assets.get(key);
    return a && typeof a === 'object' && !(a instanceof Error) ? a : null;
  }

  /** new shockwaves: each model gets a kick when the ring reaches it */
  private shockwaves(f: ModelFrame, aspect: number) {
    const r = f.ripples;
    for (let i = 0; i < 4; i++) {
      const [x, y, start, strength] = [r[i * 4], r[i * 4 + 1], r[i * 4 + 2], r[i * 4 + 3]];
      if (strength <= 0 || this.seen.has(start)) continue;
      this.seen.set(start, f.clock);
      for (const inst of this.instances) {
        const dx = (inst.cfg.x - x) * aspect;
        const dy = 1 - inst.cfg.y - y;
        const d = Math.hypot(dx, dy) || 1e-3;
        const force = inst.cfg.react * strength * Math.max(0.15, 1 - d * 0.9);
        inst.hits.push({ at: start + d / 0.85, axis: [-dy / d, dx / d, 0], force });
      }
    }
    for (const [start, at] of this.seen) if (f.clock - at > 5) this.seen.delete(start);
  }

  private step(inst: Instance, f: ModelFrame, dt: number) {
    const c = inst.cfg;
    for (let i = inst.hits.length - 1; i >= 0; i--) {
      const hit = inst.hits[i];
      if (f.clock < hit.at) continue;
      inst.hits.splice(i, 1);
      for (let k = 0; k < 3; k++) inst.w[k] += hit.axis[k] * hit.force * 3.4;
      inst.popV += hit.force * 2.2;
    }
    inst.q = quatIntegrate(inst.q, [inst.w[0], inst.w[1] + c.spin, inst.w[2]], dt);
    const damp = Math.exp(-dt * 1.3);
    for (let k = 0; k < 3; k++) inst.w[k] *= damp;
    inst.popV += (-inst.pop * 70 - inst.popV * 6) * dt;
    inst.pop += inst.popV * dt;
    // turns towards the light (the cursor)
    const ease = 1 - Math.exp(-dt * 3);
    inst.yaw += ((f.light[0] - c.x) * c.follow * 1.2 - inst.yaw) * ease;
    inst.pitch += ((1 - c.y - f.light[1]) * c.follow * 0.9 - inst.pitch) * ease;
  }

  render(f: ModelFrame) {
    const gl = this.gl;
    if (!gl || this.failed) return;
    const W = Math.max(1, Math.round(this.w * this.dpr));
    const H = Math.max(1, Math.round(this.h * this.dpr));
    const surface = this.off ?? this.canvas;
    if (surface.width !== W || surface.height !== H) {
      surface.width = W;
      surface.height = H;
      if (this.off) {
        this.canvas.width = W;
        this.canvas.height = H;
      }
    }
    const visible = this.instances.filter((i) => this.ready(i.cfg.key));
    if (!visible.length) {
      if (this.drawn) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, W, H);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        this.present();
        this.drawn = false;
      }
      return;
    }
    const t = this.renderTargets(W, H);
    if (!t) {
      this.fail('the 3D layer has no usable render target');
      return;
    }
    const aspect = this.w / this.h;
    const dt = Number.isNaN(this.last) ? 0 : Math.min(0.1, Math.max(0, f.clock - this.last));
    this.last = f.clock;
    this.shockwaves(f, aspect);

    // ---------- scene ----------
    const s = this.scene;
    const p = f.palette;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.msaa);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(s.p);
    gl.uniformMatrix4fv(s.u('uProj'), false, perspective(FOV, aspect, 0.1, 50));
    gl.uniform4f(s.u('uScreen'), W, H, f.time, f.clock);
    gl.uniform4fv(s.u('uRipples'), f.ripples);
    gl.uniform4f(s.u('uLights'), f.sweepAt, f.dark, f.glow, 1);
    const lh = TAN * LIGHT_DEPTH;
    gl.uniform3f(s.u('uLightPos'), (f.light[0] * 2 - 1) * lh * aspect, (f.light[1] * 2 - 1) * lh, -LIGHT_DEPTH);
    gl.uniform3fv(s.u('uBg'), decode(p.background));
    p.nebula.forEach((c, i) => gl.uniform3fv(s.u(`uNeb${i}`), decode(c)));
    gl.uniform3fv(s.u('uAur0'), decode(p.aurora[0]));
    gl.uniform3fv(s.u('uAur1'), decode(p.aurora[1]));
    gl.uniform3fv(s.u('uGlow'), decode(p.glow));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sky);

    const halfH = TAN * DEPTH;
    let bloom = 0;
    let shafts = 0;
    const later: (() => void)[] = [];
    for (const inst of visible) {
      const asset = this.ready(inst.cfg.key)!;
      const c = inst.cfg;
      if (f.animated) this.step(inst, f, dt);
      inst.appear = f.animated ? Math.min(1, inst.appear + Math.min(dt, 1 / 30) / APPEAR) : 1;
      const appear = inst.appear;
      const size = c.size * 2 * halfH * (1 + inst.pop * 0.12);
      const bob = f.animated ? Math.sin(f.time * 0.9 + inst.phase) * 0.035 * c.float * size : 0;
      const roll = f.animated ? Math.sin(f.time * 0.6 + inst.phase) * 0.07 * c.float : 0;
      const q = quatMultiply(
        quatEuler(inst.pitch, inst.yaw, roll),
        quatMultiply(inst.q, quatEuler(c.rotation[0], c.rotation[1], c.rotation[2])),
      );
      const model = compose(
        q,
        [(c.x * 2 - 1) * halfH * aspect, (1 - 2 * c.y) * halfH + bob, -DEPTH],
        [size, size, size],
      );
      bloom = Math.max(bloom, c.glow);
      shafts = Math.max(shafts, c.rays);
      const mode = c.material === MODE.auto && asset.shape ? MODE.chrome : c.material;
      const textures = this.textures(asset);
      let prims = asset.prims;
      if (mode === MODE.wire && asset.shape) {
        if (!asset.lowPoly) {
          const low = shape(asset.shape, true);
          normalize(low);
          asset.lowPoly = low.map((mesh) => ({ mesh, geo: null, wire: null }));
        }
        prims = asset.lowPoly;
      }
      for (const prim of prims) {
        const draw = () => this.drawPrim(prim, inst, mode, model, appear, textures, f);
        const m = prim.mesh.material;
        const translucent =
          mode === MODE.hologram || mode === MODE.wire || c.opacity < 1 || (mode === MODE.auto && m.alphaMode === 2);
        if (translucent) later.push(draw);
        else draw();
      }
    }
    // see-through surfaces last, without hiding each other
    gl.depthMask(false);
    for (const draw of later) draw();
    gl.depthMask(true);
    gl.bindVertexArray(null);

    // ---------- post ----------
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, t.msaa);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, t.scene.fb);
    gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    const pass = (prog: Program, src: Target, dst: Target | null, set: () => void) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null);
      gl.viewport(0, 0, dst ? dst.w : W, dst ? dst.h : H);
      gl.useProgram(prog.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      set();
      gl.bindVertexArray(this.empty);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const [b0, b1] = t.bloom;
    const [w0, w1] = t.wide;
    pass(this.bright, t.scene, b0, () => gl.uniform2f(this.bright.u('uTexel'), 1 / W, 1 / H));
    const blur = (src: Target, dst: Target, x: number, y: number) =>
      pass(this.blur, src, dst, () => gl.uniform2f(this.blur.u('uDir'), x / src.w, y / src.h));
    blur(b0, b1, 1, 0);
    blur(b1, b0, 0, 1);
    blur(b0, w1, 2, 0);
    blur(w1, w0, 0, 1);
    blur(w0, w1, 1.5, 0);
    blur(w1, w0, 0, 1.5);
    const glowScale = 0.35 + 0.65 * f.dark;
    pass(this.composite, t.scene, null, () => {
      const u = this.composite.u;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, b0.tex);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, w0.tex);
      gl.uniform4f(u('uPost'), bloom * glowScale, shafts * glowScale, 1, 0);
      gl.uniform2f(u('uLight'), f.light[0], f.light[1]);
    });
    this.present();
    this.drawn = true;
  }

  private drawPrim(
    prim: Prim,
    inst: Instance,
    mode: number,
    model: Float32Array,
    appear: number,
    textures: (WebGLTexture | null)[],
    f: ModelFrame,
  ) {
    const gl = this.gl!;
    const s = this.scene;
    const c = inst.cfg;
    const m = prim.mesh.material;
    let base: [number, number, number, number] = [...m.base];
    let metal = m.metallic;
    let rough = m.roughness;
    let emissive: [number, number, number, number] = [0, 0, 0, -1];
    const color = c.color && decode(c.color);
    // which of the file's maps this surface keeps: base color, metal-rough, normal, emissive
    let maps = [false, false, true, false];
    switch (mode) {
      case MODE.auto:
        if (color) base = [base[0] * color[0], base[1] * color[1], base[2] * color[2], base[3]];
        emissive = [...m.emissive, m.alphaMode === 1 ? m.alphaCutoff : -1];
        maps = [true, true, true, true];
        break;
      case MODE.chrome:
        base = [...(color ?? [0.92, 0.93, 0.96]), 1];
        metal = 1;
        rough = 0.06;
        break;
      case MODE.iridescent:
        base = [...(color ?? [0.7, 0.7, 0.75]), 1];
        metal = 1;
        rough = 0.16;
        break;
      case MODE.hologram:
        base = color ? [...color, 1] : [-1, -1, -1, 1];
        maps = [false, false, false, false];
        break;
      case MODE.wire:
        base = [...(color ?? decode(f.palette.grid)), 1];
        maps = [false, false, false, false];
        break;
      default:
        base = [...(color ?? [1, 1, 1]), 1];
        maps = [false, false, mode !== MODE.glass, false];
    }
    const tex = (unit: number, index: number, use: boolean) => {
      const t = use && index >= 0 ? textures[index] : null;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t ?? this.white);
      return t ? 1 : 0;
    };
    const has = [
      tex(1, m.baseTex, maps[0]),
      tex(2, m.mrTex, maps[1]),
      tex(3, m.normalTex, maps[2]),
      tex(4, m.emissiveTex, maps[3]),
    ];
    const occ = tex(5, m.occlusionTex, mode === MODE.auto);

    gl.uniformMatrix4fv(s.u('uModel'), false, model);
    gl.uniformMatrix3fv(s.u('uNormalMat'), false, normalMatrix(model));
    gl.uniform4f(s.u('uMat'), mode, metal, rough, c.opacity);
    gl.uniform4fv(s.u('uBase'), base);
    gl.uniform4fv(s.u('uEmissive'), emissive);
    gl.uniform4f(s.u('uFx'), appear, c.morph, c.react, mode === MODE.hologram ? 0.5 : 0);
    gl.uniform4fv(s.u('uTex'), has);
    gl.uniform1f(s.u('uHasOcc'), occ);

    let geo: Geometry;
    if (mode === MODE.wire) {
      prim.wire ??= this.upload(unweld(prim.mesh));
      geo = prim.wire;
    } else {
      prim.geo ??= this.upload(prim.mesh);
      geo = prim.geo;
      gl.vertexAttrib3f(4, 1, 1, 1);
    }
    gl.bindVertexArray(geo.vao);
    // attributes the mesh doesn't have: constant values
    if (!prim.mesh.uvs) gl.vertexAttrib2f(2, 0, 0);
    if (!prim.mesh.colors) gl.vertexAttrib4f(3, 1, 1, 1, 1);
    if (geo.indexed) gl.drawElements(gl.TRIANGLES, geo.count, gl.UNSIGNED_INT, 0);
    else gl.drawArrays(gl.TRIANGLES, 0, geo.count);
  }

  private present() {
    if (this.off && this.view) this.view.transferFromImageBitmap(this.off.transferToImageBitmap());
  }
}
