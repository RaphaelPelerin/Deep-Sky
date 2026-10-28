import {
  presetNames,
  presets,
  qualities,
  type Palette,
  type PresetName,
  type QualityPreset,
  type ResolvedOptions,
} from 'deep-sky';
import type { LayerKey } from './code';
import { PRESET_INFO, swatch } from './meta';

export interface PlaygroundHost {
  state(): ResolvedOptions;
  /** mutate the state, then everything is re-applied and the panel refreshed */
  change(mutate: (s: ResolvedOptions) => void): void;
  setPreset(name: PresetName): void;
  isDark(): boolean;
  randomize(): void;
  reset(): void;
  share(): void;
  copyCode(): void;
  hud: Flag;
  mainThread: Flag;
  /** the model shows on every section, not only the 3D one */
  pinned: Flag;
  /** your own model: a picked file or a URL */
  loadModelFile(file: File | undefined): void;
  loadModelUrl(url: string): void;
  /** the name of a model that is not in the shape list */
  modelLabel(src: unknown): string;
}

interface Flag {
  get(): boolean;
  set(on: boolean): void;
}

type Value = number | string | boolean;

interface Control {
  kind: 'range' | 'toggle' | 'choice' | 'select';
  label: string;
  get(s: ResolvedOptions): Value;
  set(s: ResolvedOptions, v: Value): void;
  min?: number;
  max?: number;
  step?: number;
  options?: [string, string][];
}

interface Group {
  title: string;
  layer?: LayerKey;
  open?: boolean;
  controls: Control[];
}

const read = (o: unknown, path: string) =>
  path.split('.').reduce<unknown>((v, k) => (v as Record<string, unknown>)[k], o) as Value;
const write = (o: unknown, path: string, value: Value) => {
  const keys = path.split('.');
  const last = keys.pop()!;
  const target = keys.reduce<unknown>((v, k) => (v as Record<string, unknown>)[k], o);
  (target as Record<string, unknown>)[last] = value;
};

const range = (path: string, label: string, min: number, max: number, step: number): Control => ({
  kind: 'range',
  label,
  min,
  max,
  step,
  get: (s) => read(s, path),
  set: (s, v) => write(s, path, v),
});
const toggle = (path: string, label: string): Control => ({
  kind: 'toggle',
  label,
  get: (s) => read(s, path),
  set: (s, v) => write(s, path, v),
});
const choice = (path: string, label: string, options: [string, string][]): Control => ({
  kind: 'choice',
  label,
  options,
  get: (s) => read(s, path),
  set: (s, v) => write(s, path, v),
});

const select = (path: string, label: string, options: [string, string][]): Control => ({
  ...choice(path, label, options),
  kind: 'select',
});

const QUALITY_NAMES = Object.keys(qualities) as QualityPreset[];

/** the showcase model (the demo always keeps one in its state) */
const MODEL_GROUP: Group = {
  title: '3D model',
  controls: [
    select('models.0.src', 'Shape', [
      ['orb', 'Orb'],
      ['knot', 'Knot'],
      ['torus', 'Torus'],
      ['crystal', 'Crystal'],
      ['gem', 'Gem'],
      ['planet', 'Planet'],
      ['cube', 'Cube'],
      ['/models/deep-sky-star.glb', '✦ Star (.glb)'],
    ]),
    select('models.0.material', 'Surface', [
      ['chrome', 'Chrome'],
      ['glass', 'Glass'],
      ['hologram', 'Hologram'],
      ['iridescent', 'Iridescent'],
      ['wire', 'Neon wire'],
      ['nebula', 'Nebula'],
      ['auto', 'Original'],
    ]),
    range('models.0.size', 'Size', 0.1, 1.2, 0.01),
    range('models.0.x', 'Left · right', 0, 1, 0.01),
    range('models.0.y', 'Top · bottom', 0, 1, 0.01),
    range('models.0.spin', 'Spin (°/s)', -120, 120, 1),
    range('models.0.morph', 'Liquid', 0, 2, 0.05),
    range('models.0.glow', 'Bloom', 0, 3, 0.05),
    range('models.0.rays', 'Light shafts', 0, 3, 0.05),
    range('models.0.follow', 'Follows cursor', 0, 1.5, 0.05),
    range('models.0.react', 'Shockwaves', 0, 3, 0.05),
    range('models.0.float', 'Float', 0, 3, 0.05),
    range('models.0.opacity', 'Opacity', 0, 1, 0.05),
  ],
};

