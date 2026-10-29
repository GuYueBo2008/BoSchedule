import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';

const dataDirectory = process.env.BOSCHEDULE_DATA_DIR || path.join(os.homedir(), '.boschedule');
const picDirectory = path.join(dataDirectory, 'pic');
const IMAGE_EXTENSIONS = { png: 'png', jpeg: 'jpg', jpg: 'jpg', webp: 'webp', gif: 'gif' };
const MIME_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}

async function readBody(request, limit) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error('上传内容超过大小限制');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function ensurePicDirectory() {
  fs.mkdirSync(picDirectory, { recursive: true });
}

function newPicName(buffer, extension) {
  return `${crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 16)}.${extension}`;
}

function saveDataUrl(dataUrl) {
  const match = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!match) throw new Error('不支持的图片格式');
  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (!buffer.length) throw new Error('图片内容为空');
  if (buffer.length > 20 * 1024 * 1024) throw new Error('单张图片不能超过 20MB');
  ensurePicDirectory();
  const extension = IMAGE_EXTENSIONS[match[1]] || 'png';
  const name = newPicName(buffer, extension);
  const file = path.join(picDirectory, name);
  if (!fs.existsSync(file)) fs.writeFileSync(file, buffer);
  return { name, size: buffer.length };
}

function picNameFromSource(source) {
  if (typeof source !== 'string' || !source.includes('/api/pic/')) return null;
  try {
    const url = new URL(source, 'http://localhost');
    const name = decodeURIComponent(url.pathname.split('/api/pic/').pop() || '');
    return /^[A-Za-z0-9._-]+$/.test(name) ? name : null;
  } catch {
    return null;
  }
}

function isSafePicName(name) {
  return typeof name === 'string' && /^[A-Za-z0-9._-]+$/.test(name) && !name.includes('..');
}

async function normalizeBundleImages(bundle) {
  const migrated = [];
  for (const event of bundle.events || []) {
    if (!Array.isArray(event.images)) continue;
    const next = [];
    for (const source of event.images) {
      if (typeof source === 'string' && source.startsWith('data:image/')) {
        const saved = saveDataUrl(source);
        next.push(`/api/pic/${saved.name}`);
        migrated.push(saved.name);
      } else {
        next.push(source);
      }
    }
    event.images = next;
  }
  return migrated;
}

function bundlePicNames(bundle) {
  const names = new Set();
  (bundle.events || []).forEach((event) => {
    (event.images || []).forEach((source) => {
      const name = picNameFromSource(source);
      if (name) names.add(name);
    });
  });
  return names;
}

function sanitizeFilePart(value) {
  return String(value || 'BoSchedule').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40) || 'BoSchedule';
}

export function createMediaApiHandler() {
  return async (request, response, next) => {
    const url = new URL(request.url || '/', 'http://localhost');
    const isMediaRoute = url.pathname === '/api/pic' || url.pathname.startsWith('/api/pic/') || url.pathname === '/api/export' || url.pathname === '/api/import';
    if (!isMediaRoute) {
      if (next) return next();
      return false;
    }

    try {
      if (request.method === 'GET' && url.pathname.startsWith('/api/pic/')) {
        const name = decodeURIComponent(url.pathname.slice('/api/pic/'.length));
        if (!isSafePicName(name)) return sendJson(response, 400, { error: '图片名称不合法' });
        const file = path.join(picDirectory, name);
        if (!fs.existsSync(file)) return sendJson(response, 404, { error: '图片不存在' });
        response.statusCode = 200;
        response.setHeader('Content-Type', MIME_TYPES[path.extname(name).toLowerCase()] || 'application/octet-stream');
        response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        fs.createReadStream(file).pipe(response);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/pic') {
        const body = await readBody(request, 26 * 1024 * 1024);
        const parsed = JSON.parse(body.toString('utf8') || '{}');
        const saved = saveDataUrl(parsed.dataUrl);
        return sendJson(response, 200, { name: saved.name, url: `/api/pic/${saved.name}`, size: saved.size });
      }

      if (request.method === 'POST' && url.pathname === '/api/export') {
        const body = await readBody(request, 60 * 1024 * 1024);
        const parsed = JSON.parse(body.toString('utf8') || '{}');
        if (!parsed.bundle || !Array.isArray(parsed.bundle.events)) return sendJson(response, 400, { error: '导出数据无效' });
        const bundle = parsed.bundle;
        const migrated = await normalizeBundleImages(bundle);
        const zip = new JSZip();
        zip.file('boschedule.json', JSON.stringify(bundle, null, 2));
        const folder = zip.folder('pic');
        const names = new Set([...bundlePicNames(bundle), ...migrated]);
        names.forEach((name) => {
          const file = path.join(picDirectory, name);
          if (fs.existsSync(file)) folder.file(name, fs.createReadStream(file));
        });
        const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        const filename = `${sanitizeFilePart(bundle.timetables?.[0]?.name)}-${(bundle.events || []).length}项日程.zip`;
        response.statusCode = 200;
        response.setHeader('Content-Type', 'application/zip');
        response.setHeader('Content-Disposition', `attachment; filename="BoSchedule-export.zip"; filename*=UTF-8''${encodeURIComponent(filename)}`);
        response.setHeader('Content-Length', buffer.length);
        response.end(buffer);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/import') {
        const body = await readBody(request, 200 * 1024 * 1024);
        const zip = await JSZip.loadAsync(body);
        const entry = zip.file('boschedule.json');
        if (!entry) return sendJson(response, 400, { error: '压缩包内缺少 boschedule.json' });
        const bundle = JSON.parse(await entry.async('string'));
        if (bundle.app !== 'BoSchedule' || !Array.isArray(bundle.events)) return sendJson(response, 400, { error: '这不是有效的波日程导出文件' });
        ensurePicDirectory();
        let restored = 0;
        const files = Object.values(zip.files).filter((item) => !item.dir && item.name.startsWith('pic/'));
        for (const item of files) {
          const name = path.basename(item.name);
          if (!isSafePicName(name)) continue;
          const data = await item.async('nodebuffer');
          fs.writeFileSync(path.join(picDirectory, name), data);
          restored += 1;
        }
        return sendJson(response, 200, { bundle, restored });
      }

      return sendJson(response, 404, { error: '媒体接口不存在' });
    } catch (error) {
      return sendJson(response, 500, { error: error instanceof Error ? error.message : '媒体服务异常' });
    }
  };
}
