/** Any CSS color the browser understands: hex, rgb(), hsl(), oklch(), named colors… */
export type Color = string;

export type PresetName =
  | 'cosmos'
  | 'ember'
  | 'abyss'
  | 'synthwave'
  | 'graphite'
  | 'daybreak'
  | 'sunset'
  | 'horizon'
  | 'iris'
  | 'mirage'
  | 'polar'
  | 'flamingo'
  | 'mango'
  | 'afterglow'
  | 'blossom'
  | 'lagoon'
  | 'porcelain';

export type Theme = 'dark' | 'light' | 'auto';

/** What a click on the background does */
export type ClickEffect = 'shockwave' | 'ring' | 'none';

export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra';

/** Colors for one theme */
export interface Palette {
  /** base color, painted before the first frame too */
  background: Color;
  /** nebula: deep tone, mid tone, highlight, accent */
  nebula: [Color, Color, Color, Color];
  /** aurora: lower edge, upper fade */
  aurora: [Color, Color];
  /** gradient mesh: 2 to 6 colors, one per point of its layout (default: the nebula's and the aurora's) */
  mesh?: Color[];
  /** the sun's disc, its halo and its reflection (default: the glow) */
  sun?: Color;
  /** clouds: the side that faces the sun, the side away from it (default: from the nebula) */
  clouds?: [Color, Color];
  /** light beams */
  rays: Color;
  /** roaming light, shockwaves and light sweeps */
  glow: Color;
  /** star tints */
  stars: [Color, Color, Color];
  /** cursor spotlight: center, edge */
  spotlight: [Color, Color];
  /** constellation lines and click rings */
  lines: Color;
  /** shooting stars */
  meteor: Color;
  /** perspective grid lines (alpha is honored) */
  grid: Color;
}

export interface PaletteOverrides {
  dark?: Partial<Palette>;
  light?: Partial<Palette>;
}

/** Every layer accepts `false` (off), `true` (on with preset values) or an object (on, tweaked). */
interface Layer {
  /** keep the settings but hide the layer */
  enabled?: boolean;
}

export interface NebulaOptions extends Layer {
  /** brightness, 0–4 (default 1) */
  intensity?: number;
  /** zoom of the clouds: higher = smaller, busier clouds (default 1) */
  scale?: number;
  /** slow drift of the colors towards warm highlights, 0–1 (default 0.22) */
  shimmer?: number;
}

/** Where the colors of the gradient mesh sit */
export type MeshLayout =
  /** hot corner to cold corner: two colors on the left, one in the middle, three on the right */
  | 'diagonal'
  /** a landscape: two colors along the bottom, two in the middle, two at the top */
  | 'horizon'
  /** the same over a sea: two colors on its horizon, two above, two at the top */
  | 'coast'
  /** one color glowing in the middle, the others around it */
  | 'bloom'
  /** one color per corner, two in the middle */
  | 'corners';

/** One color of the mesh: `palette.mesh` gives the colors, in the same order */
export interface MeshPoint {
  /** fraction of the container from the left; a little outside is fine */
  x: number;
  /** fraction of the container from the top */
  y: number;
  /** how far its color reaches, 0.2–3 (default 1) */
  size?: number;
}

/** A gradient mesh: large, vivid fields of color that melt into each other and drift, in both themes */
export interface MeshOptions extends Layer {
  /** how much it covers the background, 0–1 (default 1) */
  intensity?: number;
  /** where the colors sit: a layout, or your own points (2 to 6) (default 'diagonal') */
  layout?: MeshLayout | MeshPoint[];
  /** how softly the colors melt into each other, 0.3–3 (default 1; lower = more distinct) */
  softness?: number;
  /** how far the colors wander, 0–3 (default 1, 0 holds them in place) */
  drift?: number;
  /** how much the whole sky flows and folds, 0–3 (default 1, 0 = round, still shapes) */
  flow?: number;
  /** soft folds of light running through the colors, like silk, 0–2 (default 0.5) */
  silk?: number;
  /** dark theme: how much of the night shows between the colors, 0–3 (default 1) */
  depth?: number;
}

/** A sun, its halo, and the haze it lights on the horizon */
export interface SunOptions extends Layer {
  /** brightness, 0–2 (default 1) */
  intensity?: number;
  /** center, fraction of the container from the left (default 0.5) */
  x?: number;
  /** center, fraction of the container from the top; the sea hides what is below its horizon (default 0.6) */
  y?: number;
  /** diameter, fraction of the container height, 0.02–1 (default 0.24) */
  size?: number;
  /** how far its light spreads, 0–3 (default 1) */
  halo?: number;
}

