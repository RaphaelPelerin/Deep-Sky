import { defineComponent, h, onBeforeUnmount, onMounted, shallowRef, watch, type PropType } from 'vue';
import { createDeepSky } from './deep-sky';
import type { DeepSkyInstance, DeepSkyOptions } from './types';

/**
 * A container with a deep-sky background behind its slot.
 *
 * ```vue
 * <DeepSky :options="{ preset: 'aurora' }" class="hero">
 *   <h1>Hello, universe</h1>
 * </DeepSky>
 * ```
 */
export const DeepSky = defineComponent({
  name: 'DeepSky',
  props: {
    options: { type: Object as PropType<DeepSkyOptions>, default: () => ({}) },
    /** element rendered as the container */
    tag: { type: String, default: 'div' },
  },
  emits: {
    ready: (_instance: DeepSkyInstance) => true,
  },
  setup(props, { slots, emit, expose }) {
    const el = shallowRef<HTMLElement | null>(null);
    let instance: DeepSkyInstance | null = null;

    onMounted(() => {
      if (!el.value) return;
      instance = createDeepSky(el.value, { ...props.options });
      emit('ready', instance);
    });
    watch(
      () => props.options,
      (options) => instance?.set({ ...options }, true),
      { deep: true },
    );
    onBeforeUnmount(() => {
      instance?.destroy();
      instance = null;
    });

    expose({
      pulse: () => instance?.pulse(),
      burst: (x: number, y: number, effect?: 'shockwave' | 'ring') => instance?.burst(x, y, effect),
      getInstance: () => instance,
    });
    return () => h(props.tag, { ref: el }, slots.default?.());
  },
});
