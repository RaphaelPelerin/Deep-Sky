import { describe, expect, it } from 'vitest';
import { mergeOptions, normalizeOptions, qualities, toEngineConfig } from '../src/options';
import { presetNames, presets } from '../src/presets';

describe('normalizeOptions', () => {
  it('starts from the cosmos preset and the defaults', () => {
    const r = normalizeOptions();
    expect(r.preset).toBe('cosmos');
    expect(r.theme).toBe('dark');
    expect(r.nebula).toEqual({ enabled: true, intensity: 1, scale: 1, shimmer: 0.22 });
    expect(r.quality).toEqual(qualities.medium);
    expect(r.palette.dark).toEqual(presets.cosmos.palette.dark);
  });

  it('applies the preset, then the options', () => {
    const r = normalizeOptions({ preset: 'aurora', aurora: { position: 0.5 } });
    expect(r.preset).toBe('aurora');
    expect(r.aurora).toEqual({ enabled: true, intensity: 2, position: 0.5 });
    expect(r.grid.enabled).toBe(false);
  });

  it('takes the theme of a light-first preset unless told otherwise', () => {
    expect(normalizeOptions({ preset: 'daybreak' }).theme).toBe('light');
    expect(normalizeOptions({ preset: 'daybreak', theme: 'dark' }).theme).toBe('dark');
  });

  it('switches layers with booleans and keeps their settings', () => {
    const off = normalizeOptions({ preset: 'synthwave', grid: false });
    expect(off.grid.enabled).toBe(false);
    expect(off.grid.size).toBe(56);
    expect(normalizeOptions({ preset: 'aurora', grid: true }).grid.enabled).toBe(true);
    expect(normalizeOptions({ preset: 'aurora', grid: { size: 32 } }).grid).toMatchObject({
      enabled: true,
      size: 32,
    });
    expect(normalizeOptions({ stars: { enabled: false, density: 2 } }).stars).toMatchObject({
      enabled: false,
      density: 2,
    });
  });

  it('ignores undefined values instead of erasing defaults', () => {
    expect(normalizeOptions({ nebula: { intensity: undefined } }).nebula.intensity).toBe(1);
    expect(normalizeOptions({ speed: undefined }).speed).toBe(1);
  });

  it('merges palette tuples item by item', () => {
    // eslint-disable-next-line no-sparse-arrays
    const r = normalizeOptions({ palette: { dark: { nebula: [, '#ff00ff'] as never, glow: 'red' } } });
    const base = presets.cosmos.palette.dark;
    expect(r.palette.dark.nebula).toEqual([base.nebula[0], '#ff00ff', base.nebula[2], base.nebula[3]]);
    expect(r.palette.dark.glow).toBe('red');
    expect(r.palette.light).toEqual(presets.cosmos.palette.light);
  });

  it('never shares arrays with the presets', () => {
    const r = normalizeOptions({ preset: 'ember' });
    r.palette.dark.nebula[0] = '#000000';
    expect(presets.ember.palette.dark.nebula[0]).not.toBe('#000000');
  });

  it('resolves quality presets and custom objects', () => {
    expect(normalizeOptions({ quality: 'ultra' }).quality).toEqual(qualities.ultra);
    expect(normalizeOptions({ quality: { fps: 60 } }).quality).toEqual({ ...qualities.medium, fps: 60 });
  });

  it('accepts a custom preset object', () => {
    const r = normalizeOptions({ preset: { ...presets.graphite, speed: 2 } });
    expect(r.preset).toBeUndefined();
    expect(r.speed).toBe(2);
    expect(r.palette.dark.background).toBe(presets.graphite.palette.dark.background);
  });

  it('has a complete palette for every preset and theme', () => {
    for (const name of presetNames) {
      for (const theme of ['dark', 'light'] as const) {
        const p = presets[name].palette[theme];
        expect(p.nebula, `${name} ${theme}`).toHaveLength(4);
        expect(p.aurora).toHaveLength(2);
        expect(p.stars).toHaveLength(3);
        expect(p.spotlight).toHaveLength(2);
      }
    }
  });
});

describe('mergeOptions', () => {
  it('merges layers and palettes, replaces the rest', () => {
    const merged = mergeOptions(
      { preset: 'aurora', nebula: { intensity: 2 }, palette: { dark: { glow: '#fff' } } },
      { preset: 'ember', nebula: { scale: 3 }, palette: { light: { glow: '#000' } }, speed: 2 },
    );
    expect(merged).toEqual({
      preset: 'ember',
      nebula: { intensity: 2, scale: 3 },
      palette: { dark: { glow: '#fff' }, light: { glow: '#000' } },
      speed: 2,
    });
  });

  it('lets a boolean replace a layer object', () => {
    expect(mergeOptions({ grid: { size: 10 } }, { grid: false }).grid).toBe(false);
  });
});

describe('toEngineConfig', () => {
  it('turns disabled layers into zero intensity', () => {
    const c = toEngineConfig(normalizeOptions({ aurora: false, meteors: false, cursor: false }));
    expect(c.aurora).toBe(0);
    expect(c.meteors).toBe(0);
    expect(c.spotlight).toBe(0);
    expect(c.field).toBe(0);
    expect(c.constellations).toBe(false);
  });

  it('clamps out-of-range numbers', () => {
    const c = toEngineConfig(
      normalizeOptions({ speed: -3, grain: 9, stars: { density: 99 }, quality: { fps: 0 } }),
    );
    expect(c.speed).toBe(0);
    expect(c.grain).toBe(0.3);
    expect(c.stars).toBe(4);
    expect(c.fps).toBe(1);
  });

  it('parses palette colors to 0..1 floats', () => {
    const c = toEngineConfig(normalizeOptions({ palette: { dark: { background: '#ff8000' } } }));
    expect(c.palettes.dark.background[0]).toBe(1);
    expect(c.palettes.dark.background[1]).toBeCloseTo(128 / 255);
    expect(c.palettes.dark.background[2]).toBe(0);
  });

  it('keeps the adaptive floor below the starting resolution', () => {
    const c = toEngineConfig(normalizeOptions({ quality: { scale: 0.3, minScale: 0.6 } }));
    expect(c.minScale).toBeLessThanOrEqual(c.scale);
  });
});