/** A deck of clouds that recedes to the horizon, lit by the sun */
export interface CloudsOptions extends Layer {
  /** opacity, 0–1 (default 0.9) */
  intensity?: number;
  /** how much of the sky they cover, 0–1 (default 0.5) */
  cover?: number;
  /** size: higher = smaller, busier clouds, 0.2–4 (default 1) */
  scale?: number;
  /** how fast they drift, 0–5 (default 1) */
  speed?: number;
  /** cumulus towering on the horizon: their height, 0–2 (default 1, 0 = none) */
  towers?: number;
}

/** Water along the bottom: it mirrors everything above its horizon */
export interface SeaOptions extends Layer {
  /** height of the horizon, fraction of the container from the bottom, 0.05–0.8 (default 0.26) */
  level?: number;
  /** how much the waves break the reflection, 0–3 (default 1, 0 = a mirror) */
  waves?: number;
  /** glints of the sun on the water, 0–3 (default 1) */
  glints?: number;
}

/** the light theme's finish: only drawn while the sky is light */
export interface DaylightOptions extends Layer {
  /** depth: richer, deeper shades in the folds of the colors and towards the edges, 0–2 (default 1) */
  contrast?: number;
  /** a pearly, iridescent sheen sweeping slowly across, 0–2 (default 1) */
  sheen?: number;
  /** soft out-of-focus discs of light drifting up, 0–2 (default 1) */
  bokeh?: number;
  /**
   * hot and cold sides, 0–1 (default 0): the colors gather on one side of a slowly turning
   * diagonal, the background color holds the other, and they meet through the third nebula color
   */
  split?: number;
}

export interface AuroraOptions extends Layer {
  intensity?: number;
  /** vertical position of the curtains, 0 (bottom) – 1 (top) (default 0.7) */
  position?: number;
  /** how far the curtains rise above their lower edge, 0.2–4 (default 1) */
  height?: number;
  /** how fast they wave and shimmer, 0–5 (default 1, 0 holds them still) */
  speed?: number;
  /** how much they undulate, 0–3 (default 1, 0 = straight bands) */
  waves?: number;
  /** how many curtains, 1–5 (default 3) */
  curtains?: number;
  /** the vertical streaks of light in them, 0–1 (default 1, 0 = smooth) */
  streaks?: number;
  /** slants them across the screen, -1 (down to the right) – 1 (up to the right) (default 0) */
  tilt?: number;
  /** sharpness of their lower edge, 0.2–3 (default 1) */
  edge?: number;
}

export interface RaysOptions extends Layer {
  intensity?: number;
  /** angular density of the beams (default 1) */
  spread?: number;
}

export interface GlowOptions extends Layer {
  /** brightness of the light that follows the cursor (wanders on its own otherwise) */
  intensity?: number;
  /** magnifying lens around the light, 0 = none (default 1) */
  lens?: number;
}

export interface StarsOptions extends Layer {
  /** multiplier of the automatic star count (70–220 depending on the area), 0–4 (default 1) */
  density?: number;
  size?: number;
  /** 0 = steady, 1 = full twinkle (default 1) */
  twinkle?: number;
  /** depth effect when the light moves, 0 = flat (default 1) */
  parallax?: number;
  /** cross flares on the nearest stars (default true) */
  flares?: boolean;
  /** upward drift speed (default 1) */
  speed?: number;
}

export interface MeteorsOptions extends Layer {
  /** shooting stars per ~5 seconds (default 1) */
  frequency?: number;
}

export interface GridOptions extends Layer {
  /** cell size in px (default 64) */
  size?: number;
  /** scrolling speed (default 1) */
  speed?: number;
  /** height of the floor, fraction of the container (default 0.55) */
  height?: number;
  /** tilt in degrees (default 64) */
  tilt?: number;
  opacity?: number;
}

export interface CursorOptions extends Layer {
  /** soft spotlight under the cursor (default 1) */
  spotlight?: number;
  spotlightRadius?: number;
  /** stars swirl around the cursor (default 1) */
  field?: number;
  fieldRadius?: number;
  /** link nearby stars into constellations (default true) */
  constellations?: boolean;
  linkDistance?: number;
}

/** Built-in 3D shapes */
export type ModelShape = 'orb' | 'knot' | 'torus' | 'crystal' | 'gem' | 'planet' | 'cube';

