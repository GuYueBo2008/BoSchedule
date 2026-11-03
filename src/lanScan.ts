import { Capacitor, registerPlugin } from '@capacitor/core';
import type { SyncDevice } from './types';

export interface LanDevice {
  id: string;
  name: string;
  platform: SyncDevice['platform'];
  address: string;
  port: number;
}

export interface ScanOptions {
  hints?: string[];
  signal?: AbortSignal;
  onProgress?: (label: string, completed: number, total: number) => void;
}

const DEFAULT_SYNC_PORT = 4173;
const SCAN_TIMEOUT = 800;
const SCAN_CONCURRENCY = 48;
const COMMON_GATEWAYS = ['192.168.1.1', '192.168.0.1', '192.168.31.1', '192.168.3.1', '192.168.2.1', '10.0.0.1', '172.20.10.1'];

interface NativeScanPlugin {
  scan(): Promise<{ devices?: Array<Record<string, unknown>> }>;
}

const nativePlugin = registerPlugin<NativeScanPlugin>('LanScan');

function platformOf(value: unknown): SyncDevice['platform'] {
  return value === 'Android' || value === 'Windows' || value === 'macOS' || value === 'Linux' ? value : 'Linux';
}

function readIpv4(value: string) {
  const match = value.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  return parts.every((part) => part >= 0 && part <= 255) ? parts.join('.') : null;
}

function readPrivateIpv4(value: string) {
  const address = readIpv4(value);
  if (!address) return null;
  const [first, second] = address.split('.').map(Number);
  const isPrivate = first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
  return isPrivate ? address : null;
}

function subnetPrefix(address: string) {
  return address.split('.').slice(0, 3).join('.');
}

function nativeScanPlugin(): NativeScanPlugin | null {
  return Capacitor.isNativePlatform() ? nativePlugin : null;
}

function requestSignal(controller: AbortController, signal?: AbortSignal) {
  if (!signal) return () => undefined;
  if (signal.aborted) controller.abort();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  return () => signal.removeEventListener('abort', abort);
}

async function fetchInfo(address: string, port: number, signal?: AbortSignal): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), SCAN_TIMEOUT);
  const release = requestSignal(controller, signal);
  try {
    const response = await fetch(`http://${address}:${port}/api/sync/info`, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) return null;
    const info = await response.json() as Record<string, unknown>;
    return info.service === 'BoSchedule' ? info : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
    release();
  }
}

function toDevice(info: Record<string, unknown>, address: string, fallbackPort: number): LanDevice {
  const port = typeof info.port === 'number' && info.port > 0 ? info.port : fallbackPort;
  return {
    id: typeof info.id === 'string' && info.id ? info.id : `${address}:${port}`,
    name: typeof info.name === 'string' && info.name ? info.name : `${platformOf(info.platform)} 设备`,
    platform: platformOf(info.platform),
    address,
    port,
  };
}

async function probeDevice(address: string, port: number, signal?: AbortSignal) {
  const info = await fetchInfo(address, port, signal);
  return info ? toDevice(info, address, port) : null;
}

function scanPrefixes(hints: string[]) {
  const prefixes = new Set<string>();
  [window.location.hostname, ...hints].forEach((value) => {
    const address = readPrivateIpv4(value);
    if (!address) return;
    const prefix = subnetPrefix(address);
    if (!/^172\.(17|18)\./.test(prefix)) prefixes.add(prefix);
  });
  return [...prefixes].slice(0, 2);
}

async function gatewayResponds(gateway: string, signal?: AbortSignal) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), SCAN_TIMEOUT);
  const release = requestSignal(controller, signal);
  try {
    await fetch(`http://${gateway}/`, { mode: 'no-cors', cache: 'no-store', signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
    release();
  }
}

async function detectPrefixes(signal?: AbortSignal) {
  const detected = await Promise.all(COMMON_GATEWAYS.map(async (gateway) => (
    await gatewayResponds(gateway, signal) ? subnetPrefix(gateway) : null
  )));
  return [...new Set(detected.filter((prefix): prefix is string => Boolean(prefix)))]
    .filter((prefix) => !/^172\.(17|18)\./.test(prefix))
    .slice(0, 2);
}

async function scanNative(plugin: NativeScanPlugin) {
  const result = await plugin.scan();
  const devices = Array.isArray(result?.devices) ? result.devices : [];
  return devices.flatMap((item): LanDevice[] => {
    const address = typeof item.address === 'string' ? readIpv4(item.address) : null;
    const port = Number(item.port);
    if (!address || !Number.isInteger(port) || port < 1 || port > 65535) return [];
    return [{
      id: typeof item.id === 'string' && item.id ? item.id : `${address}:${port}`,
      name: typeof item.name === 'string' && item.name ? item.name : `${platformOf(item.platform)} 设备`,
      platform: platformOf(item.platform),
      address,
      port,
    }];
  });
}

export async function scanLanDevices({ hints = [], signal, onProgress }: ScanOptions = {}): Promise<LanDevice[]> {
  const native = nativeScanPlugin();
  if (native) {
    try {
      onProgress?.('正在通过局域网广播查找设备…', 0, 0);
      const devices = await scanNative(native);
      onProgress?.(`已发现 ${devices.length} 台设备`, devices.length, devices.length);
      return devices;
    } catch {
      /* 原生扫描不可用时退回浏览器扫描 */
    }
  }

  if (window.location.protocol === 'https:') {
    throw new Error('HTTPS 页面无法扫描局域网设备，请使用桌面版 / 安卓 App，或在局域网内通过 HTTP 打开应用');
  }

  let prefixes = scanPrefixes(hints);
  if (!prefixes.length) {
    onProgress?.('正在识别当前局域网…', 0, 0);
    prefixes = await detectPrefixes(signal);
  }
  if (!prefixes.length || signal?.aborted) return [];

  const ports = new Set<number>([DEFAULT_SYNC_PORT]);
  const currentPort = Number(window.location.port);
  if (window.location.protocol === 'http:' && currentPort > 0 && currentPort < 65536) ports.add(currentPort);

  const tasks = prefixes.flatMap((prefix) => {
    const hosts = Array.from({ length: 254 }, (_, index) => `${prefix}.${index + 1}`);
    return [...ports].flatMap((port) => hosts.map((host) => ({ host, port, prefix })));
  });

  const found = new Map<string, LanDevice>();
  const total = tasks.length;
  let completed = 0;

  async function worker() {
    while (tasks.length) {
      if (signal?.aborted) return;
      const task = tasks.shift()!;
      const device = await probeDevice(task.host, task.port, signal);
      if (device) {
        const previous = found.get(device.id);
        if (!previous) found.set(device.id, device);
      }
      completed += 1;
      if (completed % 12 === 0 || completed === total) {
        onProgress?.(`正在扫描 ${task.prefix}.0/24…`, completed, total);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, tasks.length) }, worker));
  const devices = [...found.values()].sort((first, second) => first.name.localeCompare(second.name, 'zh-CN'));
  onProgress?.(`扫描完成，发现 ${devices.length} 台设备`, completed, completed);
  return devices;
}
