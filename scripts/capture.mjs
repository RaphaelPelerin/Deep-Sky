/**
 * Screenshots of the demo, rendered by a local Chrome (no browser download).
 *
 *   npm run build:demo && npm run capture          README images + social card
 *   npm run capture -- --check --out .capture      health check: stats, errors, a few frames
 *   add --gpu to render with the real GPU instead of the software renderer (much faster)
 *
 * Set CHROME_PATH if Chrome or Edge is not found.
 */
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { preview } from 'vite';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const chrome =
  process.env.CHROME_PATH ??
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find((path) => existsSync(path));
if (!chrome) throw new Error('Chrome not found: set CHROME_PATH');

const ASSETS = [
  { file: '.github/assets/hero.webp', query: 'shot=hero', size: [1600, 900], scale: 1, pointer: [0.72, 0.3] },
  { file: 'demo/public/og.jpg', query: 'shot=hero', size: [1200, 630], scale: 1, pointer: [0.74, 0.28] },
  { file: '.github/assets/cosmos.webp', query: 'ui=0', size: [960, 540], scale: 1, pointer: [0.6, 0.45] },
  { file: '.github/assets/aurora.webp', query: 'ui=0&preset=aurora', size: [960, 540], scale: 1, pointer: [0.4, 0.5] },
  { file: '.github/assets/ember.webp', query: 'ui=0&preset=ember', size: [960, 540], scale: 1, pointer: [0.55, 0.4] },
  { file: '.github/assets/abyss.webp', query: 'ui=0&preset=abyss', size: [960, 540], scale: 1, pointer: [0.5, 0.55] },
  { file: '.github/assets/synthwave.webp', query: 'ui=0&preset=synthwave', size: [960, 540], scale: 1, pointer: [0.45, 0.4] },
  { file: '.github/assets/daybreak.webp', query: 'ui=0&preset=daybreak', size: [960, 540], scale: 1, pointer: [0.6, 0.5] },
  // 3D: one surface each
  ...[
    ['chrome', 'synthwave', 'knot', 'morph=0.5'],
    ['glass', 'aurora', 'orb', ''],
    ['hologram', 'abyss', 'planet', ''],
    ['iridescent', 'ember', 'crystal', ''],
    ['wire', 'synthwave', 'gem', ''],
    ['nebula', 'cosmos', 'orb', ''],
  ].map(([material, preset, model, extra]) => ({
    file: `.github/assets/3d-${material}.webp`,
    query: `ui=0&preset=${preset}&model=${model}&material=${material}&${extra}`,
    size: [720, 480],
    scale: 1,
    pointer: [0.3, 0.3],
    models: true,
  })),
];

const CHECKS = [
  { file: 'check-dark.png', query: 'hud', size: [1280, 800], pointer: [0.7, 0.35] },
  { file: 'check-light.png', query: 'hud&theme=light', size: [1280, 800], pointer: [0.3, 0.6] },
  { file: 'check-mobile.png', query: 'hud', size: [390, 844], scale: 2, pointer: [0.5, 0.4] },
  { file: 'check-panel.png', query: 'hud', size: [1280, 800], pointer: [0.3, 0.5], click: '.fab' },
  { file: 'check-page.png', query: 'hud', size: [1280, 800], scale: 1, pointer: [0.5, 0.2], fullPage: true },
];

const check = flag('check');
const shots = check ? CHECKS : ASSETS;
const outDir = option('out', check ? '.capture' : '.');
const base = option('url', null);

const server = base ? null : await preview({ preview: { port: 4317, strictPort: true } });
const url = base ?? 'http://localhost:4317/';

// --gpu: the real GPU (much faster, and the 3D shots need many frames to materialize)
const gpu = flag('gpu');
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: [
    '--ignore-gpu-blocklist',
    '--hide-scrollbars',
    ...(gpu ? ['--enable-gpu', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])] : ['--enable-unsafe-swiftshader']),
  ],
});

try {
  for (const shot of shots) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const [width, height] = shot.size;
    await page.setViewport({ width, height, deviceScaleFactor: shot.scale ?? 2 });
    await page.goto(`${url}?${shot.query}&quality=${check ? 'medium' : 'ultra'}`, {
      waitUntil: 'networkidle0',
    });
    if (shot.click) await page.click(shot.click);
    // a cursor on the sky: spotlight, swirl and constellations
    await page.mouse.move(width * shot.pointer[0], height * shot.pointer[1], { steps: 8 });
    const wait = check ? 6000 : shot.models && !gpu ? 25000 : 4500;
    await new Promise((resolve) => setTimeout(resolve, wait));
    await page.mouse.move(width * shot.pointer[0] + 6, height * shot.pointer[1] + 4, { steps: 4 });
    await new Promise((resolve) => setTimeout(resolve, 600));

    const path = join(outDir, shot.file);
    await mkdir(dirname(path), { recursive: true });
    const type = path.endsWith('.webp') ? 'webp' : path.endsWith('.jpg') ? 'jpeg' : 'png';
    await page.screenshot({ path, type, fullPage: !!shot.fullPage, ...(type === 'png' ? {} : { quality: 90 }) });
    if (check) {
      const hud = await page.$eval('#hud', (el) => el.textContent).catch(() => '');
      console.log(`${shot.file}: ${hud || 'no stats'}${errors.length ? `\n  errors: ${errors.join(' | ')}` : ''}`);
    } else {
      console.log(`✓ ${path}${errors.length ? ` (errors: ${errors.join(' | ')})` : ''}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  await server?.close();
}