/** How a model's surface takes the sky's light */
export type ModelMaterial =
  /** the file's own materials (metal, roughness, textures); chrome for built-in shapes */
  | 'auto'
  /** a mirror: reflects the nebula and the lights */
  | 'chrome'
  /** refracts the sky behind it, split into colors at the edges */
  | 'glass'
  /** fresnel shell, scanlines, flicker and glitches, in the aurora colors */
  | 'hologram'
  /** thin-film colors that shift with the angle, like a soap bubble */
  | 'iridescent'
  /** glowing neon edges (the grid color by default) */
  | 'wire'
  /** made of the sky's own clouds and stars */
  | 'nebula';

/** A 3D model in the sky, lit by it */
export interface ModelOptions {
  /** a built-in shape, or a glTF / GLB file: its URL (relative to the page) or its bytes */
  src: ModelShape | string | URL | ArrayBuffer;
  /** default 'auto' */
  material?: ModelMaterial;
  /** tint, any CSS color; the light color of 'hologram' and 'wire' (null: the palette's) */
  color?: Color | null;
  /**
   * An element the model is attached to, or a CSS selector: the model moves with it (scrolling,
   * sticky positioning, animations…), and `x`, `y` and `size` are relative to its box instead of
   * the container. (default: none)
   */
  anchor?: Element | string | null;
  /** center, fraction of the container (or anchor) from the left (default 0.5) */
  x?: number;
  /** center, fraction of the container (or anchor) from the top (default 0.5) */
  y?: number;
  /** largest side, fraction of the container (or anchor) height (default 0.5) */
  size?: number;
  /** starting orientation in degrees, [x, y, z] */
  rotation?: [number, number, number];
  /** turns around its vertical axis, degrees per second (default 18) */
  spin?: number;
  /** slow bobbing, 0 = still (default 1) */
  float?: number;
  /** leans towards the cursor, 0–1 (default 0.35) */
  follow?: number;
  /** shockwaves bend it, light it up and set it spinning; 0 ignores them (default 1) */
  react?: number;
  /** liquid surface that ripples like molten metal, 0–2 (default 0) */
  morph?: number;
  /** bloom around the bright parts, 0–3 (default 1) */
  glow?: number;
  /** light shafts streaming from the roaming light past the model, 0–3 (default 0.6) */
  rays?: number;
  /** 0–1 (default 1) */
  opacity?: number;
  /**
   * How much of the model has materialized, 0–1 (default 1). Changes animate: it dissolves
   * through the same burning edge it appears with. Drive it from the scroll, or set 0 to hide
   * a model while keeping it ready (no download nor shader compile when it comes back).
   */
  reveal?: number;
}

export interface QualityOptions {
  /** shader resolution relative to CSS pixels (medium: 0.5) */
  scale?: number;
  /** lowest resolution the adaptive mode may use (medium: 0.2) */
  minScale?: number;
  /** shader frame rate (medium: 30) */
  fps?: number;
  /** device pixel ratio cap of the particle layer (medium: 1.5) */
  maxDpr?: number;
  /** lower resolution, then frame rate, when the device struggles (default true) */
  adaptive?: boolean;
}

export interface DeepSkyOptions {
  /** starting point for every other option (default 'cosmos') */
  preset?: PresetName | DeepSkyPreset;
  /** 'auto' follows prefers-color-scheme (default: the preset's, else 'dark') */
  theme?: Theme;
  palette?: PaletteOverrides;
  /** time multiplier, 0 freezes the motion (default 1) */
  speed?: number;
  /** false renders a single still frame; 'auto' respects prefers-reduced-motion (default 'auto') */
  animate?: boolean | 'auto';
  /** fade-in and rising ring of light on start (default true) */
  intro?: boolean;

  nebula?: boolean | NebulaOptions;
  /** large fields of color that melt into each other and drift (off unless the preset has one) */
  mesh?: boolean | MeshOptions;
  /** a sun and its halo (off unless the preset has one) */
  sun?: boolean | SunOptions;
  /** clouds lit by the sun (off unless the preset has them) */
  clouds?: boolean | CloudsOptions;
  /** water that mirrors the sky (off unless the preset has it) */
  sea?: boolean | SeaOptions;
  /** the light theme's contrast, iridescent sheen and bokeh */
  daylight?: boolean | DaylightOptions;
  aurora?: boolean | AuroraOptions;
  rays?: boolean | RaysOptions;
  glow?: boolean | GlowOptions;
  stars?: boolean | StarsOptions;
  meteors?: boolean | MeteorsOptions;
  grid?: boolean | GridOptions;
  /** pointer interactions; false = no tracking at all */
  cursor?: boolean | CursorOptions;
  click?: ClickEffect;
  /** clicks on elements matching this selector don't trigger the click effect */
  clickIgnore?: string;
  /** film grain, 0–0.3 (default 0.02) */
  grain?: number;
  /** darkened corners in the dark theme, 0–1.5 (default 0.6) */
  vignette?: number;
  /**
   * 3D models lit by the sky: a shape name, a model, or a list. The 3D layer (WebGL 2) is
   * downloaded only when this is set.
   */
  models?: ModelShape | ModelOptions | (ModelShape | ModelOptions)[] | false;

