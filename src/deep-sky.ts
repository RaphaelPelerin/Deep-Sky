import workerSource from 'virtual:deep-sky-worker';
import { toRgba } from './color';
import type { EngineEvent, EngineInit, EngineMessage } from './engine/protocol';
import { mergeOptions, normalizeOptions, toEngineConfig } from './options';
import type { DeepSkyInstance, DeepSkyMode, DeepSkyOptions } from './types';

interface Link {
  send(msg: EngineMessage): void;
  destroy(): void;
}

/** @internal how the layer is mounted (used by the custom element) */
export interface MountContext {
  /** where the layer is inserted (default: the container) */
  layerParent?: ParentNode;
  /** clicks outside this element don't trigger the click effect (default: the container) */
  scope?: Element | null;
  /** give the container `position: relative` and `isolation: isolate` when needed (default true) */
  adjust?: boolean;
}

const LAYER = {
  position: 'absolute',
  inset: '0',
  width: '100%',
  height: '100%',
  display: 'block',
};

/**
 * Mounts a deep-sky background inside `container`, behind its content.
 *
 * ```ts
 * const sky = createDeepSky(document.body, { preset: 'aurora' });
 * sky.set({ theme: 'light' });
 * ```
 */
export function createDeepSky(
  container: HTMLElement,
  options: DeepSkyOptions = {},
): DeepSkyInstance {
  return mountDeepSky(container, options, {});
}

