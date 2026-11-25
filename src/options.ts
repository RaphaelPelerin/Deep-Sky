import { parseColor, toOklab } from './color';
import { MATERIALS, SHAPES, type EngineConfig, type EnginePalette, type RGB } from './engine/protocol';
import { presets } from './presets';
import type {
  Color,
  MeshLayout,
  MeshPoint,
  ModelOptions,
  Palette,
  PaletteOverrides,
  QualityOptions,
  QualityPreset,
  ResolvedModel,
  ResolvedOptions,
  DeepSkyOptions,
  DeepSkyPreset,
} from './types';

/** clicks on these never trigger the click effect */
export const DEFAULT_CLICK_IGNORE =
  'a, button, input, select, textarea, label, summary, [role="button"], [role="link"], ' +
  '[contenteditable]:not([contenteditable="false"]), [data-deep-sky-ignore]';

export const qualities: Record<QualityPreset, Required<QualityOptions>> = {
  low: { scale: 0.35, minScale: 0.2, fps: 24, maxDpr: 1, adaptive: true },
  medium: { scale: 0.5, minScale: 0.2, fps: 30, maxDpr: 1.5, adaptive: true },
  high: { scale: 0.75, minScale: 0.3, fps: 60, maxDpr: 2, adaptive: true },
  ultra: { scale: 1, minScale: 0.4, fps: 60, maxDpr: 2, adaptive: false },
};

type Defaults = Omit<ResolvedOptions, 'preset' | 'palette' | 'quality' | 'fixed'> & {
  quality: QualityPreset;
};

/** values used when neither the options nor the preset set them */
export const defaults: Defaults = {
  theme: 'dark',
  speed: 1,
  animate: 'auto',
  intro: true,
  nebula: { enabled: true, intensity: 1, scale: 1, shimmer: 0.22 },
  mesh: { enabled: false, intensity: 1, layout: 'diagonal', softness: 1, drift: 1, flow: 1, silk: 0.5, depth: 1 },
  sun: { enabled: false, intensity: 1, x: 0.5, y: 0.6, size: 0.24, halo: 1 },
  clouds: { enabled: false, intensity: 0.9, cover: 0.5, scale: 1, speed: 1 },
  sea: { enabled: false, level: 0.26, waves: 1, glints: 1 },
  daylight: { enabled: true, contrast: 1, sheen: 1, bokeh: 1, split: 0 },
  aurora: {
    enabled: true,
    intensity: 1,
    position: 0.7,
    height: 1,
    speed: 1,
    waves: 1,
    curtains: 3,
    streaks: 1,
    tilt: 0,
    edge: 1,
  },
  rays: { enabled: true, intensity: 1, spread: 1 },
  glow: { enabled: true, intensity: 1, lens: 1 },
  stars: { enabled: true, density: 1, size: 1, twinkle: 1, parallax: 1, flares: true, speed: 1 },
  meteors: { enabled: true, frequency: 1 },
  grid: { enabled: true, size: 64, speed: 1, height: 0.55, tilt: 64, opacity: 0.9 },
  cursor: {
    enabled: true,
    spotlight: 1,
    spotlightRadius: 280,
    field: 1,
    fieldRadius: 170,
    constellations: true,
    linkDistance: 105,
  },
  click: 'shockwave',
  clickIgnore: DEFAULT_CLICK_IGNORE,
  grain: 0.02,
  vignette: 0.6,
  models: [],
  quality: 'medium',
  worker: true,
  zIndex: -1,
  pauseWhenHidden: true,
  yieldToPage: true,
};

/** a model's settings when neither it nor the preset sets them */
export const modelDefaults: Omit<ResolvedModel, 'src'> = {
  material: 'auto',
  color: null,
  anchor: null,
  x: 0.5,
  y: 0.5,
  size: 0.5,
  rotation: [0, 0, 0],
  spin: 18,
  float: 1,
  follow: 0.35,
  react: 1,
  morph: 0,
  glow: 1,
  rays: 0.6,
  opacity: 1,
  reveal: 1,
};