  quality?: QualityPreset | QualityOptions;
  /**
   * true: render in an inline Web Worker (Blob URL); false: main thread;
   * string/URL: load the worker script from there (for a strict CSP, see `deep-sky-background/worker`)
   */
  worker?: boolean | string | URL;
  /** cover the viewport instead of the container (default: true when mounted on <body>) */
  fixed?: boolean;
  /** z-index of the background layer inside the container (default -1) */
  zIndex?: number;
  /** stop rendering when off-screen or in a background tab (default true) */
  pauseWhenHidden?: boolean;
  /** slow down while the page runs long tasks (default true) */
  yieldToPage?: boolean;

  onStats?: (stats: DeepSkyStats) => void;
  onFallback?: (mode: 'main-thread' | 'css', reason: string) => void;
  /** a model could not be shown (network, format, no WebGL 2…) */
  onModelError?: (src: ModelOptions['src'] | '*', error: string) => void;
}

/** A preset is a set of options with complete palettes */
export type DeepSkyPreset = Omit<
  DeepSkyOptions,
  'preset' | 'palette' | 'onStats' | 'onFallback' | 'onModelError' | 'worker'
> & {
  palette: { dark: Palette; light: Palette };
};

/** A model with every default applied */
export type ResolvedModel = Required<Omit<ModelOptions, 'color' | 'anchor'>> & {
  color: Color | null;
  anchor: Element | string | null;
};

/** Options with every default applied (what `normalizeOptions` returns) */
export interface ResolvedOptions {
  /** undefined when a custom preset object was given */
  preset: PresetName | undefined;
  theme: Theme;
  palette: { dark: Palette; light: Palette };
  speed: number;
  animate: boolean | 'auto';
  intro: boolean;
  nebula: Required<NebulaOptions>;
  mesh: Required<MeshOptions>;
  sun: Required<SunOptions>;
  clouds: Required<CloudsOptions>;
  sea: Required<SeaOptions>;
  daylight: Required<DaylightOptions>;
  aurora: Required<AuroraOptions>;
  rays: Required<RaysOptions>;
  glow: Required<GlowOptions>;
  stars: Required<StarsOptions>;
  meteors: Required<MeteorsOptions>;
  grid: Required<GridOptions>;
  cursor: Required<CursorOptions>;
  click: ClickEffect;
  clickIgnore: string;
  grain: number;
  vignette: number;
  models: ResolvedModel[];
  quality: Required<QualityOptions>;
  worker: boolean | string | URL;
  fixed: boolean | undefined;
  zIndex: number;
  pauseWhenHidden: boolean;
  yieldToPage: boolean;
}

export type DeepSkyMode = 'pending' | 'worker' | 'main-thread' | 'css';

export interface DeepSkyStats {
  /** particle layer frames per second */
  fps: number;
  /** shader frames per second */
  shaderFps: number;
  /** current shader resolution, relative to CSS pixels */
  scale: number;
  particles: number;
  mode: DeepSkyMode;
}

export interface DeepSkyInstance {
  /** the background layer inserted in the container */
  readonly element: HTMLElement;
  /** where rendering happens: 'worker', 'main-thread' or 'css' (no WebGL) */
  readonly mode: DeepSkyMode;
  readonly options: DeepSkyOptions;
  /** resolves after the first frame */
  readonly ready: Promise<void>;
  /** merge new options (or replace them all with `replace = true`); changes apply live */
  set(options: DeepSkyOptions, replace?: boolean): void;
  /** diagonal light sweep, e.g. on route changes */
  pulse(): void;
  /** click effect at a point, in px relative to the container */
  burst(x: number, y: number, effect?: 'shockwave' | 'ring'): void;
  play(): void;
  pause(): void;
  destroy(): void;
}
