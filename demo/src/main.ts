import '@fontsource-variable/inter';
import './style.css';
import {
  createDeepSky,
  normalizeOptions,
  presetNames,
  presets,
  type PresetName,
  type QualityPreset,
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
  return fresh(options);
}

let state = initialState();
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
  worker: !mainThread,
  onStats: hudOn ? onStats : undefined,
});

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
  playground.refresh();
  // once shared, the link follows the changes
  if (location.hash.startsWith('#c=')) {
    clearTimeout(hashTimer);
    hashTimer = window.setTimeout(() => history.replaceState(null, '', shareUrl()), 400);
  }
}

function setPreset(name: PresetName) {
  state = fresh({ preset: name, theme: themeChoice ?? undefined, quality: state.quality });
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
const currentCode = () => snippet(framework, minimalOptions(state));
function renderCode() {
  FRAMEWORKS.forEach(([fw], i) => tabButtons[i].setAttribute('aria-selected', String(fw === framework)));
  codeBlock.innerHTML = highlight(currentCode());
}
$('#copy-code').addEventListener('click', () => copy(currentCode(), 'Snippet copied'));

// ---------- playground ----------

const shareUrl = () => {
  const options = minimalOptions(state);
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
  state = next;
  apply({ pulse: true });
}

const playground = createPlayground($('#panel'), {
  state: () => state,
  change: (mutate) => {
    const theme = state.theme;
    mutate(state);
    if (state.theme !== theme) themeChoice = state.theme;
    apply();
  },
  setPreset,
  isDark,
  randomize,
  reset: () => {
    state = fresh({ preset: state.preset, theme: themeChoice ?? undefined });
    apply({ pulse: true });
  },
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

apply();