/** where the colors of each mesh layout sit: x, y from the top, reach */
export const meshLayouts: Record<MeshLayout, Required<MeshPoint>[]> = {
  diagonal: [
    { x: 0, y: 0.06, size: 1.05 },
    { x: 0.14, y: 0.68, size: 0.95 },
    { x: 0.46, y: 0.42, size: 0.75 },
    { x: 1, y: 0.2, size: 1.05 },
    { x: 0.86, y: 1.02, size: 1 },
    { x: 0.66, y: 0.62, size: 0.75 },
  ],
  horizon: [
    { x: 0.24, y: 1.06, size: 1.05 },
    { x: 0.82, y: 1, size: 1 },
    { x: 0.3, y: 0.62, size: 0.9 },
    { x: 0.82, y: 0.54, size: 0.9 },
    { x: 0.2, y: 0.02, size: 1.1 },
    { x: 0.8, y: -0.02, size: 1.1 },
  ],
  coast: [
    { x: 0.22, y: 0.78, size: 0.85 },
    { x: 0.82, y: 0.76, size: 0.85 },
    { x: 0.18, y: 0.42, size: 0.85 },
    { x: 0.84, y: 0.44, size: 0.85 },
    { x: 0.2, y: -0.06, size: 1.05 },
    { x: 0.82, y: -0.1, size: 1.05 },
  ],
  bloom: [
    { x: 0.5, y: 0.56, size: 0.85 },
    { x: 0.16, y: 0.3, size: 0.95 },
    { x: 0.84, y: 0.32, size: 0.95 },
    { x: 0.1, y: 1, size: 0.95 },
    { x: 0.9, y: 1, size: 0.95 },
    { x: 0.5, y: -0.06, size: 0.9 },
  ],
  corners: [
    { x: 0, y: 0, size: 1.05 },
    { x: 1, y: 0.04, size: 1.05 },
    { x: 1, y: 1, size: 1.05 },
    { x: 0, y: 0.96, size: 1.05 },
    { x: 0.36, y: 0.5, size: 0.8 },
    { x: 0.68, y: 0.48, size: 0.8 },
  ],
};

/** the colors of a palette's mesh */
export function meshColors(p: Palette): Color[] {
  return p.mesh && p.mesh.length > 1 ? p.mesh.slice(0, 6) : [p.nebula[0], p.nebula[1], p.nebula[2], p.nebula[3], p.aurora[0], p.aurora[1]];
}

function resolveModels(value: DeepSkyOptions['models']): ResolvedModel[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list
    .map((m): ModelOptions => (typeof m === 'string' ? { src: m } : m))
    .filter((m) => m && m.src !== undefined && m.src !== null && m.src !== '')
    .map((m) => {
      const out: ResolvedModel = { ...modelDefaults, ...defined(m), src: m.src };
      out.rotation = [0, 1, 2].map((i) => m.rotation?.[i] ?? 0) as [number, number, number];
      return out;
    });
}

const bufferIds = new WeakMap<ArrayBuffer, number>();
let nextBuffer = 1;

/** identifies a model's source across updates: built-in shapes, URLs, buffers */
export function modelKey(src: ModelOptions['src']): string {
  if (src instanceof ArrayBuffer) {
    let id = bufferIds.get(src);
    if (id === undefined) bufferIds.set(src, (id = nextBuffer++));
    return `buf:${id}`;
  }
  const s = String(src);
  return (SHAPES as readonly string[]).includes(s) ? `shape:${s}` : `url:${s}`;
}

const isPlain = (v: unknown): v is Record<string, unknown> =>
  Object.prototype.toString.call(v) === '[object Object]';

