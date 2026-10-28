import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../src/engine/protocol';
import { normalize, shape, unweld } from '../src/models/geometry';
import { parseGltf } from '../src/models/gltf';
import { modelDefaults, modelKey, normalizeOptions, toEngineConfig } from '../src/options';

describe('models options', () => {
  it('has none by default', () => {
    expect(normalizeOptions().models).toEqual([]);
    expect(normalizeOptions({ models: false }).models).toEqual([]);
  });

  it('accepts a shape name, a model or a list', () => {
    expect(normalizeOptions({ models: 'knot' }).models).toEqual([{ ...modelDefaults, src: 'knot' }]);
    const list = normalizeOptions({ models: ['orb', { src: '/a.glb', material: 'glass', x: 0.2 }] }).models;
    expect(list.map((m) => [m.src, m.material, m.x])).toEqual([
      ['orb', 'auto', 0.5],
      ['/a.glb', 'glass', 0.2],
    ]);
  });

  it('fills missing rotation axes and drops models without a source', () => {
    const [m] = normalizeOptions({ models: [{ src: 'gem', rotation: [30] as never }, { src: '' }] }).models;
    expect(m.rotation).toEqual([30, 0, 0]);
    expect(normalizeOptions({ models: [{ src: '' }] }).models).toHaveLength(0);
  });

  it('identifies sources: shapes, URLs and buffers', () => {
    const buf = new ArrayBuffer(8);
    expect(modelKey('planet')).toBe('shape:planet');
    expect(modelKey('/models/ship.glb')).toBe('url:/models/ship.glb');
    expect(modelKey(buf)).toBe(modelKey(buf));
    expect(modelKey(buf)).not.toBe(modelKey(new ArrayBuffer(8)));
  });

  it('sends clamped values, radians and material ids to the engine', () => {
    const [m] = toEngineConfig(
      normalizeOptions({ models: { src: 'cube', material: 'wire', rotation: [180, 0, 0], spin: 90, morph: 9, color: '#ff0000' } }),
    ).models;
    expect(m.key).toBe('shape:cube');
    expect(m.material).toBe(MATERIALS.indexOf('wire'));
    expect(m.rotation[0]).toBeCloseTo(Math.PI);
    expect(m.spin).toBeCloseTo(Math.PI / 2);
    expect(m.morph).toBe(2);
    expect(m.color).toEqual([1, 0, 0]);
  });
});

describe('geometry', () => {
  it('builds every shape, normalized to a unit box, with unit normals', () => {
    for (const name of ['orb', 'knot', 'torus', 'crystal', 'gem', 'planet', 'cube']) {
      const meshes = shape(name);
      normalize(meshes);
      let max = 0;
      for (const m of meshes) {
        for (const v of m.positions) max = Math.max(max, Math.abs(v));
        for (let i = 0; i < m.normals.length; i += 3) {
          expect(Math.hypot(m.normals[i], m.normals[i + 1], m.normals[i + 2])).toBeCloseTo(1, 4);
        }
      }
      expect(max).toBeCloseTo(0.5, 2);
    }
  });

  it('winds triangles counter-clockwise when seen from outside', () => {
    const [m] = shape('orb');
    const p = m.positions;
    const idx = m.indices!;
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
      const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
      const v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
      const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      // the face normal points away from the center
      expect(f[0] * p[a] + f[1] * p[a + 1] + f[2] * p[a + 2]).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('unwelds triangles for the wireframe, with barycentric corners', () => {
    const [m] = shape('cube');
    const w = unweld(m);
    expect(w.count).toBe(36);
    expect(Array.from(w.bary.slice(0, 9))).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });
});

describe('parseGltf', () => {
  const f32 = (a: number[]) => new Uint8Array(new Float32Array(a).buffer);
  const triangle = (extra: Record<string, unknown> = {}) => {
    const pos = f32([0, 2, 0, -2, 0, 0, 2, 0, 0]);
    return {
      gltf: {
        asset: { version: '2.0' },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ children: [1], translation: [10, 0, 0] }, { mesh: 0, scale: [2, 2, 2] }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
        materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 0.5, 0, 1], metallicFactor: 0.2 }, emissiveFactor: [1, 1, 1] }],
        accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pos.length }],
        buffers: [{ byteLength: pos.length }],
        ...extra,
      },
      buffers: [pos.buffer],
      images: [],
    };
  };

  it('bakes node transforms, centers and scales to a unit box', () => {
    const [m] = parseGltf(triangle());
    const xs = [m.positions[0], m.positions[3], m.positions[6]];
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1);
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(0);
  });

  it('computes flat normals when the file has none', () => {
    const [m] = parseGltf(triangle());
    expect(Array.from(m.normals.slice(0, 3)).map((v) => Math.abs(v))).toEqual([0, 0, 1]);
  });

  it('reads the material', () => {
    const [m] = parseGltf(triangle());
    expect(m.material.base).toEqual([1, 0.5, 0, 1]);
    expect(m.material.metallic).toBe(0.2);
    expect(m.material.roughness).toBe(1);
    expect(m.material.emissive).toEqual([1, 1, 1]);
  });

  it('refuses compressed files with a clear message', () => {
    expect(() => parseGltf(triangle({ extensionsRequired: ['KHR_draco_mesh_compression'] }))).toThrow(/draco/i);
  });

  it('reports missing data instead of crashing', () => {
    expect(() => parseGltf(triangle({ bufferViews: [] }))).toThrow(/invalid glTF/);
  });
});
