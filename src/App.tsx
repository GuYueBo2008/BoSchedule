import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarCheck, CalendarPlus, CalendarRange, Check, Database, Settings } from 'lucide-react';
import { createInitialData } from './data';
import type { AppData, AppSettings, PageKey, ScheduleEvent, ScheduleTag, SyncDevice, Timetable } from './types';
import { createId } from './utils';
import { SchedulePage } from './pages/SchedulePage';
import { ImportPage } from './pages/ImportPage';
import { DataPage } from './pages/DataPage';
import { SettingsModal } from './components/SettingsModal';

const STORAGE_KEY = 'boschedule-data-v1';
const CONNECTION_KEY = 'boschedule-sync-connection-v1';
const TAG_COLORS = ['#39745c', '#496e9f', '#b37731', '#806695', '#a15e68', '#39757b'];

interface SyncConnection { hostAddress: string; clientId: string }
interface SyncResponse { data: Partial<AppData>; devices: SyncDevice[] }

function loadData(): AppData {
  const initial = createInitialData();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return initial;
    const parsed = JSON.parse(stored) as Partial<AppData>;
    return {
      ...initial,
      ...parsed,
      settings: { ...initial.settings, ...parsed.settings },
      timetables: parsed.timetables?.length ? parsed.timetables : initial.timetables,
      events: parsed.events || initial.events,
      eventTombstones: parsed.eventTombstones || {},
      tags: parsed.tags || initial.tags,
      devices: parsed.devices || [],
      history: parsed.history || [],
    };
  } catch {
    return initial;
  }
}

function loadConnection(): SyncConnection | null {
  try { return JSON.parse(localStorage.getItem(CONNECTION_KEY) || 'null'); } catch { return null; }
}

function syncPayload(data: AppData) {
  return {
    version: 1,
    timetables: data.timetables,
    events: data.events,
    tags: data.tags,
    history: data.history,
    eventTombstones: data.eventTombstones,
  };
}

