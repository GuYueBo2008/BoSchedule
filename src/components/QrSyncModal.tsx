import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, LoaderCircle, RefreshCw, ScanLine, Smartphone, XCircle } from 'lucide-react';
import type { AppData } from '../types';
import { formatDateTime } from '../utils';
import { Modal } from './ui';

type Phase = 'starting' | 'ready' | 'done' | 'error';

export function qrSyncPayload(data: AppData) {
  return {
    version: 1,
    timetables: data.timetables,
    events: data.events,
    tags: data.tags,
    history: data.history,
    eventTombstones: data.eventTombstones || {},
  };
}

export function QrSyncModal({ open, onClose, data, onApply }: {
  open: boolean;
  onClose: () => void;
  data: AppData;
  onApply: (merged: Partial<AppData>) => void;
}) {
  const [phase, setPhase] = useState<Phase>('starting');
  const [qrImage, setQrImage] = useState('');
  const [syncUrl, setSyncUrl] = useState('');
  const [error, setError] = useState('');
  const [clientName, setClientName] = useState('');
  const [completedAt, setCompletedAt] = useState('');
  const tokenRef = useRef('');
  const timerRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const closeSession = useCallback(() => {
    if (!tokenRef.current) return;
    void fetch(`/api/qr-sync/close?t=${tokenRef.current}`, { method: 'POST' }).catch(() => undefined);
    tokenRef.current = '';
  }, []);

  const start = useCallback(async () => {
    stopPolling();
    setPhase('starting');
    setError('');
    setClientName('');
    try {
      const response = await fetch('/api/qr-sync/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: qrSyncPayload(data) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '同步服务未启动，请通过桌面版或 npm start 打开');
      tokenRef.current = result.token;
      const addresses: string[] = Array.isArray(result.addresses) && result.addresses.length ? result.addresses : ['127.0.0.1'];
      const address = addresses.find((item) => /^\d+\.\d+\.\d+\.\d+$/.test(item)) || addresses[0];
      const url = `http://${address}:${result.port}/qr-sync?t=${result.token}`;
      setSyncUrl(url);
      setQrImage(await QRCode.toDataURL(url, { width: 300, margin: 1, color: { dark: '#1d2a22', light: '#ffffff' } }));
      setPhase('ready');
      timerRef.current = window.setInterval(async () => {
        try {
          const poll = await fetch(`/api/qr-sync/result?t=${tokenRef.current}`);
          if (!poll.ok) return;
          const status = await poll.json();
          if (status.status === 'done' && status.data) {
            stopPolling();
            setClientName(String(status.clientName || '移动设备'));
            setCompletedAt(String(status.completedAt || ''));
            onApply(status.data);
            setPhase('done');
            closeSession();
          }
        } catch { /* 网络波动时继续轮询 */ }
      }, 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : '二维码生成失败');
      setPhase('error');
    }
  }, [data, onApply, closeSession, stopPolling]);

  useEffect(() => {
    if (!open) return;
    void start();
    return () => {
      stopPolling();
    };
    // 仅在弹窗打开时建立一次会话，避免组件更新时覆盖进行中的同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stopPolling]);

  function handleClose() {
    stopPolling();
    closeSession();
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="手机扫码同步" subtitle="手机与电脑连同一个 Wi-Fi，用相机或微信扫码即可建立连接。" size="small">
      {phase === 'starting' && <div className="qr-state"><LoaderCircle size={26} className="spin" /><span>正在生成二维码…</span></div>}
      {phase === 'error' && (
        <div className="qr-state">
          <XCircle size={28} />
          <span>{error}</span>
          <button className="button button-tonal" onClick={() => void start()}><RefreshCw size={15} /> 重试</button>
        </div>
      )}
      {phase === 'ready' && (
        <div className="qr-sync-body">
          <div className="qr-image-wrap">
            {qrImage ? <img src={qrImage} alt="扫码同步二维码" /> : <div className="qr-state"><LoaderCircle size={24} className="spin" /></div>}
          </div>
          <p className="qr-hint"><ScanLine size={15} /> 使用手机相机、微信或浏览器扫码</p>
          <div className="qr-steps">
            <span><b>1</b> 手机扫码打开同步页</span>
            <span><b>2</b> 点击「开始同步」</span>
            <span><b>3</b> 双方日程合并，新的覆盖旧的</span>
          </div>
          <details className="qr-url-fallback">
            <summary>扫不了码？手动输入地址</summary>
            <code>{syncUrl}</code>
          </details>
          <div className="qr-waiting"><LoaderCircle size={15} className="spin" /> 等待手机连接…</div>
        </div>
      )}
      {phase === 'done' && (
        <div className="qr-state is-done">
          <CheckCircle2 size={30} />
          <strong>同步完成</strong>
          <span>{clientName} 已完成同步 · {completedAt ? formatDateTime(completedAt) : ''}</span>
          <small>双方日程已按最后编辑时间合并，本机数据已更新。</small>
          <button className="button button-primary" onClick={handleClose}><Smartphone size={16} /> 好的</button>
        </div>
      )}
    </Modal>
  );
}
