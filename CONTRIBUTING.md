# Contributing

Thanks for helping the sky look better.

## Setup

```bash
npm install
npm run dev
```

The demo (`demo/`) imports the library straight from `src/`, so every change shows up live on http://localhost:5173. Open the playground and turn on **Show stats** to watch frame rates.

## Layout

| Path | What lives there |
| --- | --- |
| `src/engine/` | The renderer. No DOM access: it runs in a worker. `shader.ts` holds the GLSL. |
| `src/deep-sky.ts` | Main-thread controller: layers, events, worker boot and fallbacks. |
| `src/options.ts`, `src/presets.ts` | Option resolution and the built-in looks. |
| `src/element.ts`, `react.ts`, `vue.ts`, `svelte.ts` | Thin adapters over `createDeepSky`. |
| `scripts/worker-plugin.mjs` | Bundles the engine into an inline worker string at build time. |
| `demo/` | The site and playground deployed on Vercel. |

## Before opening a pull request

```bash
npm run typecheck
npm test
npm run build
```

New options need a default in `src/options.ts`, a line in the README tables and, when it makes sense, a control in `demo/src/playground.ts`. Visual changes are easier to review with a before/after screenshot (`npm run capture -- --check`).

## Ideas welcome

New presets, new layers, performance improvements on low-end devices, and framework adapters.
