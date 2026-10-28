import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const VIRTUAL = 'virtual:deep-sky-worker';
const RESOLVED = '\0' + VIRTUAL;
const ENTRY = fileURLToPath(new URL('../src/engine/worker.ts', import.meta.url));

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
      return id === VIRTUAL ? RESOLVED : null;
    },
    async load(id) {
      if (id !== RESOLVED) return null;
      const result = await build({
        entryPoints: [ENTRY],
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
