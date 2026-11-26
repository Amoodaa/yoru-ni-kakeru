import { defineConfig, normalizePath, type Plugin } from 'vite';
import { cpSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const assetDirs = ['audio', 'data'];

// Git can check out directory symlinks as plain files on Windows. Serve the
// original assets through Vite and copy them into builds without using symlinks.
function repoAssets(): Plugin {
  return {
    name: 'repo-assets',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (assetDirs.some((dir) => req.url?.startsWith(`/${dir}/`))) {
          req.url = `/@fs/${encodeURI(normalizePath(repoRoot))}${req.url}`;
        }
        next();
      });
    },
    writeBundle(options) {
      if (!options.dir) return;
      for (const dir of assetDirs) {
        // the player streams audio/song.mp3; the wav and download notes stay out of the site
        cpSync(path.join(repoRoot, dir), path.join(options.dir, dir), { recursive: true, filter: (f) => !/\.(wav|txt)$/.test(f) });
      }
    },
  };
}

export default defineConfig({
  root: '.',
  base: './', // relative URLs: the build works under any path (GitHub Pages serves it at /<repo>/)
  publicDir: 'public',
  plugins: [repoAssets()],
  // MV_NO_HMR=1: no live reload (export renders must not reload mid-run when a file changes)
  server: { port: 5173, strictPort: false, hmr: process.env.MV_NO_HMR ? false : undefined, fs: { allow: [repoRoot] } },
  resolve: { alias: { '@root': repoRoot } },
  // pre-bundle at startup: discovering them on the first page load makes Vite reload the page, which
  // never happens with live reload off (render.ts's server), so a cold render would hang
  optimizeDeps: { include: ['three', 'opentype.js'] },
  build: { target: 'esnext', assetsInlineLimit: 0 },
});
