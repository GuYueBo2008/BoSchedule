import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSyncApiHandler } from './sync-server.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const port = Number(process.env.PORT || 4173);
const syncApi = createSyncApiHandler();
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
};

const server = http.createServer(async (request, response) => {
  if (request.url?.startsWith('/api/sync')) {
    await syncApi(request, response);
    return;
  }
  const url = new URL(request.url || '/', 'http://localhost');
  const requested = decodeURIComponent(url.pathname);
  let file = path.join(dist, requested === '/' ? 'index.html' : requested);
  if (!file.startsWith(dist)) {
    response.statusCode = 403;
    response.end('Forbidden');
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  if (!fs.existsSync(file)) {
    response.statusCode = 503;
    response.end('请先运行 npm run build');
    return;
  }
  response.setHeader('Content-Type', mimeTypes[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`波日程已启动：http://localhost:${port}`);
});
