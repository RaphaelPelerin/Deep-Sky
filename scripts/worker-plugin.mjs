import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/** virtual module → worker script entry */
const ENTRIES = {
  'virtual:deep-sky-worker': '../src/engine/worker.ts',
  // the 3D layer, loaded into the worker on demand
  'virtual:deep-sky-models-worker': '../src/models/worker.ts',
};

/**
 * Rollup-compatible plugin (works in tsdown/Rolldown and Vite).
 *
 * `import source from 'virtual:deep-sky-worker'` resolves to the whole render engine bundled as
 * a classic worker script, inlined as a string. The library spawns it from a Blob URL, so users
 * get off-main-thread rendering with zero bundler configuration.
 */
export function deepSkyWorker({ minify = true } = {}) {
  return {
    name: 'deep-sky-worker',
    resolveId(id) {
      return id in ENTRIES ? '\0' + id : null;
    },
    async load(id) {
      const entry = id.startsWith('\0') && ENTRIES[id.slice(1)];
      if (!entry) return null;
      const result = await build({
        entryPoints: [fileURLToPath(new URL(entry, import.meta.url))],
        bundle: true,
        write: false,
        format: 'iife',
        platform: 'browser',
        target: 'es2022',
        minify,
        legalComments: 'none',
        metafile: true,
      });
      for (const file of Object.keys(result.metafile.inputs)) this.addWatchFile?.(resolve(file));
      return `export default ${JSON.stringify(result.outputFiles[0].text)};`;
    },
  };
}
