import type { EngineEvent } from '../engine/protocol';
import { ModelLayer } from './layer';

/**
 * The 3D layer as a script for the engine's worker, which loads it only when a page shows
 * models (see scripts/worker-plugin.mjs): the core worker stays small.
 */
(self as unknown as { deepSkyModels: unknown }).deepSkyModels = (
  canvas: OffscreenCanvas,
  emit: (event: EngineEvent) => void,
) => new ModelLayer(canvas, emit);
