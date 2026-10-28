import {
  modelDefaults,
  normalizeOptions,
  qualities,
  type Palette,
  type QualityPreset,
  type ResolvedOptions,
  type DeepSkyOptions,
} from 'deep-sky';

export const LAYERS = [
  'nebula',
  'aurora',
  'rays',
  'glow',
  'stars',
  'meteors',
  'grid',
  'cursor',
] as const;
export type LayerKey = (typeof LAYERS)[number];

const SCALARS = ['theme', 'speed', 'animate', 'intro', 'click', 'grain', 'vignette'] as const;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * the smallest options object that reproduces `cur` on top of its preset; a model loaded from
 * a local file shows as a placeholder path, or is left out of share links (`forLink`)
 */
export function minimalOptions(cur: ResolvedOptions, forLink = false): DeepSkyOptions {
  const base = normalizeOptions({ preset: cur.preset });
  const out: Record<string, unknown> = {};
  if (cur.preset && cur.preset !== 'cosmos') out.preset = cur.preset;
  for (const key of SCALARS) if (!same(cur[key], base[key])) out[key] = cur[key];
  for (const key of LAYERS) {
    const a = cur[key] as unknown as Record<string, unknown>;
    const b = base[key] as unknown as Record<string, unknown>;
    if (!a.enabled) {
      if (b.enabled) out[key] = false;
      continue;
    }
    const changes: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(a)) if (k !== 'enabled' && !same(v, b[k])) changes[k] = v;
    if (Object.keys(changes).length) out[key] = changes;
    else if (!b.enabled) out[key] = true;
  }
  if (!same(cur.quality, base.quality)) {
    const names = Object.keys(qualities) as QualityPreset[];
    out.quality = names.find((q) => same(qualities[q], cur.quality)) ?? cur.quality;
  }
  const palette: Record<string, Partial<Palette>> = {};
  for (const theme of ['dark', 'light'] as const) {
    const changes: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(cur.palette[theme])) {
      if (!same(v, base.palette[theme][k as keyof Palette])) changes[k] = v;
    }
    if (Object.keys(changes).length) palette[theme] = changes;
  }
  if (Object.keys(palette).length) out.palette = palette;
  const models = cur.models
    .filter((m) => !(forLink && m.src instanceof ArrayBuffer))
    .map((m) => {
      const changes: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(m)) {
        if (k !== 'src' && !same(v, modelDefaults[k as keyof typeof modelDefaults])) changes[k] = v;
      }
      const src = m.src instanceof ArrayBuffer ? '/your-model.glb' : String(m.src);
      return Object.keys(changes).length ? { src, ...changes } : src;
    });
  if (models.length) out.models = models.length === 1 ? models[0] : models;
  return out as DeepSkyOptions;
}

// ---------- share links ----------

