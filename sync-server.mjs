import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDirectory = process.env.BOSCHEDULE_DATA_DIR || path.join(os.homedir(), '.boschedule');
const dataFile = path.join(dataDirectory, 'lan-sync.json');
const MAX_BODY_SIZE = 40 * 1024 * 1024;

function loadStore() {
  try {
    const stored = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    return { pairCode: stored.pairCode || String(Math.floor(100000 + Math.random() * 900000)), data: stored.data || null, devices: stored.devices || [] };
  } catch {
    return { pairCode: String(Math.floor(100000 + Math.random() * 900000)), data: null, devices: [] };
  }
}

const store = loadStore();

function saveStore() {
  fs.mkdirSync(dataDirectory, { recursive: true });
  const temporary = `${dataFile}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(store));
  fs.renameSync(temporary, dataFile);
}

function newest(first, second) {
  if (!first) return second;
  if (!second) return first;
  return Date.parse(second.updatedAt || second.timestamp || 0) > Date.parse(first.updatedAt || first.timestamp || 0) ? second : first;
}

function mergeById(local = [], incoming = []) {
  const merged = new Map(local.map((item) => [item.id, item]));
  incoming.forEach((item) => merged.set(item.id, newest(merged.get(item.id), item)));
  return [...merged.values()];
}

function sharedData(data) {
  return {
    version: 1,
    timetables: Array.isArray(data?.timetables) ? data.timetables : [],
    events: Array.isArray(data?.events) ? data.events : [],
    tags: Array.isArray(data?.tags) ? data.tags : [],
    history: Array.isArray(data?.history) ? data.history : [],
    eventTombstones: data?.eventTombstones && typeof data.eventTombstones === 'object' ? data.eventTombstones : {},
  };
}

function mergeData(local, incoming) {
  if (!local) return sharedData(incoming);
  const remote = sharedData(incoming);
  const eventTombstones = { ...local.eventTombstones };
  Object.entries(remote.eventTombstones).forEach(([id, timestamp]) => {
    if (!eventTombstones[id] || Date.parse(timestamp) > Date.parse(eventTombstones[id])) eventTombstones[id] = timestamp;
  });
  const events = mergeById(local.events, remote.events).filter((event) => {
    const deletedAt = eventTombstones[event.id];
    return !deletedAt || Date.parse(event.updatedAt || 0) > Date.parse(deletedAt);
  });
  const tags = new Map((local.tags || []).map((tag) => [tag.name, tag]));
  remote.tags.forEach((tag) => { if (!tags.has(tag.name)) tags.set(tag.name, tag); });
  const history = mergeById(local.history, remote.history).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  return {
    version: 1,
    timetables: mergeById(local.timetables, remote.timetables),
    events,
    tags: [...tags.values()],
    history,
    eventTombstones,
  };
}

function send(response, status, body) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_SIZE) throw new Error('同步数据超过 40MB 限制');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function isLocalRequest(request) {
  const address = (request.socket.remoteAddress || '').replace('::ffff:', '');
  if (address === '::1' || address === '127.0.0.1') return true;
  return Object.values(os.networkInterfaces()).some((entries) => entries?.some((entry) => entry.address === address));
}

function localNetworkAddresses() {
  const addresses = [];
  Object.values(os.networkInterfaces()).forEach((entries) => {
    entries?.forEach((entry) => {
      if (!entry.internal && (entry.family === 'IPv4' || entry.family === 4)) addresses.push(entry.address);
    });
  });
  return addresses.length ? addresses : ['127.0.0.1'];
}

function localPlatform() {
  if (process.platform === 'win32') return 'Windows';
  if (process.platform === 'darwin') return 'macOS';
  return 'Linux';
}

function authorizedDevice(clientId) {
  return store.devices.find((device) => device.clientId === clientId);
}

function publicDevices() {
  return store.devices.map(({ clientId, ...device }) => device);
}

export function createSyncApiHandler() {
  return async (request, response, next) => {
    const url = new URL(request.url || '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/sync')) {
      if (next) return next();
      return false;
    }
    if (request.method === 'OPTIONS') return send(response, 204, {});
    try {
      if (request.method === 'GET' && url.pathname === '/api/sync/info') {
        return send(response, 200, {
          service: 'BoSchedule',
          version: 1,
          name: os.hostname(),
          platform: localPlatform(),
          port: request.socket.localPort || null,
          addresses: localNetworkAddresses(),
          pairCode: isLocalRequest(request) ? store.pairCode : undefined,
        });
      }
      if (request.method === 'POST' && url.pathname === '/api/sync/pair') {
        const body = await readBody(request);
        if (String(body.code) !== store.pairCode) return send(response, 403, { error: '配对码不正确' });
        if (!body.clientId || !body.name) return send(response, 400, { error: '缺少设备信息' });
        const now = new Date().toISOString();
        const existing = authorizedDevice(body.clientId);
        const device = {
          id: existing?.id || `device_${body.clientId}`,
          clientId: body.clientId,
          name: String(body.name).slice(0, 80),
          platform: ['Android', 'Windows', 'macOS', 'Linux'].includes(body.platform) ? body.platform : 'Linux',
          address: String(body.address || request.socket.remoteAddress || ''),
          pairedAt: existing?.pairedAt || now,
          lastSync: now,
        };
        store.devices = [...store.devices.filter((item) => item.clientId !== body.clientId), device];
        store.data = mergeData(store.data, body.data);
        saveStore();
        return send(response, 200, { ok: true, data: store.data, devices: publicDevices() });
      }
      if (request.method === 'POST' && url.pathname === '/api/sync/sync') {
        const body = await readBody(request);
        const device = authorizedDevice(body.clientId);
        if (!device) return send(response, 403, { error: '设备尚未配对' });
        device.lastSync = new Date().toISOString();
        store.data = mergeData(store.data, body.data);
        saveStore();
        return send(response, 200, { ok: true, data: store.data, devices: publicDevices() });
      }
      if (request.method === 'GET' && url.pathname === '/api/sync/devices') {
        if (!authorizedDevice(url.searchParams.get('clientId'))) return send(response, 403, { error: '设备尚未配对' });
        return send(response, 200, { devices: publicDevices(), data: store.data });
      }
      if (request.method === 'POST' && url.pathname === '/api/sync/remove-device') {
        const body = await readBody(request);
        if (!authorizedDevice(body.clientId)) return send(response, 403, { error: '设备尚未配对' });
        store.devices = store.devices.filter((device) => device.id !== body.deviceId);
        saveStore();
        return send(response, 200, { ok: true, devices: publicDevices() });
      }
      return send(response, 404, { error: '同步接口不存在' });
    } catch (error) {
      return send(response, 500, { error: error instanceof Error ? error.message : '同步服务异常' });
    }
  };
}
