import { useMemo, useState } from 'react';
import {
  CalendarCheck, Check, ChevronRight, Download, History,
  Laptop, Layers3, LoaderCircle, MonitorSmartphone, Plus, RefreshCw, ShieldCheck,
  Smartphone, Trash2, Upload, Wifi,
} from 'lucide-react';
import type { AppSettings, HistoryItem, ScheduleEvent, ScheduleTag, SyncDevice, SyncInfo, Timetable } from '../types';
import { formatDateTime } from '../utils';
import { EmptyState, Field, Modal, Toggle } from '../components/ui';
import { ExportModal, ImportModal } from '../components/DataTransfer';
import { TimetableManager } from '../components/TimetableManager';

export function DataPage({
  timetables,
  activeTimetableId,
  events,
  tags,
  history,
  devices,
  settings,
  localSyncInfo,
  onSelectTimetable,
  onCreateTimetable,
  onDeleteTimetable,
  onSettingsChange,
  onPairDevice,
  onDeleteDevice,
  onSyncDevice,
  onImport,
  onExported,
  notify,
}: {
  timetables: Timetable[];
  activeTimetableId: string;
  events: ScheduleEvent[];
  tags: ScheduleTag[];
  history: HistoryItem[];
  devices: SyncDevice[];
  settings: AppSettings;
  localSyncInfo: SyncInfo;
  onSelectTimetable: (id: string) => void;
  onCreateTimetable: (name: string, termStart: string) => void;
  onDeleteTimetable: (id: string) => void;
  onSettingsChange: (settings: Partial<AppSettings>) => void;
  onPairDevice: (address: string, code: string) => Promise<void>;
  onDeleteDevice: (id: string) => Promise<void>;
  onSyncDevice: (id: string) => Promise<void>;
  onImport: (events: ScheduleEvent[], newTags: ScheduleTag[]) => void;
  onExported: (summary: string) => void;
  notify: (message: string) => void;
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [deleteDeviceId, setDeleteDeviceId] = useState<string | null>(null);
  const [pairIp, setPairIp] = useState('');
  const [pairPort, setPairPort] = useState(() => String(localSyncInfo.port || 4173));
  const [pairCode, setPairCode] = useState('');
  const [pairBusy, setPairBusy] = useState(false);
  const storageSize = useMemo(() => Math.max(1, Math.round(new Blob([JSON.stringify({ events, timetables, tags })]).size / 1024)), [events, timetables, tags]);

  function openPairing() {
    setPairIp('');
    setPairPort(String(localSyncInfo.port || 4173));
    setPairCode('');
    setPairOpen(true);
  }

  async function sync(id: string) {
    setSyncingId(id);
    try {
      await onSyncDevice(id);
      notify('同步完成，已按最后编辑时间合并');
    } catch (error) {
      notify(error instanceof Error ? error.message : '同步失败，将按设置自动重试');
    } finally {
      setSyncingId(null);
    }
  }

  async function pair() {
    const port = Number(pairPort);
    if (!pairIp.trim() || !Number.isInteger(port) || port < 1 || port > 65535 || pairCode.trim().length !== 6) {
      notify('请填写目标设备 IP、有效端口和 6 位配对码');
      return;
    }
    setPairBusy(true);
    try {
      await onPairDevice(`${pairIp.trim()}:${port}`, pairCode.trim());
      setPairOpen(false);
      setPairIp(''); setPairCode('');
      notify('设备配对成功，可以开始同步');
    } catch (error) {
      notify(error instanceof Error ? error.message : '配对失败，请检查目标设备地址与配对码');
    } finally {
      setPairBusy(false);
    }
  }

  async function removeDevice(id: string) {
    try {
      await onDeleteDevice(id);
      setDeleteDeviceId(null);
      notify('设备已移除');
    } catch (error) {
      notify(error instanceof Error ? error.message : '移除设备失败');
    }
  }

  return (
    <div className="page data-page">
      <header className="page-heading">
        <div><h1>数据与同步</h1><p>本地优先、自由迁移，在你的设备之间保持一致。</p></div>
        <div className="heading-actions"><button className="button button-tonal" onClick={() => setImportOpen(true)}><Upload size={18} /> 导入</button><button className="button button-primary" onClick={() => setExportOpen(true)}><Download size={18} /> 导出日程</button></div>
      </header>

      <div className="data-stats">
        <div className="stat-card"><span className="stat-icon sage"><CalendarCheck size={21} /></span><div><strong>{events.length}</strong><span>全部日程</span></div><small>本地安全保存</small></div>
        <div className="stat-card"><span className="stat-icon blue"><Layers3 size={21} /></span><div><strong>{timetables.length}</strong><span>时间表</span></div><small>独立管理</small></div>
        <div className="stat-card"><span className="stat-icon lavender"><History size={21} /></span><div><strong>{history.length}</strong><span>编辑记录</span></div><small>全程可追溯</small></div>
        <div className="stat-card"><span className="stat-icon amber"><MonitorSmartphone size={21} /></span><div><strong>{devices.length}</strong><span>已配对设备</span></div><small>局域网同步</small></div>
      </div>

      <div className="data-content-grid">
        <section className="surface history-card">
          <div className="data-section-heading"><div><h2>编辑历史</h2><p>每一次修改，都有迹可循。</p></div><span className="soft-badge"><History size={14} /> 最近 {Math.min(history.length, 8)} 条</span></div>
          <div className="history-list">
            {history.slice(0, 8).map((item) => (
              <div className="history-item" key={item.id}><span className={`history-action action-${item.action}`}>{item.action}</span><div><strong>{item.summary}</strong><small>{formatDateTime(item.timestamp)}</small></div></div>
            ))}
            {!history.length && <EmptyState icon={<History size={25} />} title="还没有编辑记录" description="新建或修改日程后，记录会出现在这里。" />}
          </div>
        </section>

        <div className="data-side-stack">
          <section className="surface data-timetables-card">
            <div className="data-section-heading"><div><h2>时间表</h2><p>切换或管理你的时间视图。</p></div><button className="text-button" onClick={() => setManageOpen(true)}>管理 <ChevronRight size={15} /></button></div>
            <div className="data-timetable-list">{timetables.map((table) => <button key={table.id} className={table.id === activeTimetableId ? 'is-active' : ''} onClick={() => onSelectTimetable(table.id)}><span className="timetable-icon"><Layers3 size={18} /></span><span><strong>{table.name}</strong><small>{events.filter((event) => event.timetableId === table.id).length} 项日程</small></span>{table.id === activeTimetableId ? <span className="active-check"><Check size={14} /> 当前</span> : <ChevronRight size={16} />}</button>)}</div>
          </section>
          <section className="backup-card"><span><ShieldCheck size={24} /></span><div><strong>本地数据已妥善保存</strong><p>{storageSize} KB · 包含图片与编辑历史</p></div><button onClick={() => setExportOpen(true)}>立即备份</button></section>
        </div>
      </div>

      <section className="surface sync-card">
        <div className="sync-heading">
          <div className="sync-title"><span className="section-icon"><Wifi size={21} /></span><div><h2>局域网同步</h2><p>同一 Wi-Fi 下配对，手机与电脑都可以发起同步。</p></div></div>
          <div className="auto-sync-toggle"><span><strong>自动同步</strong><small>启动与日程修改后</small></span><Toggle checked={settings.autoSync} onChange={(autoSync) => onSettingsChange({ autoSync })} label="自动同步" /></div>
        </div>
        <div className="sync-policy"><ShieldCheck size={15} /><span>冲突时自动采用<strong>最后编辑时间</strong>较新的版本</span><div><span>失败重试：每</span><input type="number" min={5} value={settings.retryInterval} onChange={(event) => onSettingsChange({ retryInterval: Math.max(5, Number(event.target.value)) })} aria-label="重试间隔秒数" /><span>秒，共</span><input type="number" min={1} value={settings.retryCount} onChange={(event) => onSettingsChange({ retryCount: Math.max(1, Number(event.target.value)) })} aria-label="重试次数" /><span>次</span></div></div>
        {devices.length ? (
          <div className="device-list">{devices.map((device) => <div className="device-row" key={device.id}><span className="device-icon">{device.platform === 'Android' ? <Smartphone size={22} /> : <Laptop size={22} />}</span><div className="device-info"><strong>{device.name}<span>{device.platform}</span></strong><small>{device.address} · 上次同步 {formatDateTime(device.lastSync)}</small></div><span className="paired-badge"><i /> 已配对</span><button className="button button-tonal" disabled={syncingId === device.id} onClick={() => sync(device.id)}>{syncingId === device.id ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />} {syncingId === device.id ? '同步中' : '立即同步'}</button>{deleteDeviceId === device.id ? <button className="text-danger" onClick={() => { void removeDevice(device.id); }}>确认移除</button> : <button className="icon-button subtle-danger" onClick={() => setDeleteDeviceId(device.id)} aria-label={`移除${device.name}`}><Trash2 size={17} /></button>}</div>)}</div>
        ) : (
          <EmptyState icon={<MonitorSmartphone size={29} />} title="还没有配对设备" description="在另一台设备打开波日程，输入本机地址与配对码即可开始。" action={<button className="button button-primary" onClick={openPairing}><Plus size={17} /> 配对新设备</button>} />
        )}
        {devices.length > 0 && <button className="add-device-button" onClick={openPairing}><Plus size={16} /> 配对新设备</button>}
      </section>

      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} timetables={timetables} activeTimetableId={activeTimetableId} events={events} tags={tags} onExported={onExported} notify={notify} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} timetables={timetables} activeTimetableId={activeTimetableId} events={events} tags={tags} onImport={onImport} notify={notify} />
      <TimetableManager open={manageOpen} onClose={() => setManageOpen(false)} timetables={timetables} events={events} activeId={activeTimetableId} onSelect={onSelectTimetable} onCreate={onCreateTimetable} onDelete={onDeleteTimetable} />
      <Modal open={pairOpen} onClose={() => !pairBusy && setPairOpen(false)} title="配对新设备" subtitle="本机平台与配对码自动识别，输入目标设备的 IP、端口和配对码即可。" size="small">
        <div className="local-pair-code">
          <div className="pair-local-heading"><span>本机配对码</span><b>{localSyncInfo.platform}</b></div>
          <strong className="pair-code-value">{localSyncInfo.pairCode ? `${localSyncInfo.pairCode.slice(0, 3)} ${localSyncInfo.pairCode.slice(3)}` : '--- ---'}</strong>
          <small>{localSyncInfo.pairCode ? '在另一台设备上输入此码完成双向验证' : '当前页面未连接同步服务，请通过 npm start 或桌面版打开'}</small>
          <div className="local-sync-details">
            <div><span>本机 IP</span><b>{localSyncInfo.addresses.join(' · ') || '未检测到'}</b></div>
            <div><span>本机端口</span><b>{localSyncInfo.port || '—'}</b></div>
            <div><span>设备名称</span><b>{localSyncInfo.name || `${localSyncInfo.platform} 设备`}</b></div>
          </div>
        </div>
        <div className="pair-form">
          <Field label="目标设备 IP"><input value={pairIp} onChange={(event) => setPairIp(event.target.value)} placeholder="192.168.1.8" inputMode="decimal" /></Field>
          <Field label="目标端口"><input type="number" min={1} max={65535} value={pairPort} onChange={(event) => setPairPort(event.target.value)} placeholder="4173" inputMode="numeric" /></Field>
          <Field label="6 位配对码" hint="在目标设备的配对弹窗中查看" className="field-full"><input value={pairCode} onChange={(event) => setPairCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6 位数字" inputMode="numeric" /></Field>
        </div>
        <div className="modal-actions"><button className="button button-plain" disabled={pairBusy} onClick={() => setPairOpen(false)}>取消</button><button className="button button-primary" disabled={pairBusy} onClick={() => { void pair(); }}>{pairBusy ? <LoaderCircle size={17} className="spin" /> : <Wifi size={17} />} {pairBusy ? '正在配对…' : '开始配对'}</button></div>
      </Modal>
    </div>
  );
}
