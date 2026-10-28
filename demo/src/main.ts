import '@fontsource-variable/inter';
import './style.css';
import {
  createDeepSky,
  modelDefaults,
  modelShapes,
  normalizeOptions,
  presetNames,
  presets,
  type ModelMaterial,
  type PresetName,
  type QualityPreset,
  type ResolvedModel,
  type ResolvedOptions,
  type DeepSkyInstance,
  type DeepSkyOptions,
  type DeepSkyStats,
  type Theme,
} from 'deep-sky';
import {
  FRAMEWORKS,
  LAYERS,
  decodeShare,
  encodeShare,
  highlight,
  minimalOptions,
  snippet,
  type Framework,
  type LayerKey,
} from './code';
import { LAYER_INFO, PRESET_INFO, hslToHex, layerColor, swatch } from './meta';
import { createPlayground } from './playground';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector(selector) as T;

const params = new URLSearchParams(location.search);
const root = document.documentElement;
// screenshot modes: ?ui=0 (sky only), ?shot=hero (nav + hero)
if (params.get('ui') === '0') root.classList.add('capture');
if (params.get('shot') === 'hero') root.classList.add('shot-hero');

/** options with every default, deep-copied so the playground can mutate them */
const fresh = (options: DeepSkyOptions = {}): ResolvedOptions =>
  structuredClone(normalizeOptions(options));

const THEMES: Theme[] = ['dark', 'light', 'auto'];

function initialState(): ResolvedOptions {
  const shared = location.hash.startsWith('#c=') ? decodeShare(location.hash.slice(3)) : null;
  if (shared) return fresh(shared);
  const options: DeepSkyOptions = {};
  const preset = params.get('preset');
  if (preset && preset in presets) options.preset = preset as PresetName;
  const theme = params.get('theme') as Theme | null;
  if (theme && THEMES.includes(theme)) options.theme = theme;
  const quality = params.get('quality');
  if (quality) options.quality = quality as QualityPreset;
  // ?model=knot&material=glass&morph=1: a model in the middle of the sky
  const src = params.get('model');
  if (src && (modelShapes as readonly string[]).includes(src)) {
    options.models = {
      src,
      material: (params.get('material') as ModelMaterial | null) ?? 'chrome',
      morph: Number(params.get('morph')) || 0,
      size: Number(params.get('size')) || 0.6,
    };
  }
  return fresh(options);
}

/** the showcase model: right of the copy on wide screens, below it on phones */
const defaultModel = (): ResolvedModel => ({
  ...structuredClone(modelDefaults),
  src: 'knot',
  material: 'chrome',
  ...(innerWidth >= 900 ? { x: 0.73, y: 0.5, size: 0.5 } : { x: 0.5, y: 0.76, size: 0.32 }),
});

let state = initialState();
/** a shared link with a model shows it everywhere */
let pinned = state.models.length > 0;
if (!state.models.length) state.models = [defaultModel()];
/** how much of the 3D section fills the screen, 0–1: the model materializes with the scroll */
let reveal = 0;
/** the 3D section is (partly) on screen */
let showcase = false;
/** the visitor played with the model: the snippet includes it */
let touched = pinned;
/** a theme the visitor picked explicitly survives preset changes */
let themeChoice: Theme | null = location.hash.startsWith('#c=') ? state.theme : null;
let solo: LayerKey | null = null;
let hudOn = params.has('hud');
let mainThread = false;
let framework: Framework = 'vanilla';

const mqDark = matchMedia('(prefers-color-scheme: dark)');
const isDark = () => (state.theme === 'auto' ? mqDark.matches : state.theme === 'dark');

// ---------- the sky ----------

const hud = $('#hud');
hud.hidden = !hudOn;
const onStats = (s: DeepSkyStats) => {
  hud.textContent = `${s.mode} · ${s.fps} fps · shader ${s.shaderFps} fps @ ${s.scale}× · ${s.particles} stars`;
};

function soloed(s: ResolvedOptions, layer: LayerKey): ResolvedOptions {
  const out = structuredClone(s);
  for (const key of LAYERS) if (key !== 'cursor') out[key].enabled = key === layer;
  return out;
}

