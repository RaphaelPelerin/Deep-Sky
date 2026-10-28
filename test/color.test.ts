import { describe, expect, it } from 'vitest';
import { parseColor, toRgba } from '../src/color';

describe('parseColor', () => {
  it('reads hex colors', () => {
    expect(parseColor('#ffffff')).toEqual([1, 1, 1, 1]);
    expect(parseColor('#000')).toEqual([0, 0, 0, 1]);
    expect(parseColor('#ff000080')[3]).toBeCloseTo(128 / 255);
    expect(parseColor(' #0F0 ')).toEqual([0, 1, 0, 1]);
  });

  it('reads rgb() and rgba(), legacy and modern syntax', () => {
    expect(parseColor('rgb(255, 0, 0)')).toEqual([1, 0, 0, 1]);
    expect(parseColor('rgba(0, 0, 255, 0.5)')).toEqual([0, 0, 1, 0.5]);
    expect(parseColor('rgb(0 255 0 / 25%)')).toEqual([0, 1, 0, 0.25]);
    expect(parseColor('rgb(100%, 50%, 0%)')).toEqual([1, 0.5, 0, 1]);
  });

  it('gives magenta for colors it cannot read (no canvas in Node)', () => {
    expect(parseColor('not a color')).toEqual([1, 0, 1, 1]);
  });
});

describe('toRgba', () => {
  it('multiplies the alpha', () => {
    expect(toRgba('#ff8000', 0.5)).toBe('rgba(255, 128, 0, 0.5)');
    expect(toRgba('rgba(0, 0, 0, 0.5)', 0.5)).toBe('rgba(0, 0, 0, 0.25)');
  });
});
