import { defineConfig } from 'tsdown';
import { deepSkyWorker } from './scripts/worker-plugin.mjs';

export default defineConfig([
  // ES modules for bundlers, with types
  {
    entry: {
      index: 'src/index.ts',
      element: 'src/element.ts',
      react: 'src/react.ts',
      vue: 'src/vue.ts',
      svelte: 'src/svelte.ts',
    },
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    dts: true,
    clean: false,
    plugins: [deepSkyWorker()],
  },
  // standalone worker script, for pages whose CSP forbids blob: workers
  {
    entry: { worker: 'src/engine/worker.ts' },
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    dts: false,
    clean: false,
  },
  // <script> tag build: global `DeepSky` + <deep-sky>
  {
    entry: { 'deep-sky': 'src/cdn.ts' },
    format: 'iife',
    globalName: 'DeepSky',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    dts: false,
    clean: false,
    plugins: [deepSkyWorker()],
  },
]);
