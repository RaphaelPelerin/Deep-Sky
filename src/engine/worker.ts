import { Engine } from './engine';
import type { EngineEvent, EngineMessage } from './protocol';

/**
 * Worker entry: the engine renders on OffscreenCanvases transferred by the controller.
 * Bundled to a standalone script at build time (see scripts/worker-plugin.mjs).
 */

// typed by hand: the project compiles with DOM types, not WebWorker ones
const scope = self as unknown as {
  postMessage(message: EngineEvent): void;
  addEventListener(type: 'message', listener: (e: MessageEvent<EngineMessage>) => void): void;
};

let engine: Engine | null = null;

scope.addEventListener('message', ({ data }) => {
  if (data.type === 'init') {
    engine = new Engine(data.gl, data.fx, (event) => scope.postMessage(event), data);
  } else {
    engine?.handle(data);
  }
});

scope.postMessage({ type: 'boot' });
