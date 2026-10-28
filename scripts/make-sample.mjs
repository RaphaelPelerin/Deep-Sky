/**
 * Builds the demo's sample model: the ✦ logo as a faceted 3D star, written as a real .glb
 * (positions, vertex colors and indices; no normals, so viewers compute flat ones).
 *
 *   node scripts/make-sample.mjs   →   demo/public/models/deep-sky-star.glb
 */
import { mkdir, writeFile } from 'node:fs/promises';

// the logo's outline: four concave cubic curves (from favicon.svg), centered on 0
const QUADRANT = [[32, 4], [33.8, 24.5], [39.5, 30.2], [60, 32]];
const STEPS = 10;
const outline = [];
for (let q = 0; q < 4; q++) {
  const angle = (q * Math.PI) / 2;
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  for (let i = 0; i < STEPS; i++) {
    const t = i / STEPS;
    const u = 1 - t;
    const [x, y] = [0, 1].map(
      (k) =>
        u * u * u * QUADRANT[0][k] + 3 * u * u * t * QUADRANT[1][k] + 3 * u * t * t * QUADRANT[2][k] + t * t * t * QUADRANT[3][k],
    );
    // svg y points down; rotate the quadrant around the center
    const [px, py] = [(x - 32) / 28, (32 - y) / 28];
    outline.push([px * c - py * s, px * s + py * c]);
  }
}

// a thin rim (two rings) and a point in front and behind: a star ornament
const RIM = 0.05;
const TIP = 0.34;
const positions = [];
const colors = [];
const indices = [];
const from = [0.83, 0.9, 1];
const to = [0.71, 0.61, 1];
const vertex = (x, y, z) => {
  positions.push(x, y, z);
  const t = Math.min(1, Math.max(0, (x - y + 1.4) / 2.8));
  colors.push(...from.map((v, k) => v + (to[k] - v) * t), 1);
  return positions.length / 3 - 1;
};
const n = outline.length;
const front = outline.map(([x, y]) => vertex(x, y, RIM));
const back = outline.map(([x, y]) => vertex(x, y, -RIM));
const tipFront = vertex(0, 0, TIP);
const tipBack = vertex(0, 0, -TIP);
for (let i = 0; i < n; i++) {
  const j = (i + 1) % n;
  indices.push(tipFront, front[i], front[j]);
  indices.push(tipBack, back[j], back[i]);
  indices.push(front[i], back[i], back[j], front[i], back[j], front[j]);
}

// ---------- GLB ----------
const pad4 = (buf, fill = 0) => Buffer.concat([buf, Buffer.alloc((4 - (buf.length % 4)) % 4, fill)]);
const pos = Buffer.from(new Float32Array(positions).buffer);
const col = Buffer.from(new Float32Array(colors).buffer);
const idx = pad4(Buffer.from(new Uint16Array(indices).buffer));
const bin = Buffer.concat([pos, col, idx]);
const min = [0, 1, 2].map((k) => Math.min(...positions.filter((_, i) => i % 3 === k)));
const max = [0, 1, 2].map((k) => Math.max(...positions.filter((_, i) => i % 3 === k)));
const gltf = {
  asset: { version: '2.0', generator: 'deep-sky make-sample' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'star' }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, COLOR_0: 1 }, indices: 2, material: 0 }] }],
  materials: [
    {
      name: 'starlight',
      pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.85, roughnessFactor: 0.18 },
      emissiveFactor: [0.06, 0.05, 0.12],
    },
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min, max },
    { bufferView: 1, componentType: 5126, count: colors.length / 4, type: 'VEC4' },
    { bufferView: 2, componentType: 5123, count: indices.length, type: 'SCALAR' },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: pos.length, target: 34962 },
    { buffer: 0, byteOffset: pos.length, byteLength: col.length, target: 34962 },
    { buffer: 0, byteOffset: pos.length + col.length, byteLength: indices.length * 2, target: 34963 },
  ],
  buffers: [{ byteLength: bin.length }],
};
const json = pad4(Buffer.from(JSON.stringify(gltf)), 0x20);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
const chunk = (data, type) => {
  const head = Buffer.alloc(8);
  head.writeUInt32LE(data.length, 0);
  head.writeUInt32LE(type, 4);
  return Buffer.concat([head, data]);
};
const glb = Buffer.concat([header, chunk(json, 0x4e4f534a), chunk(bin, 0x004e4942)]);
await mkdir('demo/public/models', { recursive: true });
await writeFile('demo/public/models/deep-sky-star.glb', glb);
console.log(`✓ demo/public/models/deep-sky-star.glb (${glb.length} bytes, ${indices.length / 3} triangles)`);