async function requestSync(connection: SyncConnection, route: string, body: Record<string, unknown>) {
  const base = connection.hostAddress.startsWith('http') ? connection.hostAddress : `http://${connection.hostAddress}`;
  const response = await fetch(`${base.replace(/\/$/, '')}/api/sync${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `同步服务返回 ${response.status}`);
  return result;
}

export default function App() {
  const [data, setData] = useState<AppData>(loadData);
  const [page, setPage] = useState<PageKey>('schedule');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const [connection, setConnection] = useState<SyncConnection | null>(loadConnection);
  const [localPairCode, setLocalPairCode] = useState('');
  const toastTimer = useRef<number | undefined>(undefined);
  const retrying = useRef(false);
  const suppressAutoSync = useRef(false);
  const dataRef = useRef(data);
  const connectionRef = useRef(connection);
  dataRef.current = data;
  connectionRef.current = connection;

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* 本地存储已满时保留当前会话数据 */ }
  }, [data]);

  useEffect(() => {
    document.documentElement.dataset.theme = data.settings.theme;
    const colors = { light: '#f7f9f5', dark: '#151915', ios: '#f2f5f9', ps: '#101721' };
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors[data.settings.theme]);
  }, [data.settings.theme]);

  useEffect(() => {
    void fetch('/api/sync/info').then(async (response) => {
      if (!response.ok) return;
      const info = await response.json();
      if (info.pairCode) setLocalPairCode(String(info.pairCode));
    }).catch(() => undefined);
  }, []);

  const notify = useCallback((message: string) => {
    window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message });
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  function historyItem(action: AppData['history'][number]['action'], summary: string): AppData['history'][number] {
    return { id: createId('history'), action, summary, timestamp: new Date().toISOString() };
  }

  const activeTimetable = data.timetables.find((table) => table.id === data.activeTimetableId) || data.timetables[0];

  const applySyncResponse = useCallback((result: SyncResponse) => {
    if (!result.data?.timetables || !Array.isArray(result.data.events)) throw new Error('同步服务返回了无效数据');
    suppressAutoSync.current = true;
    setData((previous) => {
      const timetables = result.data.timetables!.length ? result.data.timetables! : previous.timetables;
      return {
        ...previous,
        timetables,
        events: result.data.events!,
        tags: result.data.tags || previous.tags,
        history: result.data.history || previous.history,
        eventTombstones: result.data.eventTombstones || previous.eventTombstones,
        devices: result.devices || previous.devices,
        activeTimetableId: timetables.some((table) => table.id === previous.activeTimetableId) ? previous.activeTimetableId : timetables[0].id,
      };
    });
  }, []);

  const performSync = useCallback(async () => {
    const current = connectionRef.current;
    if (!current) throw new Error('尚未连接局域网同步主机');
    const result = await requestSync(current, '/sync', { clientId: current.clientId, data: syncPayload(dataRef.current) }) as SyncResponse;
    applySyncResponse(result);
    setData((previous) => ({ ...previous, history: [historyItem('同步', '与局域网主机完成同步'), ...previous.history] }));
  }, [applySyncResponse]);

  const startAutoSync = useCallback(() => {
    if (retrying.current || !connectionRef.current) return;
    retrying.current = true;
    void (async () => {
      const { retryCount, retryInterval } = dataRef.current.settings;
      try {
        for (let attempt = 0; attempt <= retryCount; attempt += 1) {
          try {
            await performSync();
            return;
          } catch {
            if (attempt < retryCount) await new Promise((resolve) => window.setTimeout(resolve, retryInterval * 1000));
          }
        }
        notify('自动同步暂时失败，请检查电脑主机连接');
      } finally {
        retrying.current = false;
      }
    })();
  }, [notify, performSync]);

  useEffect(() => {
    if (suppressAutoSync.current) {
      suppressAutoSync.current = false;
      return;
    }
    if (!data.settings.autoSync || !connection) return;
    const timer = window.setTimeout(startAutoSync, 900);
    return () => window.clearTimeout(timer);
  }, [data.events, data.settings.autoSync, connection, startAutoSync]);

  function createEvent(event: ScheduleEvent) {
    setData((previous) => {
      const eventTombstones = { ...previous.eventTombstones };
      delete eventTombstones[event.id];
      return { ...previous, events: [event, ...previous.events], eventTombstones, history: [historyItem('创建', `新建日程「${event.title}」`), ...previous.history] };
    });
  }

  function importEvents(events: ScheduleEvent[]) {
    setData((previous) => {
      const eventTombstones = { ...previous.eventTombstones };
      events.forEach((event) => delete eventTombstones[event.id]);
      return { ...previous, events: [...events, ...previous.events], eventTombstones, history: [historyItem('导入', `通过 AI 导入 ${events.length} 项日程`), ...previous.history] };
    });
  }

  function updateEvent(event: ScheduleEvent) {
    setData((previous) => {
      const eventTombstones = { ...previous.eventTombstones };
      delete eventTombstones[event.id];
      return { ...previous, events: previous.events.map((item) => item.id === event.id ? event : item), eventTombstones, history: [historyItem('更新', `更新日程「${event.title}」`), ...previous.history] };
    });
  }

  function deleteEvent(id: string) {
    setData((previous) => {
      const event = previous.events.find((item) => item.id === id);
      return { ...previous, events: previous.events.filter((item) => item.id !== id), eventTombstones: { ...previous.eventTombstones, [id]: new Date().toISOString() }, history: [historyItem('删除', `删除日程「${event?.title || '未命名'}」`), ...previous.history] };
    });
  }

  function createTimetable(name: string, termStart: string) {
    const now = new Date().toISOString();
    const table: Timetable = { id: createId('table'), name, termStart, createdAt: now, updatedAt: now };
    setData((previous) => ({ ...previous, timetables: [...previous.timetables, table], activeTimetableId: table.id, history: [historyItem('创建', `新建时间表「${name}」`), ...previous.history] }));
    notify(`已创建时间表「${name}」`);
  }

  function deleteTimetable(id: string) {
    setData((previous) => {
      if (previous.timetables.length <= 1) return previous;
      const table = previous.timetables.find((item) => item.id === id);
      const timetables = previous.timetables.filter((item) => item.id !== id);
      const now = new Date().toISOString();
      const eventTombstones = { ...previous.eventTombstones };
      previous.events.filter((event) => event.timetableId === id).forEach((event) => { eventTombstones[event.id] = now; });
      return { ...previous, timetables, events: previous.events.filter((event) => event.timetableId !== id), eventTombstones, activeTimetableId: previous.activeTimetableId === id ? timetables[0].id : previous.activeTimetableId, history: [historyItem('删除', `删除时间表「${table?.name || ''}」及其日程`), ...previous.history] };
    });
    notify('时间表及其关联日程已删除');
  }

  function addTag(name: string, color: string) {
    setData((previous) => ({ ...previous, tags: [...previous.tags, { id: createId('tag'), name, color }] }));
  }

  function ensureTags(names: string[]) {
    setData((previous) => {
      const missing = [...new Set(names)].filter((name) => !previous.tags.some((tag) => tag.name === name));
      return { ...previous, tags: [...previous.tags, ...missing.map((name, index) => ({ id: createId('tag'), name, color: TAG_COLORS[(previous.tags.length + index) % TAG_COLORS.length] }))] };
    });
  }

  function deleteTag(name: string, transferTo?: string) {
    setData((previous) => {
      const now = new Date().toISOString();
      return {
        ...previous,
        tags: previous.tags.filter((tag) => tag.name !== name),
        events: previous.events.map((event) => event.tags.includes(name) ? { ...event, tags: [...new Set(event.tags.flatMap((tag) => tag === name ? (transferTo ? [transferTo] : []) : [tag]))], updatedAt: now } : event),
        history: [historyItem('更新', transferTo ? `将标签「${name}」转移至「${transferTo}」` : `删除标签「${name}」`), ...previous.history],
      };
    });
  }

  function resolveImport(imported: ScheduleEvent[], newTags: ScheduleTag[]) {
    setData((previous) => {
      const importedIds = new Set(imported.map((event) => event.id));
      const existingIds = new Set(previous.events.map((event) => event.id));
      const replacements = imported.filter((event) => existingIds.has(event.id));
      const additions = imported.filter((event) => !existingIds.has(event.id));
      const eventTombstones = { ...previous.eventTombstones };
      imported.forEach((event) => delete eventTombstones[event.id]);
      return {
        ...previous,
        tags: [...previous.tags, ...newTags.filter((newTag) => !previous.tags.some((tag) => tag.name === newTag.name))],
        events: [...previous.events.map((event) => importedIds.has(event.id) ? imported.find((item) => item.id === event.id)! : event), ...additions],
        eventTombstones,
        history: [historyItem('导入', `文件导入：新增 ${additions.length} 项，覆盖 ${replacements.length} 项`), ...previous.history],
      };
    });
  }

  function recordExport(summary: string) {
    setData((previous) => ({ ...previous, history: [historyItem('导出', summary), ...previous.history] }));
  }

  function updateSettings(settings: Partial<AppSettings>) {
    setData((previous) => ({ ...previous, settings: { ...previous.settings, ...settings } }));
  }

  async function pairDevice(device: Omit<SyncDevice, 'id' | 'pairedAt' | 'lastSync'>, code: string) {
    const clientId = connectionRef.current?.clientId || createId('client');
    const nextConnection = { hostAddress: device.address, clientId };
    const result = await requestSync(nextConnection, '/pair', {
      clientId,
      code,
      name: device.name,
      platform: device.platform,
      address: device.address,
      data: syncPayload(dataRef.current),
    }) as SyncResponse;
    localStorage.setItem(CONNECTION_KEY, JSON.stringify(nextConnection));
    setConnection(nextConnection);
    applySyncResponse(result);
  }

  async function removeDevice(id: string) {
    const current = connectionRef.current;
    if (current) {
      const result = await requestSync(current, '/remove-device', { clientId: current.clientId, deviceId: id });
      setData((previous) => ({ ...previous, devices: result.devices || [] }));
    } else {
      setData((previous) => ({ ...previous, devices: previous.devices.filter((device) => device.id !== id) }));
    }
  }

  async function syncDevice(id: string) {
    if (!dataRef.current.devices.some((device) => device.id === id)) throw new Error('设备不存在');
    try {
      await performSync();
    } catch (error) {
      startAutoSync();
      throw error;
    }
  }

  const sharedTableProps = {
    timetables: data.timetables,
    onSelectTimetable: (activeTimetableId: string) => setData((previous) => ({ ...previous, activeTimetableId })),
    onCreateTimetable: createTimetable,
    onDeleteTimetable: deleteTimetable,
  };

  const navigation = [
    { id: 'schedule' as const, label: '时间表', icon: CalendarRange },
    { id: 'import' as const, label: '日程导入', icon: CalendarPlus },
    { id: 'data' as const, label: '数据同步', icon: Database },
  ];

  return (
    <div className="app-shell">
      <aside className="nav-rail">
        <button className="brand" onClick={() => setPage('schedule')} aria-label="波日程首页"><span className="brand-mark"><CalendarCheck size={25} /></span><strong>波日程</strong><small>BO SCHEDULE</small></button>
        <nav className="rail-nav" aria-label="主导航">{navigation.map((item) => <button key={item.id} className={page === item.id ? 'is-active' : ''} onClick={() => setPage(item.id)}><span><item.icon size={22} /></span><small>{item.label}</small></button>)}</nav>
        <div className="rail-bottom"><div className="local-status"><i /><span>本地已保存</span></div><button className={`rail-settings ${settingsOpen ? 'is-active' : ''}`} onClick={() => setSettingsOpen(true)}><Settings size={21} /><small>设置</small></button></div>
      </aside>

      <header className="mobile-app-bar"><button className="brand" onClick={() => setPage('schedule')}><span className="brand-mark"><CalendarCheck size={22} /></span><strong>波日程</strong></button><button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="设置"><Settings size={21} /></button></header>

      <main className="app-main" key={page}>
        {page === 'schedule' && <SchedulePage timetable={activeTimetable} events={data.events} tags={data.tags} {...sharedTableProps} onUpdateEvent={updateEvent} onDeleteEvent={deleteEvent} onNavigateImport={() => setPage('import')} notify={notify} onExported={recordExport} />}
        {page === 'import' && <ImportPage timetables={data.timetables} activeTimetableId={activeTimetable.id} events={data.events} tags={data.tags} apiKey={data.settings.apiKey} onApiKeyChange={(apiKey) => updateSettings({ apiKey })} onCreateEvent={createEvent} onImportEvents={importEvents} onAddTag={addTag} onEnsureTags={ensureTags} onDeleteTag={deleteTag} notify={notify} />}
        {page === 'data' && <DataPage {...sharedTableProps} activeTimetableId={activeTimetable.id} events={data.events} tags={data.tags} history={data.history} devices={data.devices} settings={data.settings} localPairCode={localPairCode} onSettingsChange={updateSettings} onPairDevice={pairDevice} onDeleteDevice={removeDevice} onSyncDevice={syncDevice} onImport={resolveImport} onExported={recordExport} notify={notify} />}
      </main>

      <nav className="bottom-nav" aria-label="移动端主导航">{navigation.map((item) => <button key={item.id} className={page === item.id ? 'is-active' : ''} onClick={() => setPage(item.id)}><span><item.icon size={21} /></span><small>{item.label}</small></button>)}</nav>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={data.settings} onChange={updateSettings} />
      {toast && <div className="toast" key={toast.id}><span><Check size={16} /></span>{toast.message}</div>}
    </div>
  );
}
