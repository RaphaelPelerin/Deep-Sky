import { parseColor } from './color';
import type { EngineConfig, EnginePalette, RGB } from './engine/protocol';
import { presets } from './presets';
import type {
  Color,
  Palette,
  PaletteOverrides,
  QualityOptions,
  QualityPreset,
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
  aurora: { enabled: true, intensity: 1, position: 0.7 },
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
  quality: 'medium',
  worker: true,
  zIndex: -1,
  pauseWhenHidden: true,
  yieldToPage: true,
};

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

const rgb = (color: Color): RGB => {
  const [r, g, b] = parseColor(color);
  return [r, g, b];
};

function enginePalette(p: Palette): EnginePalette {
  return {
    background: rgb(p.background),
    nebula: [rgb(p.nebula[0]), rgb(p.nebula[1]), rgb(p.nebula[2]), rgb(p.nebula[3])],
    aurora: [rgb(p.aurora[0]), rgb(p.aurora[1])],
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
  return {
    palettes: { dark: enginePalette(r.palette.dark), light: enginePalette(r.palette.light) },
    speed: clamp(r.speed, 0, 10),
    intro: r.intro,
    nebula: on(r.nebula.enabled, clamp(r.nebula.intensity, 0, 4)),
    nebulaScale: clamp(r.nebula.scale, 0.1, 10),
    shimmer: clamp(r.nebula.shimmer, 0, 1),
    aurora: on(r.aurora.enabled, clamp(r.aurora.intensity, 0, 4)),
    auroraPosition: clamp(r.aurora.position, -0.2, 1.2),
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
    click: r.click,
    scale: clamp(r.quality.scale, 0.1, 2),
    minScale: clamp(Math.min(r.quality.minScale, r.quality.scale), 0.05, 2),
    fps: clamp(r.quality.fps, 1, 240),
    adaptive: r.quality.adaptive,
  };
}
