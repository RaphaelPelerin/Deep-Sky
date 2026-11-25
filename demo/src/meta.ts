import { meshColors, meshLayouts, normalizeOptions, presetNames, type Palette, type PresetName, type ResolvedOptions } from 'deep-sky-background';
import type { LayerKey } from './code';

export const PRESET_INFO: Record<PresetName, { label: string; desc: string }> = {
  cosmos: { label: 'Cosmos', desc: 'The original. Violet nebula, teal aurora, cold starlight.' },
  ember: { label: 'Ember', desc: 'Molten nebula and warm beams at dusk.' },
  abyss: { label: 'Abyss', desc: 'God rays through deep ocean water.' },
  synthwave: { label: 'Synthwave', desc: 'Neon horizon on an endless grid.' },
  graphite: { label: 'Graphite', desc: 'Monochrome and quiet, made for product UIs.' },
  daybreak: { label: 'Daybreak', desc: 'Sunrise: peach, rose and lilac. Light first.' },
  sunset: { label: 'Sunset', desc: 'Hot red and orange against electric blue. Light first.' },
  horizon: { label: 'Horizon', desc: 'Gold and coral under a rising blue. Light first.' },
  iris: { label: 'Iris', desc: 'Magenta, violet and cyan petals. Light first.' },
  mirage: { label: 'Mirage', desc: 'Turquoise and emerald, gold and coral. Light first.' },
  flamingo: { label: 'Flamingo', desc: 'A pink evening on a warm coast. Light first.' },
  mango: { label: 'Mango', desc: 'Golden hour over the water. Light first.' },
  afterglow: { label: 'Afterglow', desc: 'A red ember on the sea, neon pink and blue. Light first.' },
  polar: { label: 'Polar', desc: 'White light, pale blue, lilac and rose. Light first.' },
  blossom: { label: 'Blossom', desc: 'Cherry blossom pinks and lavender. Light first.' },
  lagoon: { label: 'Lagoon', desc: 'Turquoise water and dancing sunlight. Light first.' },
  porcelain: { label: 'Porcelain', desc: 'Warm whites and soft grays for product UIs. Light first.' },
};

/** the mesh of every preset, resolved */
export const PRESET_MESH = Object.fromEntries(
  presetNames.map((name) => [name, normalizeOptions({ preset: name }).mesh]),
) as Record<PresetName, ResolvedOptions['mesh']>;

export const LAYER_INFO: { key: Exclude<LayerKey, 'cursor'>; label: string; desc: string }[] = [
  { key: 'nebula', label: 'Nebula', desc: 'Domain-warped fractal clouds' },
  { key: 'mesh', label: 'Gradient mesh', desc: 'Vivid colors that melt and drift' },
  { key: 'sun', label: 'Sun', desc: 'A disc, its halo, a haze on the horizon' },
  { key: 'clouds', label: 'Clouds', desc: 'A deck lit by the sun' },
  { key: 'sea', label: 'Sea', desc: 'Waves that mirror the sky' },
  { key: 'daylight', label: 'Daylight', desc: 'Contrast, sheen and bokeh in light mode' },
  { key: 'aurora', label: 'Aurora', desc: 'Waving curtains of light' },
  { key: 'rays', label: 'Light beams', desc: 'God rays from above' },
  { key: 'glow', label: 'Glow', desc: 'A light that follows you' },
  { key: 'stars', label: 'Stars', desc: 'Parallax, swirl, constellations' },
  { key: 'meteors', label: 'Shooting stars', desc: 'One every few seconds' },
  { key: 'grid', label: 'Grid', desc: 'A floor rushing towards you' },
];

/** a small painting of a palette, for preset cards and chips */
export function swatch(p: Palette, mesh?: ResolvedOptions['mesh'] | null): string {
  if (mesh?.enabled) {
    const points = Array.isArray(mesh.layout) ? mesh.layout : meshLayouts[mesh.layout];
    const colors = meshColors(p);
    const spots = points
      .slice(0, colors.length)
      .map(({ x, y, size = 1 }, i) => `radial-gradient(${size * 52}% ${size * 62}% at ${x * 100}% ${y * 100}%, ${colors[i]}, transparent 78%)`);
    const sky = p.sun
      ? [`radial-gradient(circle at 74% 62%, ${p.sun} 0 17%, ${p.sun}66 18%, transparent 46%)`]
      : [];
    const sea = p.sun ? [`linear-gradient(transparent 74%, ${p.clouds?.[1] ?? p.background}99 75%)`] : [];
    return [...sea, ...sky, ...spots, `linear-gradient(${p.background}, ${p.background})`].join(', ');
  }
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
    case 'mesh':
      return meshColors(p)[0];
    case 'sun':
      return p.sun ?? p.glow;
    case 'clouds':
      return p.clouds?.[0] ?? p.nebula[2];
    case 'sea':
      return p.clouds?.[1] ?? p.nebula[0];
    case 'daylight':
      return p.nebula[2];
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

/** how light a palette's sky looks, 0..1 */
export function skyLight(p: Palette, mesh: ResolvedOptions['mesh']): number {
  const colors = mesh.enabled ? meshColors(p) : [p.background];
  const luma = (c: string) => {
    const n = /^#[\da-f]{6}$/i.test(c) ? parseInt(c.slice(1), 16) : 0xffffff;
    return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  };
  return colors.reduce((sum, c) => sum + luma(c), 0) / colors.length;
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
