import { createDeepSky } from './deep-sky';
import type { DeepSkyOptions } from './types';

/**
 * Svelte action (Svelte 3, 4 and 5):
 *
 * ```svelte
 * <section class="hero" use:deepSky={{ preset: 'aurora' }}>…</section>
 * ```
 */
export function deepSky(node: HTMLElement, options: DeepSkyOptions = {}) {
  const instance = createDeepSky(node, options);
  return {
    update(next: DeepSkyOptions = {}) {
      instance.set(next, true);
    },
    destroy() {
      instance.destroy();
    },
  };
}
