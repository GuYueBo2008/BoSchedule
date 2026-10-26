export type PageKey = 'schedule' | 'import' | 'data';
export type ThemeName = 'light' | 'dark' | 'ios' | 'ps';
export type EventColor = 'sage' | 'blue' | 'amber' | 'lavender' | 'rose' | 'cyan';
export type RepeatType = 'weekly' | 'odd' | 'even' | 'once';

export interface Timetable {
  id: string;
  name: string;
  termStart: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleEvent {
  id: string;
  timetableId: string;
  title: string;
  detail: string;
  day: number;
  start: string;
  end: string;
  location: string;
  tags: string[];
  color: EventColor;
  images: string[];
  repeat: RepeatType;
  startWeek: number;
  endWeek: number;
  source?: {
    type: 'text' | 'image' | 'manual';
    content: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleTag {
  id: string;
  name: string;
  color: string;
}

export interface SyncDevice {
  id: string;
  name: string;
  platform: 'Android' | 'Windows' | 'macOS' | 'Linux';
  address: string;
  pairedAt: string;
  lastSync?: string;
}

export interface HistoryItem {
  id: string;
  action: '创建' | '更新' | '删除' | '导入' | '导出' | '同步';
  summary: string;
  timestamp: string;
}

export interface AppSettings {
  theme: ThemeName;
  apiKey: string;
  autoSync: boolean;
  retryInterval: number;
  retryCount: number;
}

export interface AppData {
  version: number;
  activeTimetableId: string;
  timetables: Timetable[];
  events: ScheduleEvent[];
  eventTombstones: Record<string, string>;
  tags: ScheduleTag[];
  devices: SyncDevice[];
  history: HistoryItem[];
  settings: AppSettings;
}

export interface ImportBundle {
  app: 'BoSchedule';
  version: number;
  exportedAt: string;
  timetables: Timetable[];
  events: ScheduleEvent[];
  tags: ScheduleTag[];
}
