import type { ModelAsset } from '../engine/protocol';

/**
 * Fetches a glTF model on the main thread (relative URLs resolve against the page): a .glb, or
 * a .gltf with its buffers and images, external or embedded. The result is transferable, the
 * render engine parses it where it runs.
 */

const GLB = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

async function get(url: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    // fetch says nothing more: offline, wrong host, or a server without CORS
    throw new Error(`could not download ${url} (network error, or the server does not allow CORS)`);
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res;
}

export async function loadAsset(
  src: string | URL | ArrayBuffer,
  base: string,
): Promise<{ asset: ModelAsset; transfer: ArrayBuffer[] }> {
  let url = base;
  let data: ArrayBuffer;
  if (src instanceof ArrayBuffer) {
    // a copy: the caller keeps its buffer
    data = src.slice(0);
  } else {
    url = new URL(String(src), base).href;
    data = await (await get(url)).arrayBuffer();
  }

  let gltf: Record<string, unknown> | undefined;
  let bin: ArrayBuffer | null = null;
  const view = new DataView(data);
  const text = (buf: ArrayBuffer) => new TextDecoder().decode(buf);
  if (data.byteLength >= 12 && view.getUint32(0, true) === GLB) {
    for (let at = 12; at + 8 <= data.byteLength; ) {
      const length = view.getUint32(at, true);
      const type = view.getUint32(at + 4, true);
      const chunk = data.slice(at + 8, at + 8 + length);
      if (type === JSON_CHUNK) gltf = JSON.parse(text(chunk));
      else if (type === BIN_CHUNK && !bin) bin = chunk;
      at += 8 + length;
    }
  } else {
    try {
      gltf = JSON.parse(text(data));
    } catch {
      // not JSON either
    }
  }
  if (!gltf || typeof gltf.asset !== 'object') throw new Error('not a glTF or GLB file');

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const json = gltf as any;
  const buffers: ArrayBuffer[] = await Promise.all(
    (json.buffers ?? []).map(async (b: any) =>
      b.uri === undefined ? (bin ?? new ArrayBuffer(b.byteLength ?? 0)) : (await get(new URL(b.uri, url).href)).arrayBuffer(),
    ),
  );
  const images = await Promise.all(
    (json.images ?? []).map(async (img: any) => {
      try {
        if (img.uri !== undefined) {
          const blob = await (await get(new URL(img.uri, url).href)).blob();
          return { data: await blob.arrayBuffer(), type: img.mimeType ?? blob.type ?? 'image/png' };
        }
        const v = json.bufferViews[img.bufferView];
        const start = v.byteOffset ?? 0;
        return { data: buffers[v.buffer].slice(start, start + v.byteLength), type: img.mimeType ?? 'image/png' };
      } catch {
        // a missing texture leaves the surface plain
        return null;
      }
    }),
  );
  const transfer = [...new Set([...buffers, ...images.flatMap((i) => (i ? [i.data] : []))])];
  return { asset: { gltf, buffers, images }, transfer };
}
