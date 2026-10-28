import {
  createElement,
  useEffect,
  useRef,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { createDeepSky } from './deep-sky';
import type { DeepSkyInstance, DeepSkyOptions } from './types';

export interface DeepSkyProps extends DeepSkyOptions {
  /** element rendered as the container (default 'div') */
  as?: keyof HTMLElementTagNameMap;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  /** called once the background is mounted, with its instance (pulse, burst, pause…) */
  onReady?: (instance: DeepSkyInstance) => void;
}

/** value snapshot of the options, so that new object literals on each render don't re-apply */
const snapshot = (options: DeepSkyOptions) =>
  JSON.stringify(options, (_key, value: unknown) => (typeof value === 'function' ? true : value));

/**
 * A container with a deep-sky background behind its children.
 *
 * ```tsx
 * <DeepSky preset="aurora" className="hero">
 *   <h1>Hello, universe</h1>
 * </DeepSky>
 * ```
 */
export function DeepSky({
  as = 'div',
  className,
  style,
  children,
  onReady,
  ...options
}: DeepSkyProps): ReactElement {
  const ref = useRef<HTMLElement | null>(null);
  const instance = useRef<DeepSkyInstance | null>(null);
  const latest = useRef(options);
  latest.current = options;
  const ready = useRef(onReady);
  ready.current = onReady;
  const applied = useRef('');
  const key = snapshot(options);

  // callbacks that always call the latest props
  const withCallbacks = (): DeepSkyOptions => {
    const o = latest.current;
    return {
      ...o,
      onStats: o.onStats && ((stats) => latest.current.onStats?.(stats)),
      onFallback: o.onFallback && ((mode, reason) => latest.current.onFallback?.(mode, reason)),
    };
  };

  useEffect(() => {
    if (!ref.current) return;
    const sky = createDeepSky(ref.current, withCallbacks());
    instance.current = sky;
    applied.current = snapshot(latest.current);
    ready.current?.(sky);
    return () => {
      sky.destroy();
      instance.current = null;
    };
  }, []);

  useEffect(() => {
    if (!instance.current || applied.current === key) return;
    applied.current = key;
    instance.current.set(withCallbacks(), true);
  }, [key]);

  return createElement(as as 'div', { ref: ref as Ref<HTMLDivElement>, className, style }, children);
}
