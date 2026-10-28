/** Any CSS color the browser understands: hex, rgb(), hsl(), oklch(), named colors… */
export type Color = string;

export type PresetName =
  | 'cosmos'
  | 'aurora'
  | 'ember'
  | 'abyss'
  | 'synthwave'
  | 'graphite'
  | 'daybreak';

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

export interface AuroraOptions extends Layer {
  intensity?: number;
  /** vertical position of the curtains, 0 (bottom) – 1 (top) (default 0.7) */
  position?: number;
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

  quality?: QualityPreset | QualityOptions;
  /**
   * true: render in an inline Web Worker (Blob URL); false: main thread;
   * string/URL: load the worker script from there (for a strict CSP, see `deep-sky/worker`)
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
}

/** A preset is a set of options with complete palettes */
export type DeepSkyPreset = Omit<
  DeepSkyOptions,
  'preset' | 'palette' | 'onStats' | 'onFallback' | 'worker'
> & {
  palette: { dark: Palette; light: Palette };
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
