import type { SHAPES } from '../engine/protocol';

/** Meshes on the CPU: built-in shapes, normals, normalization and the wireframe variant */

export interface MeshMaterial {
  /** linear-ish base color and alpha */
  base: [number, number, number, number];
  metallic: number;
  roughness: number;
  emissive: [number, number, number];
  /** image indices, -1 = none */
  baseTex: number;
  mrTex: number;
  normalTex: number;
  emissiveTex: number;
  occlusionTex: number;
  /** 0 opaque, 1 mask, 2 blend */
  alphaMode: number;
  alphaCutoff: number;
}

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array | null;
  colors: Float32Array | null;
  indices: Uint32Array | null;
  material: MeshMaterial;
}

type ShapeName = (typeof SHAPES)[number];

export const defaultMaterial = (): MeshMaterial => ({
  base: [1, 1, 1, 1],
  metallic: 1,
  roughness: 1,
  emissive: [0, 0, 0],
  baseTex: -1,
  mrTex: -1,
  normalTex: -1,
  emissiveTex: -1,
  occlusionTex: -1,
  alphaMode: 0,
  alphaCutoff: 0.5,
});

/** a polished white surface for the built-in shapes */
const shapeMaterial = (): MeshMaterial => ({ ...defaultMaterial(), metallic: 1, roughness: 0.12 });

const TAU = Math.PI * 2;

function mesh(positions: number[], normals: number[], uvs: number[] | null, indices: number[] | null): MeshData {
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: uvs && new Float32Array(uvs),
    colors: null,
    indices: indices && new Uint32Array(indices),
    material: shapeMaterial(),
  };
}

/** a parametric surface, (u, v) in [0, 1]², wrapped into a grid of quads */
function surface(
  segU: number,
  segV: number,
  at: (u: number, v: number) => [number, number, number, number, number, number],
): MeshData {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= segV; j++) {
    for (let i = 0; i <= segU; i++) {
      const p = at(i / segU, j / segV);
      pos.push(p[0], p[1], p[2]);
      nor.push(p[3], p[4], p[5]);
      uv.push(i / segU, j / segV);
    }
  }
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = j * (segU + 1) + i;
      const b = a + segU + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  return orient(mesh(pos, nor, uv, idx));
}

/** flips the triangles whose winding disagrees with their vertex normals (front = counter-clockwise) */
function orient(m: MeshData): MeshData {
  const { positions: p, normals: n, indices } = m;
  if (!indices) return m;
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t] * 3, indices[t + 1] * 3, indices[t + 2] * 3];
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const dot = fx * (n[a] + n[b] + n[c]) + fy * (n[a + 1] + n[b + 1] + n[c + 1]) + fz * (n[a + 2] + n[b + 2] + n[c + 2]);
    if (dot < 0) {
      indices[t + 1] = c / 3;
      indices[t + 2] = b / 3;
    }
  }
  return m;
}

/** faceted shape from a convex point hull given as triangles: flat normals pointing outwards */
function faceted(points: number[][], tris: number[][]): MeshData {
  const pos: number[] = [];
  const nor: number[] = [];
  const center = [0, 1, 2].map((k) => points.reduce((s, p) => s + p[k], 0) / points.length);
  for (let [a, b, c] of tris) {
    let [pa, pb, pc] = [points[a], points[b], points[c]];
    const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    let f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const out = [0, 1, 2].map((k) => (pa[k] + pb[k] + pc[k]) / 3 - center[k]);
    if (f[0] * out[0] + f[1] * out[1] + f[2] * out[2] < 0) {
      [b, c] = [c, b];
      [pb, pc] = [pc, pb];
      f = f.map((x) => -x);
    }
    const l = Math.hypot(f[0], f[1], f[2]) || 1;
    for (const p of [pa, pb, pc]) {
      pos.push(p[0], p[1], p[2]);
      nor.push(f[0] / l, f[1] / l, f[2] / l);
    }
  }
  return mesh(pos, nor, null, null);
}

