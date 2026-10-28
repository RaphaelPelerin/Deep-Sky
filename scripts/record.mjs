/**
 * Records a short demo video of the site with a local Chrome (no ffmpeg needed):
 * frames come from the DevTools screencast, then get re-encoded by Chrome's MediaRecorder.
 *
 *   npm run build:demo && npm run record        →  .capture/deep-sky.mp4 (or .webm)
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import { preview } from 'vite';

const W = 1600;
const H = 900;
const FPS = 30;

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

const server = await preview({ preview: { port: 4318, strictPort: true } });
// --gpu: the real GPU, smoother than the software renderer
const gpu = process.argv.includes('--gpu');
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: [
    '--ignore-gpu-blocklist',
    '--hide-scrollbars',
    ...(gpu ? ['--enable-gpu', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])] : ['--enable-unsafe-swiftshader']),
  ],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  // ---------- capture ----------
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.goto('http://localhost:4318/?quality=high', { waitUntil: 'networkidle0' });
  // headless Chrome draws no cursor: show one
  await page.evaluate(() => {
    const c = document.createElement('div');
    c.style.cssText =
      'position:fixed;z-index:99;left:0;top:0;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;' +
      'background:#fff;box-shadow:0 0 0 3px rgba(255,255,255,.25),0 0 18px rgba(160,200,255,.9);pointer-events:none';
    document.body.append(c);
    addEventListener('pointermove', (e) => (c.style.transform = `translate(${e.clientX}px,${e.clientY}px)`));
  });

  const frames = [];
  const cdp = await page.createCDPSession();
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    frames.push({ data, t: metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H });

  const m = page.mouse;
  // time-based, so a slow headless mouse doesn't stretch the video
  const glide = async (points, ms) => {
    const start = Date.now();
    for (;;) {
      const p = Math.min(1, (Date.now() - start) / ms);
      const seg = Math.min(points.length - 2, Math.floor(p * (points.length - 1)));
      const local = p * (points.length - 1) - seg;
      const [a, b] = [points[seg], points[seg + 1]];
      await m.move(a[0] + (b[0] - a[0]) * local, a[1] + (b[1] - a[1]) * local);
      if (p === 1) break;
      await wait(10);
    }
  };

  await m.move(W * 0.15, H * 0.75);
  await wait(1200);
  await glide([[0.15, 0.75], [0.3, 0.3], [0.55, 0.18], [0.82, 0.3], [0.88, 0.6]].map(([x, y]) => [x * W, y * H]), 3000);
  await m.click(W * 0.86, H * 0.62);
  await wait(900);
  await glide([[0.86, 0.62], [0.2, 0.8]].map(([x, y]) => [x * W, y * H]), 900);
  await m.click(W * 0.2, H * 0.8);
  await wait(1000);
  await page.click('.fab');
  await wait(900);
  const chip = async (label) => {
    const handles = await page.$$('.chip');
    for (const h of handles) {
      if ((await h.evaluate((e) => e.textContent)) === label) await h.click();
    }
  };
  for (const name of ['Aurora', 'Ember', 'Daybreak', 'Synthwave']) {
    await chip(name);
    await glide([[0.3, 0.5], [0.45, 0.35]].map(([x, y]) => [x * W, y * H]), 1200);
  }
  await page.keyboard.press('Escape');

  // ---------- 3D: the model materializes, then changes surface ----------
  await page.evaluate(() => document.getElementById('models').scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await glide([[0.45, 0.35], [0.62, 0.3]].map(([x, y]) => [x * W, y * H]), 2600);
  // moves the cursor onto a chip of the 3D section, then clicks it
  let at = [0.62 * W, 0.3 * H];
  const pick = async (label, ms = 1700) => {
    const handles = await page.$$('#models .chip');
    for (const h of handles) {
      if ((await h.evaluate((e) => e.textContent)) !== label) continue;
      const box = await h.boundingBox();
      const to = [box.x + box.width / 2, box.y + box.height / 2];
      await glide([at, to], 450);
      at = to;
      await h.click();
    }
    await wait(ms);
  };
  await pick('Glass', 1400);
  await pick('Hologram', 1400);
  await pick('Gem', 150);
  await pick('Neon wire', 1400);
  await pick('Orb', 150);
  await pick('Chrome', 150);
  await pick('Liquid metal', 300);
  // the light sweeps over the liquid orb, then a shockwave runs through it
  await glide([at, [0.62 * W, 0.25 * H], [0.86 * W, 0.4 * H]], 1500);
  await m.click(0.66 * W, 0.5 * H);
  await glide([[0.66 * W, 0.5 * H], [0.6 * W, 0.7 * H]], 1400);
  await cdp.send('Page.stopScreencast');
  await page.close();
  console.log(`${frames.length} frames captured`);

  // ---------- encode: replay the frames at a steady rate into MediaRecorder ----------
  const enc = await browser.newPage();
  await enc.goto('about:blank');
  const t0 = frames[0].t;
  const duration = frames[frames.length - 1].t - t0;
  const total = Math.floor(duration * FPS);
  // frame shown at each output tick: the latest captured before it
  const picks = [];
  for (let i = 0, j = 0; i < total; i++) {
    while (j + 1 < frames.length && frames[j + 1].t - t0 <= i / FPS) j++;
    picks.push(j);
  }
  await enc.exposeFunction('frameBatch', (from, n) => frames.slice(from, from + n).map((f) => f.data));
  const result = await enc.evaluate(
    async (picks, w, h, fps, captured) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      const type = ['video/mp4;codecs=avc1.640028', 'video/mp4', 'video/webm;codecs=vp9'].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      const stream = canvas.captureStream(0);
      const track = stream.getVideoTracks()[0];
      // GitHub takes videos up to 10 MB
      const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 2_600_000 });
      const chunks = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      const done = new Promise((r) => (rec.onstop = r));
      // MediaRecorder stamps frames in real time: if decoding fell behind, the video would play
      // in slow motion. Frames are fetched and decoded ahead, in batches.
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const decode = async (data) => createImageBitmap(await (await fetch(`data:image/jpeg;base64,${data}`)).blob());
      const bitmaps = new Map();
      let requested = 0;
      let shown = 0;
      void (async () => {
        while (requested < captured) {
          if (requested - shown > 120) {
            await sleep(5);
            continue;
          }
          const from = requested;
          const batch = await window.frameBatch(from, 12);
          requested += batch.length;
          (await Promise.all(batch.map(decode))).forEach((b, k) => bitmaps.set(from + k, b));
        }
      })();
      const get = async (j) => {
        while (!bitmaps.has(j)) await sleep(2);
        return bitmaps.get(j);
      };
      await get(Math.min(captured - 1, 90));
      rec.start();
      const start = performance.now();
      let lag = 0;
      for (let i = 0; i < picks.length; i++) {
        const j = picks[i];
        ctx.drawImage(await get(j), 0, 0, w, h);
        track.requestFrame();
        shown = j;
        for (const k of bitmaps.keys()) {
          if (k >= j) continue;
          bitmaps.get(k).close();
          bitmaps.delete(k);
        }
        const due = start + ((i + 1) * 1000) / fps;
        lag = Math.max(lag, performance.now() - due);
        await sleep(Math.max(0, due - performance.now()));
      }
      rec.stop();
      await done;
      const blob = new Blob(chunks, { type });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { type, data: btoa(bin), lag };
    },
    picks,
    W,
    H,
    FPS,
    frames.length,
  );
  if (result.lag > 100) console.warn(`! the encoder fell ${Math.round(result.lag)} ms behind: the video may stutter`);
  const ext = result.type.startsWith('video/mp4') ? 'mp4' : 'webm';
  await mkdir('.capture', { recursive: true });
  const out = `.capture/deep-sky.${ext}`;
  await writeFile(out, Buffer.from(result.data, 'base64'));
  console.log(`✓ ${out} (${(duration).toFixed(1)} s, ${result.type})`);
} finally {
  await browser.close();
  await server.close();
}
