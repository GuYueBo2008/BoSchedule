import type { EventColor, ScheduleEvent } from './types';

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
