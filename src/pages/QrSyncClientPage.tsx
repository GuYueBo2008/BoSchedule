import { useEffect, useState } from 'react';
import { ArrowLeftRight, CalendarCheck, CheckCircle2, Layers3, LoaderCircle, RefreshCw, XCircle } from 'lucide-react';
import type { AppData } from '../types';
import { formatDateTime } from '../utils';

const STORAGE_KEY = 'boschedule-data-v1';

type Phase = 'loading' | 'ready' | 'syncing' | 'done' | 'error';

interface Summary {
  timetables: number;
  events: number;
  updatedAt: string | null;
}

function readLocalData(): AppData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AppData) : null;
  } catch {
    return null;
  }
}

function localSummary(data: AppData | null): Summary {
  if (!data) return { timetables: 0, events: 0, updatedAt: null };
  const stamps = [...(data.events || []), ...(data.timetables || [])].map((item) => Date.parse(item.updatedAt || '') || 0);
  return {
    timetables: (data.timetables || []).length,
    events: (data.events || []).length,
    updatedAt: stamps.length ? new Date(Math.max(...stamps)).toISOString() : null,
  };
}

function guessClientName() {
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return 'iPhone';
  if (/Android/i.test(navigator.userAgent)) return 'Android 手机';
  return '手机浏览器';
}

function SummaryCard({ title, badge, summary, highlight }: { title: string; badge: string; summary: Summary; highlight?: boolean }) {
  return (
    <div className={`qr-summary-card ${highlight ? 'is-highlight' : ''}`}>
      <div className="qr-summary-head"><span>{title}</span><b>{badge}</b></div>
      <div className="qr-summary-nums">
        <span><Layers3 size={16} /> {summary.timetables} 张课表</span>
        <span><CalendarCheck size={16} /> {summary.events} 项日程</span>
      </div>
      <small>{summary.updatedAt ? `最近修改 ${formatDateTime(summary.updatedAt)}` : '暂无数据'}</small>
    </div>
  );
}

export function QrSyncClientPage({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [hostName, setHostName] = useState('');
  const [hostSummary, setHostSummary] = useState<Summary | null>(null);
  const [local, setLocal] = useState<Summary | null>(null);
  const [mergedSummary, setMergedSummary] = useState<Summary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/qr-sync/session?t=${encodeURIComponent(token)}`);
        const result = await response.json();
        if (cancelled) return;
        if (!response.ok) throw new Error(result.error || '同步会话不可用');
        setHostName(String(result.hostName || '电脑'));
        setHostSummary(result.summary);
        setLocal(localSummary(readLocalData()));
        setPhase('ready');
      } catch (err) {
        const message = err instanceof TypeError
          ? '无法连接到电脑。请确认手机与电脑连的是同一个 Wi-Fi；校园网等公共网络常开启 AP 隔离，可让电脑开热点后重新扫码。'
          : (err instanceof Error ? err.message : '同步会话不可用');
        setError(message);
        setPhase('error');
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  async function apply() {
    setPhase('syncing');
    setError('');
    try {
      const localData = readLocalData() || { timetables: [], events: [], tags: [], history: [], eventTombstones: {} } as unknown as AppData;
      const payload = {
        version: 1,
        timetables: localData.timetables || [],
        events: localData.events || [],
        tags: localData.tags || [],
        history: localData.history || [],
        eventTombstones: localData.eventTombstones || {},
      };
      const response = await fetch(`/api/qr-sync/apply?t=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: payload, clientName: guessClientName() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '同步失败');
      const previous = readLocalData();
      const merged = { ...previous, ...result.data } as AppData;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      setMergedSummary(result.summary);
      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : '同步失败');
      setPhase('error');
    }
  }

  return (
    <div className="qr-client-page">
      <div className="qr-client-card">
        <header className="qr-client-head">
          <span className="qr-client-icon"><ArrowLeftRight size={20} /></span>
          <div><h1>扫码同步</h1><p>与 <b>{hostName || '电脑'}</b> 通过局域网直连交换日程</p></div>
        </header>

        {phase === 'loading' && <div className="qr-state"><LoaderCircle size={26} className="spin" /><span>正在连接电脑…</span></div>}

        {phase === 'error' && (
          <div className="qr-state">
            <XCircle size={28} />
            <span>{error}</span>
            <button className="button button-tonal" onClick={() => window.location.reload()}><RefreshCw size={15} /> 重新加载</button>
          </div>
        )}

        {phase === 'ready' && hostSummary && (
          <>
            <div className="qr-summary-grid">
              <SummaryCard title="电脑端" badge={hostName || '电脑'} summary={hostSummary} />
              <SummaryCard title="本机" badge={guessClientName()} summary={local || { timetables: 0, events: 0, updatedAt: null }} highlight />
            </div>
            <button className="button button-primary qr-apply-button" onClick={() => void apply()}>开始同步（新的覆盖旧的）</button>
            <p className="qr-client-note">同一日程按最后编辑时间保留较新版本；单方独有的课表与日程将直接合并。手机上刷新或重新打开波日程即可看到结果。</p>
          </>
        )}

        {phase === 'syncing' && <div className="qr-state"><LoaderCircle size={26} className="spin" /><span>正在合并日程…</span></div>}

        {phase === 'done' && (
          <div className="qr-state is-done">
            <CheckCircle2 size={30} />
            <strong>同步完成</strong>
            {mergedSummary && <span>本机现有 {mergedSummary.timetables} 张课表 · {mergedSummary.events} 项日程</span>}
            <small>关闭此页面，重新打开波日程即可查看。</small>
            <button className="button button-primary" onClick={() => { window.location.href = '/'; }}>打开波日程</button>
          </div>
        )}
      </div>
    </div>
  );
}
