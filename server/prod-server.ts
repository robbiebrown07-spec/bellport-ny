import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { handleApiRequest } from './api-middleware.ts';

const PORT = Number(process.env.PORT ?? 4173);
const DIST_DIR = path.resolve(process.cwd(), 'dist');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

const server = http.createServer(async (req, res) => {
  const handled = await handleApiRequest(req, res);
  if (handled) return;

  const urlPath = (req.url ?? '/').split('?')[0];
  const safeRel = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, '');
  let targetFile = path.join(DIST_DIR, safeRel === '/' ? 'index.html' : safeRel);

  if (!fs.existsSync(targetFile) || fs.statSync(targetFile).isDirectory()) {
    targetFile = path.join(DIST_DIR, 'index.html');
  }

  if (!fs.existsSync(targetFile)) {
    res.statusCode = 404;
    res.end('Build not found. Run npm run build first.');
    return;
  }

  const ext = path.extname(targetFile).toLowerCase();
  res.setHeader('Content-Type', MIME_TYPES[ext] ?? 'application/octet-stream');
  if (ext === '.html') {
    res.setHeader('Cache-Control', 'no-cache');
  } else if (targetFile.includes(`${path.sep}assets${path.sep}`)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
  fs.createReadStream(targetFile).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Bellport Watch production server listening on http://localhost:${PORT}`);
});