/** @internal */
export function mountDeepSky(
  container: HTMLElement,
  options: DeepSkyOptions,
  ctx: MountContext,
): DeepSkyInstance {
  if (typeof window === 'undefined') {
    throw new Error('[deep-sky] createDeepSky() needs a browser: call it after mount.');
  }
  const doc = container.ownerDocument;
  const win = doc.defaultView ?? window;
  const isPage = container === doc.body || container === doc.documentElement;
  const scope = ctx.scope === undefined ? container : ctx.scope;

  let opts = options;
  let r = normalizeOptions(opts);

  // ---------- container ----------

  const restore: (() => void)[] = [];
  const setStyle = (el: HTMLElement, prop: string, value: string) => {
    const prev = el.style.getPropertyValue(prop);
    const priority = el.style.getPropertyPriority(prop);
    el.style.setProperty(prop, value);
    restore.push(() => el.style.setProperty(prop, prev, priority));
  };
  if (ctx.adjust !== false) {
    const cs = win.getComputedStyle(container);
    if (!isPage && cs.position === 'static') setStyle(container, 'position', 'relative');
    // own stacking context: the layer (z-index -1) stays above the container's background
    if (cs.isolation !== 'isolate') setStyle(container, 'isolation', 'isolate');
  }

  // ---------- layers ----------

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, css: Record<string, string>) => {
    const node = doc.createElement(tag);
    for (const [k, v] of Object.entries(css)) node.style.setProperty(k, v);
    return node;
  };
  const newGlCanvas = () =>
    el('canvas', {
      ...LAYER,
      opacity: '0',
      transition: r.intro ? 'opacity 1.2s ease-out' : 'none',
    });

  const root = el('div', {
    inset: '0',
    overflow: 'hidden',
    'pointer-events': 'none',
    'user-select': 'none',
    contain: 'strict',
    transition: 'background-color 0.6s ease',
  });
  root.setAttribute('aria-hidden', 'true');
  root.setAttribute('data-deep-sky', '');
  let glCanvas = newGlCanvas();
  let fxCanvas = el('canvas', LAYER);
  root.append(glCanvas, fxCanvas);
  const parent = ctx.layerParent ?? (container === doc.documentElement ? doc.body : container);
  parent.prepend(root);

  // ---------- state ----------

  const mqDark = win.matchMedia('(prefers-color-scheme: dark)');
  const mqReduce = win.matchMedia('(prefers-reduced-motion: reduce)');
  let paused = false;
  let destroyed = false;
  let mode: DeepSkyMode = 'pending';
  let link: Link | null = null;
  let blobUrl: string | null = null;
  let size: { w: number; h: number; dpr: number } | null = null;
  let rect = { left: 0, top: 0, width: 0, height: 0 };
  let inView = true;
  let pageVisible = doc.visibilityState !== 'hidden';
  let pointerInside = false;
  let fallback: HTMLDivElement | null = null;
  let fallbackAnim: Animation | null = null;
  let resolveReady!: () => void;
  const ready = new Promise<void>((resolve) => (resolveReady = resolve));

  const isDark = () => (r.theme === 'auto' ? mqDark.matches : r.theme === 'dark');
  const isAnimated = () =>
    !paused && (r.animate === 'auto' ? !mqReduce.matches : r.animate !== false);
  const isVisible = () => !r.pauseWhenHidden || (inView && pageVisible);
  const send = (msg: EngineMessage) => link?.send(msg);
  const init = (): EngineInit => ({
    config: toEngineConfig(r),
    dark: isDark(),
    animated: isAnimated(),
    stats: !!opts.onStats,
  });

  // ---------- engine ----------

  const onEvent = (e: EngineEvent) => {
    if (destroyed) return;
    if (e.type === 'ready') {
      glCanvas.style.opacity = '1';
      resolveReady();
    } else if (e.type === 'glFailed') {
      if (mode === 'worker') toMainThread('WebGL is not available in workers');
      else showCss('WebGL is not available');
    } else if (e.type === 'stats') {
      const { type: _, ...stats } = e;
      opts.onStats?.({ ...stats, mode });
    }
  };

  /** the engine starts from scratch: send the current size and visibility */
  const afterLink = () => {
    if (size) send({ type: 'resize', ...size });
    send({ type: 'visible', on: isVisible() });
  };

  const bootWorker = (spec: true | string | URL): Promise<Worker | null> => {
    if (
      typeof Worker === 'undefined' ||
      typeof OffscreenCanvas === 'undefined' ||
      !('transferControlToOffscreen' in glCanvas)
    ) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      let worker: Worker;
      try {
        if (spec === true) {
          blobUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
          worker = new Worker(blobUrl, { name: 'deep-sky' });
        } else {
          worker = new Worker(spec, { name: 'deep-sky' });
        }
      } catch {
        resolve(null);
        return;
      }
      // the worker says hello once its script ran: CSP or network failures never get there
      const done = (ok: boolean) => {
        clearTimeout(timer);
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        if (!ok) worker.terminate();
        resolve(ok ? worker : null);
      };
      const onMessage = (e: MessageEvent<EngineEvent>) => {
        if (e.data?.type === 'boot') done(true);
      };
      const onError = (e: Event) => {
        e.preventDefault();
        done(false);
      };
      const timer = setTimeout(() => done(false), 5000);
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
    });
  };

  const start = async () => {
    const worker = r.worker === false ? null : await bootWorker(r.worker);
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      blobUrl = null;
    }
    if (destroyed) {
      worker?.terminate();
      return;
    }
    if (!worker) {
      if (r.worker !== false) {
        opts.onFallback?.('main-thread', 'Web Workers or OffscreenCanvas are not available');
      }
      await startMainThread();
      return;
    }
    const gl = glCanvas.transferControlToOffscreen();
    const fx = fxCanvas.transferControlToOffscreen();
    worker.addEventListener('message', (e: MessageEvent<EngineEvent>) => onEvent(e.data));
    worker.addEventListener('error', () => toMainThread('the worker crashed'));
    link = { send: (msg) => worker.postMessage(msg), destroy: () => worker.terminate() };
    mode = 'worker';
    const msg: EngineMessage = { type: 'init', gl, fx, ...init() };
    worker.postMessage(msg, [gl, fx]);
    afterLink();
  };

  const startMainThread = async () => {
    const { Engine } = await import('./engine/engine');
    if (destroyed) return;
    mode = 'main-thread';
    const engine = new Engine(glCanvas, fxCanvas, onEvent, init());
    link = { send: (msg) => engine.handle(msg), destroy: () => engine.destroy() };
    afterLink();
  };

  /** canvases already transferred to the worker can't come back: swap in new ones */
  const toMainThread = (reason: string) => {
    if (destroyed || mode !== 'worker') return;
    link?.destroy();
    link = null;
    mode = 'pending';
    const gl = newGlCanvas();
    const fx = el('canvas', LAYER);
    glCanvas.replaceWith(gl);
    fxCanvas.replaceWith(fx);
    glCanvas = gl;
    fxCanvas = fx;
    opts.onFallback?.('main-thread', reason);
    void startMainThread();
  };

  /** no WebGL at all: soft CSS halos instead of the shader (particles keep running) */
  const showCss = (reason: string) => {
    if (mode === 'css') return;
    mode = 'css';
    glCanvas.style.display = 'none';
    fallback = el('div', { position: 'absolute', inset: '-20%', filter: 'blur(40px)' });
    root.prepend(fallback);
    if (typeof fallback.animate === 'function') {
      fallbackAnim = fallback.animate(
        [{ transform: 'none' }, { transform: 'translate(6%, 4%) rotate(8deg)' }],
        { duration: 24000, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' },
      );
    }
    applyDom();
    resolveReady();
    opts.onFallback?.('css', reason);
  };

  // ---------- DOM layers ----------

  const applyDom = () => {
    const p = isDark() ? r.palette.dark : r.palette.light;
    root.style.position = (r.fixed ?? isPage) ? 'fixed' : 'absolute';
    root.style.zIndex = String(r.zIndex);
    root.style.backgroundColor = p.background;
    if (fallback) {
      const [a, b, c] = p.nebula;
      fallback.style.background =
        `radial-gradient(40% 40% at 20% 15%, ${toRgba(a, 0.35)}, transparent 70%), ` +
        `radial-gradient(35% 35% at 85% 45%, ${toRgba(b, 0.3)}, transparent 70%), ` +
        `radial-gradient(35% 35% at 45% 95%, ${toRgba(c, 0.22)}, transparent 70%)`;
      if (isAnimated()) fallbackAnim?.play();
      else fallbackAnim?.pause();
    }
  };

  // ---------- size & pointer ----------

  const measure = () => {
    const b = root.getBoundingClientRect();
    rect = { left: b.left, top: b.top, width: b.width, height: b.height };
  };
  const resize = () => {
    measure();
    const dpr = Math.min(r.quality.maxDpr, win.devicePixelRatio || 1);
    if (size && size.w === rect.width && size.h === rect.height && size.dpr === dpr) return;
    size = { w: rect.width, h: rect.height, dpr };
    send({ type: 'resize', ...size });
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(root);

  // device pixel ratio changes (zoom, moving the window to another screen)
  let dprQuery: MediaQueryList | null = null;
  const onDpr = () => {
    resize();
    watchDpr();
  };
  const watchDpr = () => {
    dprQuery?.removeEventListener('change', onDpr);
    dprQuery = win.matchMedia(`(resolution: ${win.devicePixelRatio || 1}dppx)`);
    dprQuery.addEventListener('change', onDpr);
  };
  watchDpr();

  let scrollFrame = 0;
  const onScroll = () => {
    if (scrollFrame) return;
    scrollFrame = win.requestAnimationFrame(() => {
      scrollFrame = 0;
      measure();
    });
  };

  const inRect = (x: number, y: number) =>
    x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
  const onMove = (e: PointerEvent) => {
    if (!r.cursor.enabled) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const inside = inRect(x, y);
    if (inside) send({ type: 'pointer', x, y, inside: true });
    else if (pointerInside) send({ type: 'pointer', x: 0, y: 0, inside: false });
    pointerInside = inside;
  };
  const onLeave = () => {
    if (!pointerInside) return;
    pointerInside = false;
    send({ type: 'pointer', x: 0, y: 0, inside: false });
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerType === 'touch') onLeave();
  };
  const ignored = (target: Element) => {
    try {
      return !!r.clickIgnore && !!target.closest(r.clickIgnore);
    } catch {
      return false;
    }
  };
  const onDown = (e: PointerEvent) => {
    if (r.click === 'none' || !e.isPrimary || e.button > 0) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (!inRect(x, y)) return;
    const target = e.target as Element | null;
    if (target?.closest) {
      if (ignored(target)) return;
      if (!isPage && scope && !scope.contains(target)) return;
    }
    send({ type: 'click', x, y });
  };

  // ---------- visibility, preferences, page load ----------

  const sendState = () => {
    send({ type: 'visible', on: isVisible() });
  };
  const intersection =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((entries) => {
          inView = entries[entries.length - 1].isIntersecting;
          sendState();
        });
  intersection?.observe(root);
  const onVisibility = () => {
    pageVisible = doc.visibilityState !== 'hidden';
    sendState();
  };
  const onScheme = () => {
    if (r.theme !== 'auto') return;
    send({ type: 'theme', dark: isDark() });
    applyDom();
  };
  const onMotion = () => {
    if (r.animate !== 'auto') return;
    send({ type: 'animated', on: isAnimated() });
    applyDom();
  };

  // a long task on the main thread (big render, heavy response…): back off for a moment
  let longTasks: PerformanceObserver | null = null;
  const watchLongTasks = () => {
    if (!r.yieldToPage) {
      longTasks?.disconnect();
      longTasks = null;
      return;
    }
    if (
      longTasks ||
      typeof PerformanceObserver === 'undefined' ||
      !PerformanceObserver.supportedEntryTypes?.includes('longtask')
    ) {
      return;
    }
    let lastBusy = 0;
    longTasks = new PerformanceObserver(() => {
      const now = performance.now();
      if (now - lastBusy < 500) return;
      lastBusy = now;
      send({ type: 'busy' });
    });
    longTasks.observe({ type: 'longtask' });
  };

  const listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [
    [win, 'pointermove', onMove as EventListener, { passive: true }],
    [win, 'pointerdown', onDown as EventListener, { passive: true }],
    [win, 'pointerup', onUp as EventListener, { passive: true }],
    [win, 'pointercancel', onUp as EventListener, { passive: true }],
    [win, 'blur', onLeave],
    [win, 'scroll', onScroll, { passive: true, capture: true }],
    [doc.documentElement, 'mouseleave', onLeave],
    [doc, 'visibilitychange', onVisibility],
    [mqDark, 'change', onScheme],
    [mqReduce, 'change', onMotion],
  ];
  for (const [target, type, fn, o] of listeners) target.addEventListener(type, fn, o);

  // ---------- public API ----------

  const set = (next: DeepSkyOptions, replace = false) => {
    if (destroyed) return;
    const hadStats = !!opts.onStats;
    opts = replace ? { ...next } : mergeOptions(opts, next);
    r = normalizeOptions(opts);
    send({ type: 'config', config: toEngineConfig(r) });
    send({ type: 'theme', dark: isDark() });
    send({ type: 'animated', on: isAnimated() });
    send({ type: 'visible', on: isVisible() });
    if (!!opts.onStats !== hadStats) send({ type: 'stats', on: !!opts.onStats });
    if (!r.cursor.enabled) onLeave();
    watchLongTasks();
    resize();
    applyDom();
  };

  const setPaused = (value: boolean) => {
    paused = value;
    send({ type: 'animated', on: isAnimated() });
    applyDom();
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    link?.destroy();
    link = null;
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    resizeObserver.disconnect();
    intersection?.disconnect();
    longTasks?.disconnect();
    dprQuery?.removeEventListener('change', onDpr);
    for (const [target, type, fn, o] of listeners) target.removeEventListener(type, fn, o);
    if (scrollFrame) win.cancelAnimationFrame(scrollFrame);
    fallbackAnim?.cancel();
    root.remove();
    for (const undo of restore.reverse()) undo();
    resolveReady();
  };

  applyDom();
  watchLongTasks();
  void start();

  return {
    get element() {
      return root;
    },
    get mode() {
      return mode;
    },
    get options() {
      return opts;
    },
    ready,
    set,
    pulse: () => send({ type: 'pulse' }),
    burst: (x, y, effect) =>
      send({ type: 'click', x, y, effect: effect ?? (r.click === 'ring' ? 'ring' : 'shockwave') }),
    play: () => setPaused(false),
    pause: () => setPaused(true),
    destroy,
  };
}
