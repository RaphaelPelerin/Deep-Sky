/** the render engine bundled as a classic worker script (see scripts/worker-plugin.mjs) */
declare module 'virtual:deep-sky-worker' {
  const source: string;
  export default source;
}

/** the 3D layer, loaded into that worker when a page shows models */
declare module 'virtual:deep-sky-models-worker' {
  const source: string;
  export default source;
}
