import { Engine } from './engine';
import type { EngineEvent, EngineMessage, ModelLayerApi } from './protocol';

/**
 * Worker entry: the engine renders on OffscreenCanvases transferred by the controller.
 * Bundled to a standalone script at build time (see scripts/worker-plugin.mjs).
 */

// typed by hand: the project compiles with DOM types, not WebWorker ones
const scope = self as unknown as {
  postMessage(message: EngineEvent): void;
  addEventListener(type: 'message', listener: (e: MessageEvent<EngineMessage>) => void): void;
  importScripts(url: string): void;
  deepSkyModels?: (canvas: OffscreenCanvas, emit: (event: EngineEvent) => void) => ModelLayerApi;
};

let engine: Engine | null = null;
const emit = (event: EngineEvent) => scope.postMessage(event);

scope.addEventListener('message', ({ data }) => {
  if (data.type === 'init') {
    engine = new Engine(data.gl, data.fx, emit, data);
  } else if (data.type === 'modelsInit') {
    // the 3D layer ships as a separate script, sent by the page when it needs it
    try {
      const url = URL.createObjectURL(new Blob([data.code], { type: 'text/javascript' }));
      scope.importScripts(url);
      URL.revokeObjectURL(url);
      if (!scope.deepSkyModels) throw new Error('the 3D layer did not load');
      engine?.attachModels(scope.deepSkyModels(data.canvas, emit));
    } catch (e) {
      emit({ type: 'modelError', key: '*', message: `3D layer: ${e instanceof Error ? e.message : e}` });
    }
  } else {
    engine?.handle(data);
  }
});

scope.postMessage({ type: 'boot' });