const GROUPS: Group[] = [
  {
    title: 'Scene',
    open: true,
    controls: [
      choice('theme', 'Theme', [
        ['dark', 'Dark'],
        ['light', 'Light'],
        ['auto', 'Auto'],
      ]),
      range('speed', 'Speed', 0, 3, 0.05),
      choice('click', 'On click', [
        ['shockwave', 'Shockwave'],
        ['ring', 'Ring'],
        ['none', 'Nothing'],
      ]),
      range('grain', 'Film grain', 0, 0.12, 0.005),
      range('vignette', 'Vignette', 0, 1.5, 0.05),
    ],
  },
  {
    title: 'Nebula',
    layer: 'nebula',
    open: true,
    controls: [
      range('nebula.intensity', 'Intensity', 0, 2.5, 0.05),
      range('nebula.scale', 'Scale', 0.3, 3, 0.05),
      range('nebula.shimmer', 'Color drift', 0, 1, 0.02),
    ],
  },
  {
    title: 'Aurora',
    layer: 'aurora',
    controls: [
      range('aurora.intensity', 'Intensity', 0, 3, 0.05),
      range('aurora.position', 'Height', 0.3, 1.05, 0.01),
    ],
  },
  {
    title: 'Light beams',
    layer: 'rays',
    controls: [
      range('rays.intensity', 'Intensity', 0, 3, 0.05),
      range('rays.spread', 'Density', 0.3, 3, 0.05),
    ],
  },
  {
    title: 'Glow',
    layer: 'glow',
    controls: [range('glow.intensity', 'Intensity', 0, 3, 0.05), range('glow.lens', 'Lens', 0, 3, 0.05)],
  },
  {
    title: 'Stars',
    layer: 'stars',
    controls: [
      range('stars.density', 'Density', 0, 3, 0.05),
      range('stars.size', 'Size', 0.3, 3, 0.05),
      range('stars.twinkle', 'Twinkle', 0, 1, 0.05),
      range('stars.parallax', 'Parallax', 0, 3, 0.05),
      range('stars.speed', 'Drift', 0, 4, 0.05),
      toggle('stars.flares', 'Cross flares'),
    ],
  },
  {
    title: 'Shooting stars',
    layer: 'meteors',
    controls: [range('meteors.frequency', 'Frequency', 0.2, 5, 0.1)],
  },
  {
    title: 'Grid',
    layer: 'grid',
    controls: [
      range('grid.size', 'Cell size', 24, 160, 4),
      range('grid.speed', 'Speed', 0, 4, 0.05),
      range('grid.tilt', 'Tilt', 40, 85, 1),
      range('grid.height', 'Height', 0.2, 1, 0.01),
      range('grid.opacity', 'Opacity', 0, 1, 0.05),
    ],
  },
  {
    title: 'Cursor',
    layer: 'cursor',
    controls: [
      range('cursor.spotlight', 'Spotlight', 0, 2, 0.05),
      range('cursor.spotlightRadius', 'Spotlight size', 80, 600, 10),
      range('cursor.field', 'Swirl', 0, 3, 0.05),
      range('cursor.fieldRadius', 'Swirl radius', 60, 400, 10),
      toggle('cursor.constellations', 'Constellations'),
      range('cursor.linkDistance', 'Link distance', 40, 240, 5),
    ],
  },
];

const COLORS: [string, keyof Palette, number[]][] = [
  ['Background', 'background', []],
  ['Nebula', 'nebula', [0, 1, 2, 3]],
  ['Aurora', 'aurora', [0, 1]],
  ['Beams · glow', 'rays', []],
  ['', 'glow', []],
  ['Stars', 'stars', [0, 1, 2]],
  ['Spotlight', 'spotlight', [0, 1]],
  ['Lines · meteors', 'lines', []],
  ['', 'meteor', []],
];

function h<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

const toHex = (c: string) =>
  /^#[\da-f]{6}$/i.test(c)
    ? c.toLowerCase()
    : /^#[\da-f]{3}$/i.test(c)
      ? '#' + [...c.slice(1)].map((x) => x + x).join('').toLowerCase()
      : '#000000';

