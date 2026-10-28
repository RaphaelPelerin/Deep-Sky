import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { deepSkyWorker } from './scripts/worker-plugin.mjs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const env = process.env;

// on Vercel the site URL and the GitHub repo come from the deployment itself
const site = env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
  : pkg.homepage;
const repo =
  env.VERCEL_GIT_REPO_OWNER && env.VERCEL_GIT_REPO_SLUG
    ? `${env.VERCEL_GIT_REPO_OWNER}/${env.VERCEL_GIT_REPO_SLUG}`
    : (/github\.com\/([^/]+\/[^/.]+)/.exec(pkg.repository.url)?.[1] ?? '');

/** The demo site (Vercel builds it with `npm run build:demo`) */
export default defineConfig({
  root: 'demo',
  plugins: [
    deepSkyWorker(),
    {
      name: 'site-meta',
      transformIndexHtml: (html) =>
        html.replaceAll('__SITE_URL__', site).replaceAll('__VERSION__', pkg.version),
    },
  ],
  resolve: {
    alias: [
      { find: /^deep-sky$/, replacement: fileURLToPath(new URL('./src/index.ts', import.meta.url)) },
    ],
  },
  define: {
    __REPO__: JSON.stringify(repo),
    __VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
});