const liveOptions = (): DeepSkyOptions => ({
  ...(solo ? soloed(state, solo) : state),
  // always there, hidden until the scroll reveals it: ready ahead of time, no hitch
  models: state.models.map((m) => ({ ...m, reveal: pinned ? 1 : reveal })),
  worker: !mainThread,
  onStats: hudOn ? onStats : undefined,
  onModelError: (_, error) => toast(`Model: ${error}`),
});

/** the state the code and links describe: the model only once the visitor used it */
const described = (): ResolvedOptions => ({ ...state, models: touched || pinned ? state.models : [] });

let sky: DeepSkyInstance = createDeepSky(document.body, liveOptions());

// ---------- page ----------

const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!;
const themeToggle = $('#theme-toggle');

function syncTheme() {
  const dark = isDark();
  root.dataset.theme = dark ? 'dark' : 'light';
  themeMeta.content = (dark ? state.palette.dark : state.palette.light).background;
  themeToggle.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
}

let hashTimer = 0;
function apply(options: { pulse?: boolean } = {}) {
  sky.set(liveOptions(), true);
  if (options.pulse) sky.pulse();
  syncTheme();
  renderCode();
  renderPresets();
  renderLayers();
  renderModels();
  playground.refresh();
  // once shared, the link follows the changes
  if (location.hash.startsWith('#c=')) {
    clearTimeout(hashTimer);
    hashTimer = window.setTimeout(() => history.replaceState(null, '', shareUrl()), 400);
  }
}

function setPreset(name: PresetName) {
  const models = state.models;
  state = fresh({ preset: name, theme: themeChoice ?? undefined, quality: state.quality });
  state.models = models;
  apply({ pulse: true });
}

themeToggle.addEventListener('click', () => {
  themeChoice = isDark() ? 'light' : 'dark';
  state.theme = themeChoice;
  apply();
});
mqDark.addEventListener('change', () => {
  if (state.theme === 'auto') apply();
});

// toast + clipboard
const toastEl = $('#toast');
let toastTimer = 0;
function toast(message: string) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 1800);
}
async function copy(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    toast('Copy failed, select the text instead');
  }
}

$('#copy-install').addEventListener('click', () => copy('npm i deep-sky', 'Install command copied'));
if (matchMedia('(pointer: coarse)').matches) {
  $('#hint-text').textContent = 'Drag your finger · tap anywhere on the sky';
}

// nav: glass once scrolled, light sweep on section jumps
const nav = $('#nav');
const onScroll = () => nav.classList.toggle('scrolled', scrollY > 8);
addEventListener('scroll', onScroll, { passive: true });
onScroll();
for (const link of document.querySelectorAll<HTMLAnchorElement>('.links a[href^="#"], .brand')) {
  link.addEventListener('click', () => sky.pulse());
}

// GitHub links and stars
const REPO = __REPO__;
for (const a of document.querySelectorAll<HTMLAnchorElement>('[data-repo]')) {
  a.href = `https://github.com/${REPO}${a.dataset.repo ?? ''}`;
}
async function loadStars() {
  if (!/^[\w.-]+\/[\w.-]+$/.test(REPO) || REPO.startsWith('YOUR_')) return;
  try {
    let count = Number(sessionStorage.getItem('deep-sky:stars'));
    if (!count) {
      const res = await fetch(`https://api.github.com/repos/${REPO}`);
      if (!res.ok) return;
      count = (await res.json()).stargazers_count;
      sessionStorage.setItem('deep-sky:stars', String(count));
    }
    // no "0" on a fresh repo
    if (!count) return;
    const el = $('#gh-count');
    el.textContent = count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
    el.hidden = false;
  } catch {
    // offline or rate-limited: the button works without the count
  }
}
void loadStars();

// ---------- layers: hover one to see it alone ----------

const layerList = $('#layer-list');
const layerButtons = LAYER_INFO.map(({ key, label, desc }) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'layer';
  b.dataset.layer = key;
  b.innerHTML = `<span class="layer-name"><span class="layer-dot"></span>${label}</span><span class="layer-desc">${desc}</span>`;
  const enter = () => setSolo(key);
  const leave = () => setSolo(null);
  b.addEventListener('pointerenter', (e) => e.pointerType !== 'touch' && enter());
  b.addEventListener('pointerleave', (e) => e.pointerType !== 'touch' && leave());
  b.addEventListener('focus', enter);
  b.addEventListener('blur', leave);
  b.addEventListener('click', () => setSolo(solo === key ? null : key));
  layerList.append(b);
  return b;
});
function setSolo(layer: LayerKey | null) {
  if (solo === layer) return;
  solo = layer;
  sky.set(liveOptions(), true);
  renderLayers();
}
function renderLayers() {
  const p = isDark() ? state.palette.dark : state.palette.light;
  for (const b of layerButtons) {
    const key = b.dataset.layer as LayerKey;
    b.classList.toggle('active', solo === key);
    b.classList.toggle('off', !state[key].enabled);
    b.style.setProperty('--dot', layerColor(p, key));
  }
}

