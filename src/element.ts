import { mountDeepSky } from './deep-sky';
import type {
  ClickEffect,
  PresetName,
  QualityPreset,
  DeepSkyInstance,
  DeepSkyOptions,
  Theme,
} from './types';

/**
 * `<deep-sky>`: the background as a custom element.
 *
 * ```html
 * <deep-sky preset="aurora" fixed></deep-sky>
 * ```
 *
 * It fills its parent (or the viewport with `fixed`) behind the content. Simple options are
 * attributes; every option is available through the `options` property, which wins.
 */

const HOST_CSS =
  ':host{display:block;position:absolute;inset:0;z-index:-1;pointer-events:none;overflow:hidden}' +
  ':host([fixed]){position:fixed}';

const LAYERS = ['nebula', 'aurora', 'rays', 'glow', 'stars', 'meteors', 'grid', 'cursor'] as const;
/** the main setting of a layer when its attribute is a number */
const MAIN_SETTING: Partial<Record<(typeof LAYERS)[number], string>> = {
  nebula: 'intensity',
  aurora: 'intensity',
  rays: 'intensity',
  glow: 'intensity',
  stars: 'density',
  meteors: 'frequency',
  grid: 'speed',
};

let sheet: CSSStyleSheet | null = null;

function adoptStyles(shadow: ShadowRoot) {
  try {
    if (!sheet) {
      sheet = new CSSStyleSheet();
      sheet.replaceSync(HOST_CSS);
    }
    shadow.adoptedStyleSheets = [sheet];
  } catch {
    const style = document.createElement('style');
    style.textContent = HOST_CSS;
    shadow.append(style);
  }
}

const flag = (v: string | null) => (v === null ? undefined : v !== 'false');
const number = (v: string | null) => (v === null || v.trim() === '' || isNaN(+v) ? undefined : +v);

// server-side rendering: no HTMLElement to extend
const Base = (typeof HTMLElement === 'undefined' ? class {} : HTMLElement) as typeof HTMLElement;

export class DeepSkyElement extends Base {
  static observedAttributes = [
    'preset',
    'theme',
    'speed',
    'animate',
    'click',
    'quality',
    'intro',
    'worker',
    ...LAYERS,
  ];

  #instance: DeepSkyInstance | null = null;
  #options: DeepSkyOptions = {};
  #restoreParent: (() => void) | null = null;

  /** every option; wins over attributes */
  get options(): DeepSkyOptions {
    return this.#options;
  }
  set options(value: DeepSkyOptions) {
    this.#options = value ?? {};
    this.#sync();
  }

  get instance(): DeepSkyInstance | null {
    return this.#instance;
  }

  connectedCallback() {
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    if (!shadow.adoptedStyleSheets?.length && !shadow.querySelector('style')) adoptStyles(shadow);
    this.#adjustParent();
    this.#instance = mountDeepSky(this, this.#resolve(), {
      layerParent: shadow,
      scope: this.parentElement,
      adjust: false,
    });
  }

  disconnectedCallback() {
    this.#instance?.destroy();
    this.#instance = null;
    this.#restoreParent?.();
    this.#restoreParent = null;
  }

  attributeChangedCallback() {
    this.#sync();
  }

  pulse() {
    this.#instance?.pulse();
  }

  burst(x: number, y: number, effect?: 'shockwave' | 'ring') {
    this.#instance?.burst(x, y, effect);
  }

  play() {
    this.#instance?.play();
  }

  pause() {
    this.#instance?.pause();
  }

  #sync() {
    this.#instance?.set(this.#resolve(), true);
  }

  #resolve(): DeepSkyOptions {
    const attr = (name: string) => this.getAttribute(name);
    const out: Record<string, unknown> = {};
    if (attr('preset')) out.preset = attr('preset') as PresetName;
    if (attr('theme')) out.theme = attr('theme') as Theme;
    if (attr('click')) out.click = attr('click') as ClickEffect;
    if (attr('quality')) out.quality = attr('quality') as QualityPreset;
    if (number(attr('speed')) !== undefined) out.speed = number(attr('speed'));
    const animate = attr('animate');
    if (animate !== null) out.animate = animate === 'auto' ? 'auto' : animate !== 'false';
    if (flag(attr('intro')) !== undefined) out.intro = flag(attr('intro'));
    if (attr('worker') === 'false') out.worker = false;
    for (const name of LAYERS) {
      const value = attr(name);
      if (value === null) continue;
      const n = number(value);
      const main = MAIN_SETTING[name];
      out[name] = n !== undefined && main ? { [main]: n } : value !== 'false';
    }
    // the element is the positioned box: the layer just fills it
    return { ...(out as DeepSkyOptions), ...this.#options, fixed: false };
  }

  /** like createDeepSky does for its container: positioned parent, own stacking context */
  #adjustParent() {
    const parent = this.parentElement;
    if (!parent) return;
    const cs = getComputedStyle(parent);
    const undo: (() => void)[] = [];
    const set = (prop: string, value: string) => {
      const prev = parent.style.getPropertyValue(prop);
      parent.style.setProperty(prop, value);
      undo.push(() => parent.style.setProperty(prop, prev));
    };
    if (!this.hasAttribute('fixed') && parent !== document.body && cs.position === 'static') {
      set('position', 'relative');
    }
    if (cs.isolation !== 'isolate') set('isolation', 'isolate');
    this.#restoreParent = () => undo.forEach((fn) => fn());
  }
}

/** registers the element (done for `deep-sky` when this module loads) */
export function defineDeepSky(tag = 'deep-sky') {
  if (typeof customElements === 'undefined' || customElements.get(tag)) return;
  customElements.define(tag, tag === 'deep-sky' ? DeepSkyElement : class extends DeepSkyElement {});
}

defineDeepSky();

declare global {
  interface HTMLElementTagNameMap {
    'deep-sky': DeepSkyElement;
  }
}
