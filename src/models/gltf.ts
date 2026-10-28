import type { ModelAsset } from '../engine/protocol';
import {
  computeNormals,
  defaultMaterial,
  normalize,
  unweld,
  type MeshData,
  type MeshMaterial,
} from './geometry';
import { compose, identity, multiply, normalMatrix, type Mat4, type Quat, type Vec3 } from './math';

/**
 * glTF 2.0 → meshes, with the node transforms baked in: triangles, normals, UVs, vertex colors
 * and the metallic-roughness material (base color, metal/rough, normal, emissive and occlusion
 * maps). Animations and skins are ignored: the model shows its rest pose.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

const SIZES: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const READERS: Record<number, [number, (v: DataView, o: number) => number, number]> = {
  5120: [1, (v, o) => v.getInt8(o), 127],
  5121: [1, (v, o) => v.getUint8(o), 255],
  5122: [2, (v, o) => v.getInt16(o, true), 32767],
  5123: [2, (v, o) => v.getUint16(o, true), 65535],
  5125: [4, (v, o) => v.getUint32(o, true), 1],
  5126: [4, (v, o) => v.getFloat32(o, true), 1],
};
/** extensions that change nothing for us, or only details */
const HARMLESS = ['KHR_materials_emissive_strength', 'KHR_texture_transform', 'KHR_materials_unlit'];

function read<T extends Float32Array | Uint32Array>(
  gltf: Json,
  buffers: ArrayBuffer[],
  index: number,
  Out: new (n: number) => T,
): T {
  const acc = gltf.accessors?.[index];
  if (!acc) throw new Error(`invalid glTF: accessor ${index} is missing`);
  const size = SIZES[acc.type] ?? 1;
  const out = new Out(acc.count * size);
  const reader = READERS[acc.componentType];
  // sparse-only accessors start from zeros, like the spec says
  if (acc.bufferView === undefined || !reader) return out;
  const [bytes, get, max] = reader;
  const view = gltf.bufferViews?.[acc.bufferView];
  const buffer = view && buffers[view.buffer];
  if (!buffer) throw new Error(`invalid glTF: no data for accessor ${index}`);
  const data = new DataView(buffer);
  const stride = view.byteStride || size * bytes;
  const start = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const norm = acc.normalized && out instanceof Float32Array ? max : 1;
  for (let i = 0; i < acc.count; i++) {
    const o = start + i * stride;
    for (let k = 0; k < size; k++) {
      const v = get(data, o + k * bytes);
      out[i * size + k] = norm === 1 ? v : Math.max(v / norm, -1);
    }
  }
  return out;
}

function material(gltf: Json, index: number | undefined): MeshMaterial {
  const m = defaultMaterial();
  const src = index === undefined ? null : gltf.materials?.[index];
  if (!src) return m;
  const pbr = src.pbrMetallicRoughness ?? {};
  const image = (ref: Json) => {
    const tex = ref && gltf.textures?.[ref.index];
    const source = tex?.source ?? tex?.extensions?.EXT_texture_webp?.source;
    return typeof source === 'number' ? source : -1;
  };
  if (pbr.baseColorFactor) {
    const [r, g, b, a] = pbr.baseColorFactor;
    m.base = [r, g, b, a];
  }
  m.metallic = pbr.metallicFactor ?? 1;
  m.roughness = pbr.roughnessFactor ?? 1;
  const strength = src.extensions?.KHR_materials_emissive_strength?.emissiveStrength ?? 1;
  const [er, eg, eb] = src.emissiveFactor ?? [0, 0, 0];
  m.emissive = [er * strength, eg * strength, eb * strength];
  m.baseTex = image(pbr.baseColorTexture);
  m.mrTex = image(pbr.metallicRoughnessTexture);
  m.normalTex = image(src.normalTexture);
  m.emissiveTex = image(src.emissiveTexture);
  m.occlusionTex = image(src.occlusionTexture);
  // emissive maps multiply the factor, which defaults to black
  if (m.emissiveTex >= 0 && m.emissive.every((c) => c === 0)) m.emissive = [strength, strength, strength];
  m.alphaMode = src.alphaMode === 'MASK' ? 1 : src.alphaMode === 'BLEND' ? 2 : 0;
  m.alphaCutoff = src.alphaCutoff ?? 0.5;
  if (src.extensions?.KHR_materials_unlit) {
    m.metallic = 0;
    m.roughness = 1;
  }
  return m;
}