export function encodeShare(options: DeepSkyOptions): string {
  const bytes = new TextEncoder().encode(JSON.stringify(options));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeShare(value: string): DeepSkyOptions | null {
  try {
    const bin = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? (parsed as DeepSkyOptions) : null;
  } catch {
    return null;
  }
}

// ---------- snippets ----------

export type Framework = 'vanilla' | 'react' | 'vue' | 'svelte' | 'angular' | 'element' | 'cdn';

export const FRAMEWORKS: [Framework, string][] = [
  ['vanilla', 'JavaScript'],
  ['react', 'React'],
  ['vue', 'Vue'],
  ['svelte', 'Svelte'],
  ['angular', 'Angular'],
  ['element', 'Web Component'],
  ['cdn', 'CDN'],
];

const IDENT = /^[A-Za-z_$][\w$]*$/;
const key = (k: string) => (IDENT.test(k) ? k : `'${k}'`);

/** JavaScript literal, short objects on one line */
function js(value: unknown, depth = 0): string {
  if (typeof value === 'string') return `'${value.replace(/'/g, "\\'")}'`;
  if (Array.isArray(value)) return `[${value.map((v) => js(v, depth + 1)).join(', ')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (!entries.length) return '{}';
    const flat = `{ ${entries.map(([k, v]) => `${key(k)}: ${js(v, depth + 1)}`).join(', ')} }`;
    if (depth > 0 && flat.length <= 64 && !flat.includes('\n')) return flat;
    const pad = '  '.repeat(depth);
    const lines = entries.map(([k, v]) => `${pad}  ${key(k)}: ${js(v, depth + 1)},`);
    return `{\n${lines.join('\n')}\n${pad}}`;
  }
  return String(value);
}

const ATTRIBUTES = ['preset', 'theme', 'speed', 'click'] as const;

/** simple options as HTML attributes, the rest for the `options` property */
function splitAttributes(o: DeepSkyOptions) {
  const attrs: string[] = [];
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if ((ATTRIBUTES as readonly string[]).includes(k) && typeof v !== 'object') attrs.push(`${k}="${v}"`);
    else if (k === 'models' && typeof v === 'string') attrs.push(`model="${v}"`);
    else if (v === false) attrs.push(`${k}="false"`);
    else rest[k] = v;
  }
  return { attrs: attrs.length ? ' ' + attrs.join(' ') : '', rest };
}

export function snippet(fw: Framework, o: DeepSkyOptions): string {
  const empty = Object.keys(o).length === 0;
  switch (fw) {
    case 'vanilla':
      return [
        `import { createDeepSky } from 'deep-sky';`,
        ``,
        `// the whole page; pass any element to light up a single section`,
        `const sky = createDeepSky(document.body${empty ? '' : `, ${js(o)}`});`,
        ``,
        `sky.pulse(); // light sweep, e.g. on route changes`,
      ].join('\n');

    case 'react': {
      const props = Object.entries(o).map(([k, v]) =>
        typeof v === 'string' ? `${k}="${v}"` : v === true ? k : `${k}={${js(v, 3)}}`,
      );
      const open =
        props.length > 1
          ? `<DeepSky\n      ${[...props, 'className="hero"'].join('\n      ')}\n    >`
          : `<DeepSky ${[...props, 'className="hero"'].join(' ')}>`;
      return [
        `import { DeepSky } from 'deep-sky/react';`,
        ``,
        `export function Hero() {`,
        `  return (`,
        `    ${open}`,
        `      <h1>Hello, universe</h1>`,
        `    </DeepSky>`,
        `  );`,
        `}`,
      ].join('\n');
    }

    case 'vue':
      return [
        `<script setup>`,
        `import { DeepSky } from 'deep-sky/vue';`,
        ``,
        `const options = ${js(o)};`,
        `</script>`,
        ``,
        `<template>`,
        `  <DeepSky :options="options" class="hero">`,
        `    <h1>Hello, universe</h1>`,
        `  </DeepSky>`,
        `</template>`,
      ].join('\n');

    case 'svelte':
      return [
        `<script>`,
        `  import { deepSky } from 'deep-sky/svelte';`,
        ``,
        `  const options = ${js(o, 1)};`,
        `</script>`,
        ``,
        `<section class="hero" use:deepSky={options}>`,
        `  <h1>Hello, universe</h1>`,
        `</section>`,
      ].join('\n');

    case 'angular':
      return [
        `import { DestroyRef, Directive, ElementRef, afterNextRender, effect, inject, input } from '@angular/core';`,
        `import { createDeepSky, type DeepSkyInstance, type DeepSkyOptions } from 'deep-sky';`,
        ``,
        `@Directive({ selector: '[deepSky]' })`,
        `export class DeepSkyDirective {`,
        `  readonly options = input<DeepSkyOptions>({}, { alias: 'deepSky' });`,
        `  private sky?: DeepSkyInstance;`,
        ``,
        `  constructor() {`,
        `    const el: HTMLElement = inject(ElementRef).nativeElement;`,
        `    afterNextRender(() => (this.sky = createDeepSky(el, this.options())));`,
        `    effect(() => this.sky?.set(this.options(), true));`,
        `    inject(DestroyRef).onDestroy(() => this.sky?.destroy());`,
        `  }`,
        `}`,
        ``,
        `// in a component: options = ${js(o, 0).replace(/\n/g, '\n// ')};`,
        `// <section class="hero" [deepSky]="options">…</section>`,
      ].join('\n');

    case 'element':
    case 'cdn': {
      const { attrs, rest } = splitAttributes(o);
      const load =
        fw === 'cdn'
          ? [`<script src="https://unpkg.com/deep-sky"></script>`]
          : [`<script type="module">`, `  import 'deep-sky/element';`, `</script>`];
      const extra = Object.keys(rest).length
        ? [
            ``,
            `<script${fw === 'element' ? ' type="module"' : ''}>`,
            `  document.querySelector('deep-sky').options = ${js(rest, 1)};`,
            `</script>`,
          ]
        : [];
      return [
        ...load,
        ``,
        `<!-- fills its parent; add "fixed" to cover the whole viewport -->`,
        `<deep-sky${attrs}></deep-sky>`,
        ...extra,
      ].join('\n');
    }
  }
}

// ---------- highlighting ----------

const TOKENS =
  /(\/\/[^\n]*|<!--[\s\S]*?-->)|('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")|(@[A-Za-z]+)|\b(import|from|export|const|let|function|return|class|new|readonly|private|constructor|true|false|null|type)\b|\b(\d+(?:\.\d+)?)\b|(<\/?[A-Za-z][\w-]*|\/?>)/g;
const CLASSES = ['', 'com', 'str', 'dec', 'kw', 'num', 'tag'];

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function highlight(code: string): string {
  let out = '';
  let last = 0;
  for (const m of code.matchAll(TOKENS)) {
    const group = m.findIndex((g, i) => i > 0 && g !== undefined);
    out += escape(code.slice(last, m.index)) + `<span class="t-${CLASSES[group]}">${escape(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return out + escape(code.slice(last));
}
