import type { Palette, PresetName } from 'deep-sky';
import type { LayerKey } from './code';

export const PRESET_INFO: Record<PresetName, { label: string; desc: string }> = {
  cosmos: { label: 'Cosmos', desc: 'The original. Violet nebula, teal aurora, cold starlight.' },
  aurora: { label: 'Aurora', desc: 'Northern lights over an arctic night.' },
  ember: { label: 'Ember', desc: 'Molten nebula and warm beams at dusk.' },
  abyss: { label: 'Abyss', desc: 'God rays through deep ocean water.' },
  synthwave: { label: 'Synthwave', desc: 'Neon horizon on an endless grid.' },
  graphite: { label: 'Graphite', desc: 'Monochrome and quiet, made for product UIs.' },
  daybreak: { label: 'Daybreak', desc: 'A bright pastel sky. Light mode first.' },
};

export const LAYER_INFO: { key: Exclude<LayerKey, 'cursor'>; label: string; desc: string }[] = [
  { key: 'nebula', label: 'Nebula', desc: 'Domain-warped fractal clouds' },
  { key: 'aurora', label: 'Aurora', desc: 'Waving curtains of light' },
  { key: 'rays', label: 'Light beams', desc: 'God rays from above' },
  { key: 'glow', label: 'Glow', desc: 'A light that follows you' },
  { key: 'stars', label: 'Stars', desc: 'Parallax, swirl, constellations' },
  { key: 'meteors', label: 'Shooting stars', desc: 'One every few seconds' },
  { key: 'grid', label: 'Grid', desc: 'A floor rushing towards you' },
];

/** a small painting of a palette, for preset cards and chips */
export function swatch(p: Palette): string {
  return [
    `radial-gradient(60% 80% at 22% 28%, ${p.nebula[2]}b0, transparent 62%)`,
    `radial-gradient(55% 75% at 78% 72%, ${p.nebula[3]}99, transparent 60%)`,
    `radial-gradient(80% 45% at 55% 12%, ${p.aurora[0]}70, transparent 65%)`,
    `linear-gradient(135deg, ${p.nebula[0]}, ${p.nebula[1]} 55%, ${p.background})`,
  ].join(', ');
}

/** a dot color for each layer, from the active palette */
export function layerColor(p: Palette, key: LayerKey): string {
  switch (key) {
    case 'nebula':
      return p.nebula[1];
    case 'aurora':
      return p.aurora[0];
    case 'rays':
      return p.rays;
    case 'glow':
      return p.glow;
    case 'stars':
      return p.stars[0];
    case 'meteors':
      return p.meteor;
    default:
      return p.lines;
  }
}

export function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  const hex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}
