/** r, g, b, a as 0..1 floats */
export type RGBA = [number, number, number, number];

const cache = new Map<string, RGBA>();
let probe: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null | undefined;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Parses any CSS color. Hex and rgb() are parsed directly; everything else (hsl, oklch, named
 * colors…) is painted on a 1×1 canvas and read back. Invalid colors give magenta, on purpose.
 */
export function parseColor(input: string): RGBA {
  const key = String(input).trim();
  let out = cache.get(key);
  if (!out) {
    out = parseHex(key) ?? parseRgb(key) ?? probeColor(key) ?? [1, 0, 1, 1];
    cache.set(key, out);
  }
  return out;
}

/** sRGB (0..1) to OKLab: where colors melt into each other without turning gray or muddy */
export function toOklab([r, g, b]: readonly number[]): [number, number, number] {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** `rgba(r, g, b, a)` string, for CSS gradients */
export function toRgba(input: string, alpha = 1): string {
  const [r, g, b, a] = parseColor(input);
  const c = (v: number) => Math.round(v * 255);
  return `rgba(${c(r)}, ${c(g)}, ${c(b)}, ${+(a * alpha).toFixed(3)})`;
}

function parseHex(s: string): RGBA | null {
  const m = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.exec(s);
  if (!m) return null;
  let h = m[1];
  if (h.length <= 4) h = [...h].map((c) => c + c).join('');
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  return [n(0), n(2), n(4), h.length === 8 ? n(6) : 1];
}

function parseRgb(s: string): RGBA | null {
  const m = /^rgba?\((.*)\)$/i.exec(s);
  if (!m) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const value = (p: string, max: number) => {
    const n = Number(p.endsWith('%') ? p.slice(0, -1) : p);
    return p.endsWith('%') ? n / 100 : n / max;
  };
  const out = [
    value(parts[0], 255),
    value(parts[1], 255),
    value(parts[2], 255),
    parts[3] === undefined ? 1 : value(parts[3], 1),
  ];
  return out.some((v) => !Number.isFinite(v)) ? null : (out.map(clamp01) as RGBA);
}

function probeColor(s: string): RGBA | null {
  if (probe === undefined) {
    probe = null;
    try {
      const canvas =
        typeof OffscreenCanvas !== 'undefined'
          ? new OffscreenCanvas(1, 1)
          : typeof document !== 'undefined'
            ? Object.assign(document.createElement('canvas'), { width: 1, height: 1 })
            : null;
      probe = (canvas?.getContext('2d', { willReadFrequently: true }) ?? null) as typeof probe;
    } catch {
      probe = null;
    }
  }
  if (!probe) return null;
  // an invalid color leaves fillStyle untouched: compare against two different starting values
  probe.fillStyle = '#000';
  probe.fillStyle = s;
  const a = probe.fillStyle;
  probe.fillStyle = '#fff';
  probe.fillStyle = s;
  if (a !== probe.fillStyle) return null;
  probe.clearRect(0, 0, 1, 1);
  probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  return [d[0] / 255, d[1] / 255, d[2] / 255, d[3] / 255];
}