/** drops undefined values so that spreading never erases a default */
function defined<T extends object>(value: T | undefined): Partial<T> {
  const out: Partial<T> = {};
  if (value) {
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

/** a layer: `false` hides it, `true` shows it, an object shows it with tweaks */
function layer<T extends { enabled: boolean }>(
  base: T,
  ...values: (boolean | Partial<T> | undefined)[]
): T {
  const out = { ...base };
  for (const value of values) {
    if (value === undefined) continue;
    if (typeof value === 'boolean') {
      out.enabled = value;
    } else {
      Object.assign(out, defined(value));
      if (value.enabled === undefined) out.enabled = true;
    }
  }
  return out;
}

/** a palette with overrides; tuples merge item by item, so `nebula: [, '#f0f']` works */
function palette(base: Palette, override: Partial<Palette> | undefined): Palette {
  // fresh arrays: the result never shares a tuple with a preset
  const out: Record<string, unknown> = Object.fromEntries(
    Object.entries(base).map(([k, v]) => [k, Array.isArray(v) ? [...v] : v]),
  );
  for (const [key, value] of Object.entries(defined(override))) {
    const prev = out[key];
    // a mesh has as many colors as it is given
    const size = key === 'mesh' && Array.isArray(value) ? Math.max(value.length, Array.isArray(prev) ? prev.length : 0) : 0;
    if (size && Array.isArray(prev)) while (prev.length < size) prev.push((value as Color[])[prev.length]);
    out[key] =
      Array.isArray(prev) && Array.isArray(value)
        ? prev.map((c: Color, i) => (value[i] as Color | undefined) ?? c)
        : value;
  }
  return out as unknown as Palette;
}

export function getPreset(preset: DeepSkyOptions['preset']): DeepSkyPreset {
  if (preset && typeof preset === 'object') return preset;
  return (preset && presets[preset]) || presets.cosmos;
}

/** Applies the preset and every default: the full, explicit version of some options */
export function normalizeOptions(options: DeepSkyOptions = {}): ResolvedOptions {
  const preset = getPreset(options.preset);
  const quality = options.quality ?? preset.quality ?? defaults.quality;
  return {
    preset:
      typeof options.preset === 'object'
        ? undefined
        : options.preset && presets[options.preset]
          ? options.preset
          : 'cosmos',
    theme: options.theme ?? preset.theme ?? defaults.theme,
    palette: {
      dark: palette(preset.palette.dark, options.palette?.dark),
      light: palette(preset.palette.light, options.palette?.light),
    },
    speed: options.speed ?? preset.speed ?? defaults.speed,
    animate: options.animate ?? preset.animate ?? defaults.animate,
    intro: options.intro ?? preset.intro ?? defaults.intro,
    nebula: layer({ ...defaults.nebula }, preset.nebula, options.nebula),
    mesh: layer({ ...defaults.mesh }, preset.mesh, options.mesh),
    sun: layer({ ...defaults.sun }, preset.sun, options.sun),
    clouds: layer({ ...defaults.clouds }, preset.clouds, options.clouds),
    sea: layer({ ...defaults.sea }, preset.sea, options.sea),
    daylight: layer({ ...defaults.daylight }, preset.daylight, options.daylight),
    aurora: layer({ ...defaults.aurora }, preset.aurora, options.aurora),
    rays: layer({ ...defaults.rays }, preset.rays, options.rays),
    glow: layer({ ...defaults.glow }, preset.glow, options.glow),
    stars: layer({ ...defaults.stars }, preset.stars, options.stars),
    meteors: layer({ ...defaults.meteors }, preset.meteors, options.meteors),
    grid: layer({ ...defaults.grid }, preset.grid, options.grid),
    cursor: layer({ ...defaults.cursor }, preset.cursor, options.cursor),
    click: options.click ?? preset.click ?? defaults.click,
    clickIgnore: options.clickIgnore ?? preset.clickIgnore ?? defaults.clickIgnore,
    grain: options.grain ?? preset.grain ?? defaults.grain,
    vignette: options.vignette ?? preset.vignette ?? defaults.vignette,
    models: resolveModels(options.models ?? preset.models),
    quality:
      typeof quality === 'string'
        ? { ...(qualities[quality] ?? qualities.medium) }
        : { ...qualities.medium, ...defined(quality) },
    worker: options.worker ?? defaults.worker,
    fixed: options.fixed ?? preset.fixed,
    zIndex: options.zIndex ?? preset.zIndex ?? defaults.zIndex,
    pauseWhenHidden: options.pauseWhenHidden ?? preset.pauseWhenHidden ?? defaults.pauseWhenHidden,
    yieldToPage: options.yieldToPage ?? preset.yieldToPage ?? defaults.yieldToPage,
  };
}

/** `a` updated with `b`: layer objects and palettes merge, everything else is replaced */
export function mergeOptions(a: DeepSkyOptions, b: DeepSkyOptions): DeepSkyOptions {
  const out: Record<string, unknown> = { ...a };
  for (const [key, value] of Object.entries(b)) {
    if (value === undefined) continue;
    const prev = out[key];
    if (key === 'palette' && isPlain(prev) && isPlain(value)) {
      const p = prev as PaletteOverrides;
      const v = value as PaletteOverrides;
      out[key] = { dark: { ...p.dark, ...v.dark }, light: { ...p.light, ...v.light } };
    } else if (key !== 'preset' && isPlain(prev) && isPlain(value)) {
      out[key] = { ...prev, ...value };
    } else {
      out[key] = value;
    }
  }
  return out as DeepSkyOptions;
}

const clamp = (v: number, min: number, max: number) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where an anchored model goes in the sky: its `x`, `y` and `size` are relative to the anchor's
 * box, the result to the sky's. An anchor without a size (display: none…) hides the model.
 */
export function anchorPlace(
  anchor: Box,
  sky: Box,
  m: Pick<ResolvedModel, 'x' | 'y' | 'size'>,
): [x: number, y: number, size: number] {
  return [
    clamp((anchor.left + m.x * anchor.width - sky.left) / sky.width, -2, 3),
    clamp((anchor.top + m.y * anchor.height - sky.top) / sky.height, -2, 3),
    anchor.width && anchor.height ? clamp((m.size * anchor.height) / sky.height, 0.01, 4) : 0,
  ];
}

const rgb = (color: Color): RGB => {
  const [r, g, b] = parseColor(color);
  return [r, g, b];
};

function enginePalette(p: Palette): EnginePalette {
  return {
    background: rgb(p.background),
    nebula: [rgb(p.nebula[0]), rgb(p.nebula[1]), rgb(p.nebula[2]), rgb(p.nebula[3])],
    aurora: [rgb(p.aurora[0]), rgb(p.aurora[1])],
    mesh: Array.from({ length: 6 }, (_, i) => toOklab(parseColor(meshColors(p)[i] ?? p.background))),
    meshBase: toOklab(parseColor(p.background)),
    sun: rgb(p.sun ?? p.glow),
    clouds: [rgb(p.clouds?.[0] ?? p.nebula[2]), rgb(p.clouds?.[1] ?? p.nebula[0])],
    rays: rgb(p.rays),
    glow: rgb(p.glow),
    stars: [rgb(p.stars[0]), rgb(p.stars[1]), rgb(p.stars[2])],
    spotlight: [rgb(p.spotlight[0]), rgb(p.spotlight[1])],
    lines: rgb(p.lines),
    meteor: rgb(p.meteor),
    grid: parseColor(p.grid),
  };
}

/** what the engine needs: parsed colors, clamped numbers, 0 for disabled layers */
export function toEngineConfig(r: ResolvedOptions): EngineConfig {
  const on = (enabled: boolean, value: number) => (enabled ? value : 0);
  const layout = Array.isArray(r.mesh.layout) ? r.mesh.layout : (meshLayouts[r.mesh.layout] ?? meshLayouts.diagonal);
  // a theme with fewer colors than points melts the missing ones into its background
  const points = Math.min(6, layout.length, Math.max(meshColors(r.palette.dark).length, meshColors(r.palette.light).length));
  return {
    palettes: { dark: enginePalette(r.palette.dark), light: enginePalette(r.palette.light) },
    speed: clamp(r.speed, 0, 10),
    intro: r.intro,
    nebula: on(r.nebula.enabled, clamp(r.nebula.intensity, 0, 4)),
    nebulaScale: clamp(r.nebula.scale, 0.1, 10),
    shimmer: clamp(r.nebula.shimmer, 0, 1),
    mesh: [
      on(r.mesh.enabled && points > 0, clamp(r.mesh.intensity, 0, 1)),
      clamp(r.mesh.softness, 0.3, 3),
      clamp(r.mesh.drift, 0, 3),
      clamp(r.mesh.flow, 0, 3),
      clamp(r.mesh.silk, 0, 2),
      clamp(r.mesh.depth, 0, 3),
    ],
    meshPoints: Array.from({ length: 6 }, (_, i) =>
      i < points
        ? [clamp(layout[i].x, -1, 2), 1 - clamp(layout[i].y, -1, 2), clamp(layout[i].size ?? 1, 0.2, 3), 1]
        : [0, 0, 1, 0],
    ).flat(),
    sun: [
      clamp(r.sun.x, -0.5, 1.5),
      1 - clamp(r.sun.y, -0.5, 1.5),
      clamp(r.sun.size, 0.02, 1) / 2,
      on(r.sun.enabled, clamp(r.sun.intensity, 0, 2)),
      clamp(r.sun.halo, 0, 3),
    ],
    clouds: [
      on(r.clouds.enabled, clamp(r.clouds.intensity, 0, 1)),
      clamp(r.clouds.cover, 0, 1),
      clamp(r.clouds.scale, 0.2, 4),
      clamp(r.clouds.speed, 0, 5),
    ],
    sea: [on(r.sea.enabled, clamp(r.sea.level, 0.05, 0.8)), clamp(r.sea.waves, 0, 3), clamp(r.sea.glints, 0, 3)],
    daylight: [
      on(r.daylight.enabled, clamp(r.daylight.contrast, 0, 2)),
      on(r.daylight.enabled, clamp(r.daylight.sheen, 0, 2)),
      on(r.daylight.enabled, clamp(r.daylight.bokeh, 0, 2)),
      on(r.daylight.enabled, clamp(r.daylight.split, 0, 1)),
    ],
    aurora: on(r.aurora.enabled, clamp(r.aurora.intensity, 0, 4)),
    auroraPosition: clamp(r.aurora.position, -0.2, 1.2),
    auroraShape: [
      clamp(r.aurora.height, 0.2, 4),
      clamp(r.aurora.speed, 0, 5),
      clamp(r.aurora.waves, 0, 3),
      clamp(r.aurora.streaks, 0, 1),
    ],
    auroraForm: [Math.round(clamp(r.aurora.curtains, 1, 5)), clamp(r.aurora.tilt, -1, 1), clamp(r.aurora.edge, 0.2, 3)],
    rays: on(r.rays.enabled, clamp(r.rays.intensity, 0, 4)),
    raysSpread: clamp(r.rays.spread, 0.1, 5),
    glow: on(r.glow.enabled, clamp(r.glow.intensity, 0, 4)),
    lens: on(r.glow.enabled, clamp(r.glow.lens, 0, 4)),
    grain: clamp(r.grain, 0, 0.3),
    vignette: clamp(r.vignette, 0, 1.5),
    stars: on(r.stars.enabled, clamp(r.stars.density, 0, 4)),
    starSize: clamp(r.stars.size, 0.1, 5),
    twinkle: clamp(r.stars.twinkle, 0, 1),
    parallax: clamp(r.stars.parallax, 0, 5),
    flares: r.stars.flares,
    starSpeed: clamp(r.stars.speed, 0, 10),
    meteors: on(r.meteors.enabled, clamp(r.meteors.frequency, 0, 10)),
    spotlight: on(r.cursor.enabled, clamp(r.cursor.spotlight, 0, 3)),
    spotlightRadius: clamp(r.cursor.spotlightRadius, 20, 2000),
    field: on(r.cursor.enabled, clamp(r.cursor.field, 0, 5)),
    fieldRadius: clamp(r.cursor.fieldRadius, 20, 1000),
    constellations: r.cursor.enabled && r.cursor.constellations,
    linkDistance: clamp(r.cursor.linkDistance, 10, 500),
    grid: on(r.grid.enabled, clamp(r.grid.opacity, 0, 1)),
    gridSize: clamp(r.grid.size, 8, 400),
    gridSpeed: clamp(r.grid.speed, 0, 10),
    gridHeight: clamp(r.grid.height, 0.05, 1),
    gridTilt: clamp(r.grid.tilt, 0, 85),
    models: r.models.map((m) => ({
      key: modelKey(m.src),
      material: Math.max(0, MATERIALS.indexOf(m.material)),
      color: m.color ? rgb(m.color) : null,
      x: clamp(m.x, -1, 2),
      y: clamp(m.y, -1, 2),
      size: clamp(m.size, 0.01, 4),
      rotation: m.rotation.map((d) => (clamp(d, -36000, 36000) * Math.PI) / 180) as RGB,
      spin: (clamp(m.spin, -3600, 3600) * Math.PI) / 180,
      float: clamp(m.float, 0, 5),
      follow: clamp(m.follow, 0, 2),
      react: clamp(m.react, 0, 5),
      morph: clamp(m.morph, 0, 2),
      glow: clamp(m.glow, 0, 3),
      rays: clamp(m.rays, 0, 3),
      opacity: clamp(m.opacity, 0, 1),
      reveal: clamp(m.reveal, 0, 1),
    })),
    click: r.click,
    scale: clamp(r.quality.scale, 0.1, 2),
    minScale: clamp(Math.min(r.quality.minScale, r.quality.scale), 0.05, 2),
    fps: clamp(r.quality.fps, 1, 240),
    adaptive: r.quality.adaptive,
  };
}
