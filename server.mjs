import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSyncApiHandler } from './sync-server.mjs';
import { createMediaApiHandler } from './media-server.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.zip': 'application/zip',
};

export function startServer(port = Number(process.env.PORT || 4173)) {
  const syncApi = createSyncApiHandler();
  const mediaApi = createMediaApiHandler();
  const server = http.createServer(async (request, response) => {
    if (request.url?.startsWith('/api/sync')) {
      await syncApi(request, response);
      return;
    }
    if (request.url?.startsWith('/api/pic') || request.url?.startsWith('/api/export') || request.url?.startsWith('/api/import')) {
      await mediaApi(request, response);
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

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      const actual = server.address().port;
      console.log(`波日程已启动：http://localhost:${actual}`);
      resolve(server);
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await startServer();
}
