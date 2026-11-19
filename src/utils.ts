import type { EventColor, ImportBundle, ScheduleEvent } from './types';

export const EVENT_COLORS: Record<EventColor, { bg: string; accent: string; label: string }> = {
  sage: { bg: '#dcefe3', accent: '#39745c', label: '鼠尾草绿' },
  blue: { bg: '#dfe9f8', accent: '#496e9f', label: '晴空蓝' },
  amber: { bg: '#f8e8ca', accent: '#95692c', label: '暖杏黄' },
  lavender: { bg: '#ebe3f5', accent: '#78618f', label: '薰衣草紫' },
  rose: { bg: '#f6e0e2', accent: '#a15e68', label: '玫瑰粉' },
  cyan: { bg: '#d9edef', accent: '#39757b', label: '海盐青' },
};

export const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
export const DAY_SHORT = ['一', '二', '三', '四', '五', '六', '日'];

export function createId(prefix = 'id') {
  return `${prefix}_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
}

export function timeToMinutes(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

export function getWeekDates(termStart: string, week: number) {
  const start = new Date(`${termStart}T12:00:00`);
  start.setDate(start.getDate() + (week - 1) * 7);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

export function getCurrentWeek(termStart: string) {
  const start = new Date(`${termStart}T00:00:00`).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(1, Math.min(52, Math.floor((today.getTime() - start) / 604800000) + 1));
}

export function sameDate(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function formatMonthDay(date: Date) {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatWeekRange(termStart: string, week: number) {
  const dates = getWeekDates(termStart, week);
  return `${formatMonthDay(dates[0])} – ${formatMonthDay(dates[6])}`;
}

export function eventOccursInWeek(event: ScheduleEvent, week: number) {
  if (week < event.startWeek || week > event.endWeek) return false;
  if (event.repeat === 'once') return week === event.startWeek;
  if (event.repeat === 'odd') return week % 2 === 1;
  if (event.repeat === 'even') return week % 2 === 0;
  return true;
}

export function repeatLabel(event: ScheduleEvent) {
  if (event.repeat === 'once') return `仅第 ${event.startWeek} 周`;
  const repeat = event.repeat === 'odd' ? '单周' : event.repeat === 'even' ? '双周' : '每周';
  return `第 ${event.startWeek}–${event.endWeek} 周 · ${repeat}`;
}

export function formatDuration(event: ScheduleEvent) {
  const minutes = Math.max(0, timeToMinutes(event.end) - timeToMinutes(event.start));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} 小时${rest ? ` ${rest} 分钟` : ''}` : `${rest} 分钟`;
}

export function formatDateTime(value?: string) {
  if (!value) return '尚未同步';
  const date = new Date(value);
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(content: string, filename: string, type = 'application/json') {
  downloadBlob(new Blob([content], { type: `${type};charset=utf-8` }), filename);
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}

export function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function parseWeekSelection(input: string) {
  const weeks = new Set<number>();
  input.split(/[,，\s]+/).filter(Boolean).forEach((part) => {
    const match = part.match(/^(\d+)(?:\s*[-–—~]\s*(\d+))?$/);
    if (!match) return;
    const start = Math.max(1, Number(match[1]));
    const end = Math.min(52, Number(match[2] || match[1]));
    for (let week = start; week <= end; week += 1) weeks.add(week);
  });
  return [...weeks].sort((a, b) => a - b);
}

export function eventSignature(event: ScheduleEvent) {
  return [event.title, event.day, event.start, event.end, event.startWeek, event.endWeek].join('|');
}

export function eventToExport(event: ScheduleEvent): ScheduleEvent {
  return { ...event, tags: [...event.tags], images: [...event.images] };
}

const SHARE_GZIP_PREFIX = 'BS1';
const SHARE_RAW_PREFIX = 'BS0';

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - (normalized.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function gzipBytes(bytes: Uint8Array) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzipBytes(bytes: Uint8Array) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 从粘贴内容中提取分享码：支持纯编码、`#share=` 链接，容忍空白与换行。 */
export function extractShareCode(input: string) {
  const text = input.trim();
  if (!text) return '';
  const fromLink = text.match(/[#&?/]share=([^&\s]+)/);
  if (fromLink) return fromLink[1];
  return text.replace(/\s+/g, '');
}

/** 将导入包压缩编码为可复制的好友分享码。 */
export async function encodeShareCode(bundle: ImportBundle) {
  const bytes = new TextEncoder().encode(JSON.stringify(bundle));
  try {
    const packed = await gzipBytes(bytes);
    if (packed.length < bytes.length) return `${SHARE_GZIP_PREFIX}.${bytesToBase64Url(packed)}`;
  } catch { /* 环境不支持压缩流时降级为原始编码 */ }
  return `${SHARE_RAW_PREFIX}.${bytesToBase64Url(bytes)}`;
}

/** 解码好友分享码（兼容粘贴链接、多余空白），返回导入包。 */
export async function decodeShareCode(input: string): Promise<ImportBundle> {
  const code = extractShareCode(input);
  const match = code.match(/^(BS[01])\.(.+)$/);
  if (!match) throw new Error('分享码格式不正确，请完整粘贴好友分享的编码或链接');
  const [, prefix, payload] = match;
  try {
    const bytes = prefix === SHARE_GZIP_PREFIX ? await gunzipBytes(base64UrlToBytes(payload)) : base64UrlToBytes(payload);
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as ImportBundle;
    if (parsed.app !== 'BoSchedule' || !Array.isArray(parsed.events)) throw new Error('内容不是波日程分享');
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message === '内容不是波日程分享') throw error;
    throw new Error('分享码不完整或已损坏，请让好友重新复制完整内容');
  }
}

export function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