// ---------- presets ----------

const presetList = $('#preset-list');
const presetButtons = presetNames.map((name) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'preset';
  b.dataset.preset = name;
  b.innerHTML = `<span class="preset-swatch"></span><span class="preset-name">${PRESET_INFO[name].label}</span><span class="preset-desc">${PRESET_INFO[name].desc}</span>`;
  b.addEventListener('click', () => setPreset(name));
  presetList.append(b);
  return b;
});
function renderPresets() {
  const theme = isDark() ? 'dark' : 'light';
  for (const b of presetButtons) {
    const name = b.dataset.preset as PresetName;
    b.setAttribute('aria-pressed', String(state.preset === name));
    (b.firstElementChild as HTMLElement).style.background = swatch(presets[name].palette[theme]);
  }
}

// ---------- code ----------

const tabs = $('#code-tabs');
const codeBlock = $('#code-block');
const tabButtons = FRAMEWORKS.map(([fw, label]) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tab';
  b.setAttribute('role', 'tab');
  b.textContent = label;
  b.addEventListener('click', () => {
    framework = fw;
    renderCode();
  });
  tabs.append(b);
  return b;
});
const currentCode = () => snippet(framework, minimalOptions(described()));
function renderCode() {
  FRAMEWORKS.forEach(([fw], i) => tabButtons[i].setAttribute('aria-selected', String(fw === framework)));
  codeBlock.innerHTML = highlight(currentCode());
}
$('#copy-code').addEventListener('click', () => copy(currentCode(), 'Snippet copied'));

// ---------- playground ----------

const shareUrl = () => {
  const options = minimalOptions(described(), true);
  const hash = Object.keys(options).length ? `#c=${encodeShare(options)}` : '';
  return `${location.origin}${location.pathname}${hash}`;
};

function randomize() {
  const hue = Math.random() * 360;
  const c = (dh: number, s: number, l: number) => hslToHex((hue + dh + 360) % 360, s, l);
  const pick = (a: number, b: number) => +(a + Math.random() * (b - a)).toFixed(2);
  const next = fresh({ preset: state.preset, theme: state.theme, quality: state.quality });
  const shared = {
    nebula: [c(0, 70, 28), c(35, 80, 40), c(150, 85, 40), c(300, 75, 52)],
    aurora: [c(140, 100, 58), c(260, 100, 66)],
  };
  Object.assign(next.palette.dark, shared, {
    background: c(0, 45, 3),
    rays: c(20, 100, 80),
    glow: c(10, 100, 70),
    stars: [c(190, 100, 86), c(270, 100, 86), '#ffffff'],
    spotlight: [c(190, 100, 72), c(260, 100, 70)],
    lines: c(200, 100, 82),
    meteor: '#ffffff',
  });
  Object.assign(next.palette.light, shared, {
    background: c(0, 45, 98),
    rays: c(20, 90, 68),
    glow: c(10, 90, 64),
    stars: [c(190, 70, 35), c(270, 60, 42), c(330, 60, 42)],
    spotlight: [c(220, 80, 60), c(190, 80, 55)],
    lines: c(240, 70, 50),
    meteor: c(240, 70, 45),
  });
  next.nebula.intensity = pick(0.75, 1.4);
  next.nebula.scale = pick(0.7, 1.6);
  next.aurora.intensity = pick(0, 2.2);
  next.aurora.position = pick(0.55, 0.85);
  next.rays.intensity = pick(0.2, 1.8);
  next.stars.density = pick(0.6, 1.8);
  next.meteors.enabled = Math.random() < 0.75;
  next.grid.enabled = Math.random() < 0.3;
  next.speed = pick(0.7, 1.5);
  next.models = state.models;
  state = next;
  apply({ pulse: true });
}