function primitive(gltf: Json, buffers: ArrayBuffer[], prim: Json, world: Mat4): MeshData | null {
  if ((prim.mode ?? 4) !== 4 || prim.attributes?.POSITION === undefined) return null;
  const a = prim.attributes;
  const positions = read(gltf, buffers, a.POSITION, Float32Array);
  let indices = prim.indices === undefined ? null : read(gltf, buffers, prim.indices, Uint32Array);
  let normals: Float32Array | null =
    a.NORMAL === undefined ? null : read(gltf, buffers, a.NORMAL, Float32Array);
  const uvs = a.TEXCOORD_0 === undefined ? null : read(gltf, buffers, a.TEXCOORD_0, Float32Array);
  let colors: Float32Array | null = null;
  if (a.COLOR_0 !== undefined) {
    const raw = read(gltf, buffers, a.COLOR_0, Float32Array);
    const size = SIZES[gltf.accessors[a.COLOR_0].type];
    colors = new Float32Array((raw.length / size) * 4).fill(1);
    for (let i = 0; i < raw.length / size; i++) {
      for (let k = 0; k < size; k++) colors[i * 4 + k] = raw[i * size + k];
    }
  }

  // bake the node transform
  const m = world;
  for (let i = 0; i < positions.length; i += 3) {
    const [x, y, z] = [positions[i], positions[i + 1], positions[i + 2]];
    positions[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
    positions[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    positions[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
  const nm = normalMatrix(m);
  // a mirroring transform reverses the winding
  const det = nm[0] * (nm[4] * nm[8] - nm[5] * nm[7]) - nm[3] * (nm[1] * nm[8] - nm[2] * nm[7]) + nm[6] * (nm[1] * nm[5] - nm[2] * nm[4]);
  if (det < 0) {
    indices ??= Uint32Array.from({ length: positions.length / 3 }, (_, i) => i);
    for (let t = 0; t + 2 < indices.length; t += 3) [indices[t + 1], indices[t + 2]] = [indices[t + 2], indices[t + 1]];
  }
  if (normals) {
    for (let i = 0; i < normals.length; i += 3) {
      const [x, y, z] = [normals[i], normals[i + 1], normals[i + 2]];
      const nx = nm[0] * x + nm[3] * y + nm[6] * z;
      const ny = nm[1] * x + nm[4] * y + nm[7] * z;
      const nz = nm[2] * x + nm[5] * y + nm[8] * z;
      const l = Math.hypot(nx, ny, nz) || 1;
      normals[i] = nx / l;
      normals[i + 1] = ny / l;
      normals[i + 2] = nz / l;
    }
  } else {
    // no normals: the spec asks for flat shading, so every triangle gets its own vertices
    const flat = unweld({ positions, normals: positions, uvs, colors, indices, material: defaultMaterial() });
    return {
      positions: flat.positions,
      normals: computeNormals(flat.positions, null),
      uvs: flat.uvs,
      colors: flat.colors,
      indices: null,
      material: material(gltf, prim.material),
    };
  }
  return { positions, normals, uvs, colors, indices, material: material(gltf, prim.material) };
}

function local(node: Json): Mat4 {
  if (node.matrix) return Float32Array.from(node.matrix);
  return compose(
    (node.rotation ?? [0, 0, 0, 1]) as Quat,
    (node.translation ?? [0, 0, 0]) as Vec3,
    (node.scale ?? [1, 1, 1]) as Vec3,
  );
}

/** every triangle of the default scene, normalized to a unit box */
export function parseGltf(asset: ModelAsset): MeshData[] {
  const gltf: Json = asset.gltf;
  const unsupported = (gltf.extensionsRequired ?? []).filter((e: string) => !HARMLESS.includes(e));
  if (unsupported.length) {
    throw new Error(`unsupported glTF extension ${unsupported.join(', ')} (export without compression)`);
  }
  const meshes: MeshData[] = [];
  const visit = (index: number, parent: Mat4, depth: number) => {
    const node = gltf.nodes?.[index];
    if (!node || depth > 64) return;
    const world = multiply(parent, local(node));
    for (const prim of gltf.meshes?.[node.mesh]?.primitives ?? []) {
      const m = primitive(gltf, asset.buffers, prim, world);
      if (m) meshes.push(m);
    }
    for (const child of node.children ?? []) visit(child, world, depth + 1);
  };
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  if (scene) {
    for (const root of scene.nodes ?? []) visit(root, identity(), 0);
  } else {
    // no scene: every mesh, untransformed
    for (const m of gltf.meshes ?? []) {
      for (const prim of m.primitives ?? []) {
        const data = primitive(gltf, asset.buffers, prim, identity());
        if (data) meshes.push(data);
      }
    }
  }
  if (!meshes.length) throw new Error('no triangles in this glTF file');
  normalize(meshes);
  return meshes;
}