function sphere(radius: number, segU = 96, segV = 64): MeshData {
  return surface(segU, segV, (u, v) => {
    const th = u * TAU;
    const ph = v * Math.PI;
    const x = Math.sin(ph) * Math.cos(th);
    const y = Math.cos(ph);
    const z = Math.sin(ph) * Math.sin(th);
    return [x * radius, y * radius, z * radius, x, y, z];
  });
}

function torus(R: number, r: number, low: boolean): MeshData {
  return surface(low ? 32 : 128, low ? 12 : 48, (u, v) => {
    const th = u * TAU;
    const ph = v * TAU;
    const nx = Math.cos(ph) * Math.cos(th);
    const ny = Math.cos(ph) * Math.sin(th);
    const nz = Math.sin(ph);
    return [R * Math.cos(th) + r * nx, R * Math.sin(th) + r * ny, r * nz, nx, ny, nz];
  });
}

/** (2, 3) torus knot: a tube around the curve, framed like a ribbon that follows it */
function knot(low: boolean): MeshData {
  const P = 2;
  const Q = 3;
  const curve = (t: number) => {
    const r = 0.5 * (2 + Math.cos(Q * t));
    return [r * Math.cos(P * t), r * Math.sin(P * t), 0.5 * Math.sin(Q * t)];
  };
  const tube = 0.26;
  return surface(low ? 128 : 320, low ? 8 : 40, (u, v) => {
    const t = u * TAU;
    const p1 = curve(t);
    const p2 = curve(t + 0.01);
    const T = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
    let N = [p2[0] + p1[0], p2[1] + p1[1], p2[2] + p1[2]];
    const B = [T[1] * N[2] - T[2] * N[1], T[2] * N[0] - T[0] * N[2], T[0] * N[1] - T[1] * N[0]];
    N = [B[1] * T[2] - B[2] * T[1], B[2] * T[0] - B[0] * T[2], B[0] * T[1] - B[1] * T[0]];
    const lb = Math.hypot(B[0], B[1], B[2]);
    const ln = Math.hypot(N[0], N[1], N[2]);
    const cx = -Math.cos(v * TAU);
    const cy = Math.sin(v * TAU);
    const n = [0, 1, 2].map((k) => (cx * N[k]) / ln + (cy * B[k]) / lb);
    return [p1[0] + tube * n[0], p1[1] + tube * n[1], p1[2] + tube * n[2], n[0], n[1], n[2]];
  });
}

/** a hexagonal quartz: long point on top, short one below */
function crystal(): MeshData {
  const pts: number[][] = [[0, 1.05, 0], [0, -0.7, 0]];
  for (let ring = 0; ring < 2; ring++) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + ring * 0.08;
      const r = 0.36 + ring * 0.02;
      pts.push([Math.cos(a) * r, ring ? -0.3 : 0.42, Math.sin(a) * r]);
    }
  }
  const tris: number[][] = [];
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    const [ua, ub, la, lb] = [2 + i, 2 + j, 8 + i, 8 + j];
    tris.push([0, ua, ub], [ua, la, ub], [ub, la, lb], [1, lb, la]);
  }
  return faceted(pts, tris);
}

function icosahedron(): MeshData {
  const t = (1 + Math.sqrt(5)) / 2;
  const pts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  const tris = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  return faceted(pts, tris);
}

function cube(): MeshData {
  const pts: number[][] = [];
  for (let i = 0; i < 8; i++) pts.push([i & 1 ? 0.5 : -0.5, i & 2 ? 0.5 : -0.5, i & 4 ? 0.5 : -0.5]);
  const quads = [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]];
  return faceted(pts, quads.flatMap(([a, b, c, d]) => [[a, b, c], [a, c, d]]));
}

/** a flat ring around the planet: both of its sides are lit */
function rings(inner: number, outer: number, low: boolean): MeshData {
  return surface(low ? 48 : 160, low ? 2 : 1, (u, v) => {
    const th = u * TAU;
    const r = inner + (outer - inner) * v;
    return [Math.cos(th) * r, 0, Math.sin(th) * r, 0, 1, 0];
  });
}