const playground = createPlayground($('#panel'), {
  state: () => state,
  change: (mutate) => {
    const theme = state.theme;
    const model = JSON.stringify(state.models);
    mutate(state);
    if (state.theme !== theme) themeChoice = state.theme;
    // a model edited from the playground has to be seen, wherever the page is scrolled
    if (JSON.stringify(state.models) !== model) {
      touched = true;
      pinned ||= !showcase;
    }
    apply();
  },
  setPreset,
  isDark,
  randomize,
  reset: () => {
    const models = state.models;
    state = fresh({ preset: state.preset, theme: themeChoice ?? undefined });
    state.models = models;
    apply({ pulse: true });
  },
  pinned: {
    get: () => pinned,
    set: (on) => {
      pinned = on;
      touched ||= on;
      apply();
    },
  },
  loadModelFile: (file) => void loadFile(file),
  loadModelUrl: (url) => loadUrl(url),
  modelLabel: (src) => modelLabel(src as ResolvedModel['src']),
  share: () => {
    const url = shareUrl();
    history.replaceState(null, '', url);
    void copy(url, 'Link copied: send it to a friend');
  },
  copyCode: () => copy(currentCode(), 'Snippet copied'),
  hud: {
    get: () => hudOn,
    set: (on) => {
      hudOn = on;
      hud.hidden = !on;
      if (!on) hud.textContent = '';
      apply();
    },
  },
  mainThread: {
    get: () => mainThread,
    set: (on) => {
      // the rendering thread is chosen at creation: start over
      mainThread = on;
      sky.destroy();
      sky = createDeepSky(document.body, liveOptions());
      toast(on ? 'Rendering on the main thread' : 'Rendering in a Web Worker');
    },
  },
});

for (const b of document.querySelectorAll('[data-open-panel]')) {
  b.addEventListener('click', () => playground.open());
}

// ---------- 3D showcase ----------

const SHAPE_LABELS: Record<string, string> = {
  orb: 'Orb',
  knot: 'Knot',
  torus: 'Torus',
  crystal: 'Crystal',
  gem: 'Gem',
  planet: 'Planet',
  cube: 'Cube',
};
const MATERIAL_LABELS: [ModelMaterial, string][] = [
  ['chrome', 'Chrome'],
  ['glass', 'Glass'],
  ['hologram', 'Hologram'],
  ['iridescent', 'Iridescent'],
  ['wire', 'Neon wire'],
  ['nebula', 'Nebula'],
  ['auto', 'Original'],
];
const model = () => state.models[0];
/** a real glTF file, generated by scripts/make-sample.mjs */
const SAMPLE = '/models/deep-sky-star.glb';
/** name of the last model file dropped or picked (files have no name in the options) */
let fileName = '';
const isShape = (src: ResolvedModel['src']) =>
  typeof src === 'string' && (modelShapes as readonly string[]).includes(src);
