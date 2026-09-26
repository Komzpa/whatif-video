import { defineConfig, type Plugin } from 'vite';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve(import.meta.dirname, '..');
const FALLBACK = path.resolve(import.meta.dirname, 'src/data-fallback');
const TYPES: Record<string, string> = { '.json': 'application/json', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };

/**
 * The repo root holds audio/ and data/ (written by the analysis step); serve them next to the app at
 * /audio/* and /data/*. While a data file is not produced yet, src/data-fallback/ stands in for it.
 */
function rootData(): Plugin {
  return {
    name: 'root-data',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const u = decodeURIComponent((req.url ?? '').split('?')[0]!);
        const m = /^\/(data|audio)\/([\w.-]+)$/.exec(u);
        if (!m) return next();
        let f = path.join(ROOT, m[1]!, m[2]!);
        if (!fs.existsSync(f) && m[1] === 'data') f = path.join(FALLBACK, m[2]!);
        if (!fs.existsSync(f)) { res.statusCode = 404; return res.end('not found'); }
        const st = fs.statSync(f);
        res.setHeader('Content-Type', TYPES[path.extname(f)] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        // range requests keep <audio> seekable in the preview player
        const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
        if (range) {
          const a = range[1] ? +range[1] : 0, b = range[2] ? +range[2] : st.size - 1;
          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${a}-${b}/${st.size}`);
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Content-Length', String(b - a + 1));
          return fs.createReadStream(f, { start: a, end: b }).pipe(res);
        }
        res.setHeader('Content-Length', String(st.size));
        fs.createReadStream(f).pipe(res);
      });
    },
  };
}

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [rootData()],
  // VIDEO_NO_HMR=1: no live reload (export renders must not reload mid-run when a file changes)
  server: { port: 5173, strictPort: false, hmr: process.env.VIDEO_NO_HMR ? false : undefined, fs: { allow: [ROOT] } },
  resolve: { alias: { '@root': ROOT } },
  build: { target: 'esnext', assetsInlineLimit: 0 },
});