export function createPlayground(panel: HTMLElement, host: PlaygroundHost) {
  const syncs: (() => void)[] = [];

  const switchEl = (get: () => boolean, set: (on: boolean) => void, label: string) => {
    const sw = h('button', 'switch');
    sw.type = 'button';
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-label', label);
    sw.addEventListener('click', (e) => {
      // inside a <summary>: don't fold the group
      e.preventDefault();
      e.stopPropagation();
      set(!get());
    });
    syncs.push(() => sw.setAttribute('aria-checked', String(get())));
    return sw;
  };

  const control = (c: Control): HTMLElement => {
    if (c.kind === 'range') {
      const wrap = h('label', 'ctl');
      const out = h('output', 'ctl-value');
      const input = h('input');
      input.type = 'range';
      input.min = String(c.min);
      input.max = String(c.max);
      input.step = String(c.step);
      const decimals = (String(c.step).split('.')[1] ?? '').length;
      const paint = (v: number) => {
        out.textContent = v.toFixed(decimals);
        const p = ((Math.min(c.max!, Math.max(c.min!, v)) - c.min!) / (c.max! - c.min!)) * 100;
        input.style.setProperty('--p', `${p}%`);
      };
      input.addEventListener('input', () => {
        const v = +(+input.value).toFixed(decimals);
        paint(v);
        host.change((s) => c.set(s, v));
      });
      syncs.push(() => {
        const v = c.get(host.state()) as number;
        input.value = String(v);
        paint(v);
      });
      wrap.append(h('span', 'ctl-label', c.label), out, input);
      return wrap;
    }
    if (c.kind === 'toggle') {
      const row = h('div', 'ctl');
      const sw = switchEl(
        () => !!c.get(host.state()),
        (on) => host.change((s) => c.set(s, on)),
        c.label,
      );
      row.append(h('span', 'ctl-label', c.label), sw);
      return row;
    }
    if (c.kind === 'select') {
      const row = h('label', 'ctl');
      const sel = h('select', 'select');
      for (const [value, text] of c.options!) sel.append(new Option(text, value));
      // a value outside the list (a model loaded from a file): shown, not selectable
      const other = new Option('Your file', '');
      other.disabled = true;
      sel.append(other);
      sel.addEventListener('change', () => host.change((s) => c.set(s, sel.value)));
      syncs.push(() => {
        const v = c.get(host.state());
        const known = c.options!.some(([value]) => value === v);
        other.hidden = known;
        if (!known) other.textContent = host.modelLabel(v);
        sel.value = known ? String(v) : '';
      });
      row.append(h('span', 'ctl-label', c.label), sel);
      return row;
    }
    const row = h('div', 'ctl');
    const seg = h('div', 'seg');
    for (const [value, text] of c.options!) {
      const b = h('button', '', text);
      b.type = 'button';
      b.addEventListener('click', () => host.change((s) => c.set(s, value)));
      syncs.push(() => b.setAttribute('aria-pressed', String(c.get(host.state()) === value)));
      seg.append(b);
    }
    row.append(h('span', 'ctl-label', c.label), seg);
    return row;
  };

  const group = (title: string, open: boolean, body: HTMLElement, layer?: LayerKey) => {
    const details = h('details', 'group');
    details.open = open;
    const summary = h('summary');
    summary.append(h('span', 'group-title', title));
    if (layer) {
      summary.append(
        switchEl(
          () => host.state()[layer].enabled,
          (on) => host.change((s) => (s[layer].enabled = on)),
          `Show ${title}`,
        ),
      );
    }
    details.append(summary, body);
    return details;
  };

  // ---------- layout ----------

  panel.replaceChildren();
  const head = h('div', 'panel-head');
  const title = h('div', 'panel-title');
  title.append(h('strong', '', 'Playground'), h('span', '', 'Every change is live'));
  const close = h('button', 'icon-btn');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close the playground');
  close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  head.append(title, close);

  const body = h('div', 'panel-body');

  const chips = h('div', 'chips');
  for (const name of presetNames) {
    const chip = h('button', 'chip');
    chip.type = 'button';
    const dot = h('i');
    chip.append(dot, PRESET_INFO[name].label);
    chip.addEventListener('click', () => host.setPreset(name));
    syncs.push(() => {
      chip.setAttribute('aria-pressed', String(host.state().preset === name));
      dot.style.background = swatch(presets[name].palette[host.isDark() ? 'dark' : 'light']);
    });
    chips.append(chip);
  }
  body.append(chips);

  for (const g of GROUPS) {
    const inner = h('div', 'group-body');
    inner.append(...g.controls.map(control));
    body.append(group(g.title, !!g.open, inner, g.layer));
  }

  // 3D: its switch shows the model on every section
  const model = h('div', 'group-body');
  const [shapeControl, ...modelControls] = MODEL_GROUP.controls.map(control);
  // your own model: a file from the device, or a URL (CORS needed; the share link keeps it)
  const own = h('div', 'own-model');
  const pick = h('label', 'btn small');
  const input = h('input');
  input.type = 'file';
  input.accept = '.glb,.gltf,model/gltf-binary,model/gltf+json';
  input.addEventListener('change', () => {
    host.loadModelFile(input.files?.[0]);
    input.value = '';
  });
  pick.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4 14v3.5A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V14"/></svg>';
  pick.append('Your .glb / .gltf', input);
  const url = h('form', 'url-form');
  const field = h('input', 'text-input');
  field.type = 'url';
  field.placeholder = 'or a model URL, then Enter';
  field.setAttribute('aria-label', 'Model URL');
  url.append(field);
  url.addEventListener('submit', (e) => {
    e.preventDefault();
    host.loadModelUrl(field.value);
  });
  own.append(pick, url, h('p', 'group-note', 'Or drop a file anywhere on the page. Files stay on your device.'));
  model.append(shapeControl, own, ...modelControls);
  const modelGroup = group(MODEL_GROUP.title, false, model);
  modelGroup
    .querySelector('summary')!
    .append(switchEl(host.pinned.get, host.pinned.set, 'Show the model on every section'));
  body.append(modelGroup);

  // colors of the active theme
  const colors = h('div', 'group-body colors');
  const themeNote = h('p', 'group-note');
  colors.append(themeNote);
  syncs.push(() => {
    themeNote.textContent = `Editing the ${host.isDark() ? 'dark' : 'light'} palette.`;
  });
  let row: HTMLElement | null = null;
  for (const [label, key, indexes] of COLORS) {
    if (label || !row) {
      row = h('div', 'color-row');
      row.append(h('span', '', label), h('span', 'swatches'));
      colors.append(row);
    }
    const holder = row.lastElementChild as HTMLElement;
    for (const i of indexes.length ? indexes : [-1]) {
      const sw = h('label', 'swatch');
      const input = h('input');
      input.type = 'color';
      input.setAttribute('aria-label', `${String(key)} ${i >= 0 ? i + 1 : ''}`.trim());
      sw.title = `${String(key)}${i >= 0 ? ` ${i + 1}` : ''}`;
      const current = () => {
        const p = host.state().palette[host.isDark() ? 'dark' : 'light'];
        const v = p[key];
        return Array.isArray(v) ? v[i] : (v as string);
      };
      input.addEventListener('input', () =>
        host.change((s) => {
          const p = s.palette[host.isDark() ? 'dark' : 'light'];
          const v = p[key];
          if (Array.isArray(v)) v[i] = input.value;
          else (p as unknown as Record<string, string>)[key] = input.value;
        }),
      );
      syncs.push(() => {
        const hex = toHex(current());
        input.value = hex;
        sw.style.setProperty('--c', hex);
      });
      sw.append(input);
      holder.append(sw);
    }
  }
  body.append(group('Colors', false, colors));

  // performance
  const perf = h('div', 'group-body');
  perf.append(
    control({
      kind: 'choice',
      label: 'Quality',
      options: QUALITY_NAMES.map((q) => [q, q[0].toUpperCase() + q.slice(1)]),
      get: (s) =>
        QUALITY_NAMES.find((q) => JSON.stringify(qualities[q]) === JSON.stringify(s.quality)) ??
        'custom',
      set: (s, v) => (s.quality = { ...qualities[v as QualityPreset] }),
    }),
  );
  const flagRow = (label: string, flag: Flag) => {
    const r = h('div', 'ctl');
    r.append(h('span', 'ctl-label', label), switchEl(flag.get, flag.set, label));
    return r;
  };
  perf.append(
    flagRow('Show stats', host.hud),
    flagRow('Main thread only (no worker)', {
      get: host.mainThread.get,
      set: (on) => {
        host.mainThread.set(on);
        refresh();
      },
    }),
  );
  body.append(group('Performance', false, perf));

  const foot = h('div', 'panel-foot');
  const action = (label: string, icon: string, fn: () => void) => {
    const b = h('button', 'btn small');
    b.type = 'button';
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>`;
    b.append(label);
    b.addEventListener('click', fn);
    return b;
  };
  foot.append(
    action(
      'Randomize',
      '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.2"/><circle cx="15.5" cy="15.5" r="1.2"/><circle cx="12" cy="12" r="1.2"/>',
      host.randomize,
    ),
    action('Reset', '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>', host.reset),
    action(
      'Share link',
      '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
      host.share,
    ),
    action('Copy code', '<rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15V5.5A2.5 2.5 0 0 1 7.5 3H15"/>', host.copyCode),
  );

  panel.append(head, body, foot);

  // ---------- open / close ----------

  const setOpen = (open: boolean) => {
    panel.classList.toggle('open', open);
    panel.setAttribute('aria-hidden', String(!open));
    panel.inert = !open;
    document.body.classList.toggle('panel-open', open);
    if (open) close.focus({ preventScroll: true });
  };
  panel.inert = true;
  close.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('open')) setOpen(false);
  });

  const refresh = () => syncs.forEach((fn) => fn());
  refresh();

  return {
    refresh,
    open: () => setOpen(true),
    toggle: () => setOpen(!panel.classList.contains('open')),
  };
}