const shortName = (name: string) => (name.length > 24 ? `${name.slice(0, 22)}…` : name);
/** what the shape pickers show for a model that is not a built-in shape */
function modelLabel(src: ResolvedModel['src']) {
  if (src instanceof ArrayBuffer) return fileName || 'Your file';
  if (src === SAMPLE) return '✦ Star (.glb)';
  return shortName(decodeURIComponent(String(src).split(/[?#]/)[0].split('/').pop() || 'Your model'));
}

/** a model change from the section: no pin, it shows while the section is on screen */
function editModel(edit: (m: ResolvedModel) => void) {
  edit(model());
  touched = true;
  apply();
}

/** your own model: from the section, the playground or a drop anywhere; always visible */
function useOwnModel(src: ResolvedModel['src']) {
  pinned ||= !showcase;
  editModel((m) => {
    m.src = src;
    // a file comes with its own materials
    m.material = 'auto';
  });
}

const chip = (label: string, onClick: () => void) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
};
const shapeButtons = modelShapes.map((name) =>
  chip(SHAPE_LABELS[name], () =>
    editModel((m) => {
      m.src = name;
      if (m.material === 'auto') m.material = 'chrome';
    }),
  ),
);
const sampleChip = chip('✦ Star (.glb)', () =>
  editModel((m) => {
    m.src = SAMPLE;
    m.material = 'auto';
  }),
);
sampleChip.title = 'A real glTF file, loaded like yours';
const fileChip = chip('', () => undefined);
fileChip.hidden = true;
$('#shape-list').append(...shapeButtons, sampleChip, fileChip);
const materialButtons = MATERIAL_LABELS.map(([material, label]) =>
  chip(label, () => editModel((m) => (m.material = material))),
);
$('#material-list').append(...materialButtons);
const extras: [string, (m: ResolvedModel) => boolean, (m: ResolvedModel, on: boolean) => void][] = [
  ['Liquid metal', (m) => m.morph > 0, (m, on) => (m.morph = on ? 1 : 0)],
  ['Light shafts', (m) => m.rays > 0, (m, on) => (m.rays = on ? 1.2 : 0)],
  ['Follow cursor', (m) => m.follow > 0, (m, on) => (m.follow = on ? 0.6 : 0)],
];
const extraButtons = extras.map(([label, get, set]) =>
  chip(label, () => editModel((m) => set(m, !get(m)))),
);
const pinButton = chip('On every section', () => {
  pinned = !pinned;
  touched ||= pinned;
  apply();
});
$('#model-extras').append(...extraButtons, pinButton);

function renderModels() {
  const m = model();
  const shape = isShape(m.src);
  const own = !shape && m.src !== SAMPLE;
  shapeButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(m.src === modelShapes[i])));
  sampleChip.setAttribute('aria-pressed', String(m.src === SAMPLE));
  fileChip.hidden = !own;
  fileChip.textContent = own ? modelLabel(m.src) : '';
  fileChip.setAttribute('aria-pressed', String(own));
  MATERIAL_LABELS.forEach(([material], i) => {
    const b = materialButtons[i];
    // built-in shapes have no materials of their own
    b.disabled = material === 'auto' && shape;
    b.setAttribute('aria-pressed', String(m.material === material || (shape && material === 'chrome' && m.material === 'auto')));
  });
  extras.forEach(([, get], i) => extraButtons[i].setAttribute('aria-pressed', String(get(m))));
  pinButton.setAttribute('aria-pressed', String(pinned));
}

async function loadFile(file: File | undefined) {
  if (!file) return;
  if (!/\.(glb|gltf)$/i.test(file.name)) {
    toast('A .glb or .gltf file, please');
    return;
  }
  fileName = shortName(file.name);
  useOwnModel(await file.arrayBuffer());
  toast(`${file.name} is in the sky`);
}

/** a model from the web: it needs CORS, and the share link keeps it */
function loadUrl(value: string) {
  const url = value.trim();
  if (!url) return;
  try {
    new URL(url, location.href);
  } catch {
    toast('That is not a URL');
    return;
  }
  useOwnModel(url);
  toast(`Loading ${modelLabel(url)}…`);
}

const fileInput = $<HTMLInputElement>('#model-file');
fileInput.addEventListener('change', () => {
  void loadFile(fileInput.files?.[0]);
  fileInput.value = '';
});

// drop a model anywhere on the page
const dropHint = $('#drop-hint');
let dragDepth = 0;
const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  dragDepth++;
  dropHint.classList.add('show');
});
addEventListener('dragleave', (e) => {
  if (!hasFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) dropHint.classList.remove('show');
});
addEventListener('dragover', (e) => {
  if (hasFiles(e)) e.preventDefault();
});
addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  dropHint.classList.remove('show');
  void loadFile(e.dataTransfer?.files[0]);
});
const showcaseEl = $('#models');

// the model materializes as the section scrolls in, and dissolves as it scrolls out
let revealFrame = 0;
function trackReveal() {
  revealFrame = 0;
  const r = showcaseEl.getBoundingClientRect();
  const coverage = Math.max(0, Math.min(innerHeight, r.bottom) - Math.max(0, r.top)) / innerHeight;
  const t = Math.min(1, Math.max(0, (coverage - 0.3) / 0.45));
  // steps of 5%: the sky eases between them, without an update per scroll event
  const next = Math.round(t * t * (3 - 2 * t) * 20) / 20;
  showcase = next > 0;
  if (next === reveal) return;
  reveal = next;
  sky.set(liveOptions(), true);
}
const onRevealScroll = () => (revealFrame ||= requestAnimationFrame(trackReveal));
addEventListener('scroll', onRevealScroll, { passive: true });
addEventListener('resize', onRevealScroll, { passive: true });
trackReveal();

apply();
