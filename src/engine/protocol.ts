/**
 * Messages exchanged between the main-thread controller and the render engine.
 * The engine runs in a Web Worker when possible, so everything here must be structured-cloneable.
 */

/** linear RGB-ish color as 0..1 floats (sRGB values, no conversion) */
export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

export interface EnginePalette {
  background: RGB;
  nebula: [RGB, RGB, RGB, RGB];
  aurora: [RGB, RGB];
  rays: RGB;
  glow: RGB;
  stars: [RGB, RGB, RGB];
  spotlight: [RGB, RGB];
  lines: RGB;
  meteor: RGB;
  grid: RGBA;
}

export type EngineClick = 'shockwave' | 'ring' | 'none';

/** fully resolved and clamped settings: 0 disables a layer */
export interface EngineConfig {
  palettes: { dark: EnginePalette; light: EnginePalette };
  speed: number;
  intro: boolean;
  nebula: number;
  nebulaScale: number;
  shimmer: number;
  aurora: number;
  auroraPosition: number;
  rays: number;
  raysSpread: number;
  glow: number;
  lens: number;
  grain: number;
  vignette: number;
  stars: number;
  starSize: number;
  twinkle: number;
  parallax: number;
  flares: boolean;
  starSpeed: number;
  meteors: number;
  spotlight: number;
  spotlightRadius: number;
  field: number;
  fieldRadius: number;
  constellations: boolean;
  linkDistance: number;
  /** perspective floor: opacity (0 = off), cell size in px, scroll speed, height (0..1), tilt in degrees */
  grid: number;
  gridSize: number;
  gridSpeed: number;
  gridHeight: number;
  gridTilt: number;
  click: EngineClick;
  scale: number;
  minScale: number;
  fps: number;
  adaptive: boolean;
}

export interface EngineInit {
  config: EngineConfig;
  dark: boolean;
  animated: boolean;
  stats: boolean;
}

/** controller → engine */
export type EngineMessage =
  | ({ type: 'init'; gl: OffscreenCanvas; fx: OffscreenCanvas } & EngineInit)
  | { type: 'config'; config: EngineConfig }
  | { type: 'resize'; w: number; h: number; dpr: number }
  | { type: 'pointer'; x: number; y: number; inside: boolean }
  | { type: 'click'; x: number; y: number; effect?: 'shockwave' | 'ring' }
  | { type: 'pulse' }
  | { type: 'theme'; dark: boolean }
  | { type: 'animated'; on: boolean }
  | { type: 'visible'; on: boolean }
  /** the page's main thread is busy (long task): back off for a moment */
  | { type: 'busy' }
  | { type: 'stats'; on: boolean };

export interface EngineStats {
  /** particle layer frames per second */
  fps: number;
  /** shader frames per second */
  shaderFps: number;
  /** shader resolution, relative to CSS pixels */
  scale: number;
  particles: number;
}

/** engine → controller */
export type EngineEvent =
  | { type: 'boot' }
  | { type: 'ready' }
  | { type: 'glFailed' }
  | ({ type: 'stats' } & EngineStats);
