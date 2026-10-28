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
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
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
  await wait(1800);
  await glide([[0.15, 0.75], [0.3, 0.3], [0.55, 0.18], [0.82, 0.3], [0.88, 0.6]].map(([x, y]) => [x * W, y * H]), 3200);
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
  for (const name of ['Aurora', 'Synthwave', 'Ember', 'Abyss']) {
    await chip(name);
    await glide([[0.3, 0.5], [0.45, 0.35]].map(([x, y]) => [x * W, y * H]), 1500);
  }
  await chip('Daybreak');
  await wait(1800);
  await chip('Cosmos');
  await wait(500);
  const dark = await page.$$('.seg button');
  if (dark[0]) await dark[0].click();
  await glide([[0.45, 0.35], [0.25, 0.55]].map(([x, y]) => [x * W, y * H]), 1500);
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
  await enc.exposeFunction('frameData', (i) => frames[picks[i]].data);
  const result = await enc.evaluate(
    async (count, w, h, fps) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      const type = ['video/mp4;codecs=avc1.640028', 'video/mp4', 'video/webm;codecs=vp9'].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      const stream = canvas.captureStream(0);
      const track = stream.getVideoTracks()[0];
      const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 4_000_000 });
      const chunks = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      const done = new Promise((r) => (rec.onstop = r));
      const load = async (i) => {
        const res = await fetch(`data:image/jpeg;base64,${await window.frameData(i)}`);
        return createImageBitmap(await res.blob());
      };
      let next = await load(0);
      rec.start();
      const start = performance.now();
      for (let i = 0; i < count; i++) {
        ctx.drawImage(next, 0, 0, w, h);
        track.requestFrame();
        if (i + 1 < count) next = await load(i + 1);
        const due = start + ((i + 1) * 1000) / fps;
        await new Promise((r) => setTimeout(r, Math.max(0, due - performance.now())));
      }
      rec.stop();
      await done;
      const blob = new Blob(chunks, { type });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { type, data: btoa(bin) };
    },
    picks.length,
    W,
    H,
    FPS,
  );
  const ext = result.type.startsWith('video/mp4') ? 'mp4' : 'webm';
  await mkdir('.capture', { recursive: true });
  const out = `.capture/deep-sky.${ext}`;
  await writeFile(out, Buffer.from(result.data, 'base64'));
  console.log(`✓ ${out} (${(duration).toFixed(1)} s, ${result.type})`);
} finally {
  await browser.close();
  await server.close();
}