function merge(parts: MeshData[]): MeshData {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const part of parts) {
    const base = pos.length / 3;
    pos.push(...part.positions);
    nor.push(...part.normals);
    if (part.uvs) uv.push(...part.uvs);
    else for (let i = 0; i < part.positions.length / 3; i++) uv.push(0, 0);
    if (part.indices) for (const i of part.indices) idx.push(i + base);
    else for (let i = 0; i < part.positions.length / 3; i++) idx.push(i + base);
  }
  return mesh(pos, nor, uv, idx);
}

function tilt(m: MeshData, angle: number): MeshData {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  for (const arr of [m.positions, m.normals]) {
    for (let i = 0; i < arr.length; i += 3) {
      const x = arr[i];
      const y = arr[i + 1];
      arr[i] = x * c - y * s;
      arr[i + 1] = x * s + y * c;
    }
  }
  return m;
}

/** a built-in shape; `low`: fewer triangles, for the wireframe (dense meshes glow as a blob) */
export function shape(name: string, low = false): MeshData[] {
  switch (name as ShapeName) {
    case 'knot':
      return [knot(low)];
    case 'torus':
      return [torus(0.36, 0.15, low)];
    case 'crystal':
      return [crystal()];
    case 'gem':
      return [icosahedron()];
    case 'planet':
      return [tilt(merge([low ? sphere(0.42, 20, 12) : sphere(0.42), rings(0.56, 0.86, low)]), 0.38)];
    case 'cube':
      return [cube()];
    default:
      return [low ? sphere(0.5, 22, 14) : sphere(0.5)];
  }
}

/** smooth normals from the triangles, when a file has none */
export function computeNormals(positions: Float32Array, indices: Uint32Array | null): Float32Array {
  const n = new Float32Array(positions.length);
  const count = indices ? indices.length : positions.length / 3;
  for (let t = 0; t < count; t += 3) {
    const [a, b, c] = indices ? [indices[t], indices[t + 1], indices[t + 2]] : [t, t + 1, t + 2];
    const p = positions;
    const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
    const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    for (const v of [a, b, c]) {
      n[v * 3] += fx;
      n[v * 3 + 1] += fy;
      n[v * 3 + 2] += fz;
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l;
    n[i + 1] /= l;
    n[i + 2] /= l;
  }
  return n;
}

/** centers the meshes and scales them so that their largest side is 1 */
export function normalize(meshes: MeshData[]) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) {
    const p = m.positions;
    for (let i = 0; i < p.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (p[i + k] < min[k]) min[k] = p[i + k];
        if (p[i + k] > max[k]) max[k] = p[i + k];
      }
    }
  }
  if (!isFinite(min[0])) return;
  const center = [0, 1, 2].map((k) => (min[k] + max[k]) / 2);
  const scale = 1 / (Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1);
  for (const m of meshes) {
    const p = m.positions;
    for (let i = 0; i < p.length; i += 3) {
      for (let k = 0; k < 3; k++) p[i + k] = (p[i + k] - center[k]) * scale;
    }
  }
}

/** one vertex per triangle corner, with barycentric coordinates: the wireframe draws the edges */
export function unweld(m: MeshData) {
  const count = m.indices ? m.indices.length : m.positions.length / 3;
  const at = (i: number) => (m.indices ? m.indices[i] : i);
  const take = (src: Float32Array, size: number) => {
    const out = new Float32Array(count * size);
    for (let i = 0; i < count; i++) {
      const v = at(i);
      for (let k = 0; k < size; k++) out[i * size + k] = src[v * size + k];
    }
    return out;
  };
  const bary = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) bary[i * 3 + (i % 3)] = 1;
  return {
    positions: take(m.positions, 3),
    normals: take(m.normals, 3),
    uvs: m.uvs && take(m.uvs, 2),
    colors: m.colors && take(m.colors, 4),
    bary,
    count,
  };
}
