import { useState } from 'react';
import { ArrowLeft, CalendarCheck, Check, ChevronRight, ExternalLink, Github, Info, Moon, Palette, Sun } from 'lucide-react';
import type { AppSettings, ThemeName } from '../types';
import { Modal, Toggle } from './ui';

const THEMES: { id: ThemeName; name: string; description: string; colors: string[] }[] = [
  { id: 'light', name: '云白', description: 'Material You', colors: ['#f7f9f5', '#315f50', '#dcefe3'] },
  { id: 'dark', name: '墨黑', description: 'Material You', colors: ['#151915', '#a5d2ba', '#29382f'] },
  { id: 'ios', name: 'iOS', description: '清透蓝调', colors: ['#f2f5f9', '#087df1', '#ffffff'] },
  { id: 'ps', name: 'PS', description: '深邃电光蓝', colors: ['#101721', '#4f8cff', '#202c3c'] },
];

export function SettingsModal({ open, onClose, settings, onChange }: { open: boolean; onClose: () => void; settings: AppSettings; onChange: (settings: Partial<AppSettings>) => void }) {
  const [aboutOpen, setAboutOpen] = useState(false);
  return (
    <>
      <Modal open={open && !aboutOpen} onClose={onClose} title="设置" subtitle="让波日程更适合你的使用习惯。">
        <div className="settings-section"><div className="settings-section-title"><Palette size={18} /><div><h3>外观主题</h3><p>主题会立即应用，并保存在本机。</p></div></div><div className="theme-grid">{THEMES.map((theme) => <button key={theme.id} className={`theme-card ${settings.theme === theme.id ? 'is-selected' : ''}`} onClick={() => onChange({ theme: theme.id })}><span className="theme-preview" style={{ background: theme.colors[0] }}><i style={{ background: theme.colors[2] }} /><b style={{ background: theme.colors[1] }} /><em style={{ background: theme.colors[1] }} /></span><span><strong>{theme.name}</strong><small>{theme.description}</small></span>{settings.theme === theme.id && <span className="theme-check"><Check size={14} /></span>}</button>)}</div></div>
        <div className="settings-section"><div className="settings-section-title"><Moon size={18} /><div><h3>同步偏好</h3><p>启动应用或修改日程后自动同步。</p></div></div><div className="settings-row"><span><strong>自动同步</strong><small>仅连接到已配对设备</small></span><Toggle checked={settings.autoSync} onChange={(autoSync) => onChange({ autoSync })} label="自动同步" /></div></div>
        <button className="about-entry" onClick={() => setAboutOpen(true)}><span><Info size={19} /></span><div><strong>关于波日程</strong><small>版本、作者与开源项目</small></div><ChevronRight size={18} /></button>
      </Modal>
      <Modal open={aboutOpen} onClose={() => setAboutOpen(false)} title="关于波日程" size="small">
        <div className="about-content"><span className="about-logo"><CalendarCheck size={34} /></span><h2>波日程</h2><p className="about-english">BO SCHEDULE</p><span className="version-badge">Version 1.0.0</span><p className="about-description">把课程、会议与生活放在同一视野里。<br />简洁、灵活，由你掌控的时间表。</p><div className="author-card"><span>作者</span><strong>古月波</strong></div><a className="github-link" href="https://github.com/guyuebo/BoSchedule" target="_blank" rel="noreferrer"><Github size={19} /><span><small>GitHub 项目地址</small><strong>github.com/guyuebo/BoSchedule</strong></span><ExternalLink size={16} /></a><p className="about-copyright">用 Material You 设计语言构建 · 2026</p></div><button className="button button-tonal about-back" onClick={() => setAboutOpen(false)}><ArrowLeft size={17} /> 返回设置</button>
      </Modal>
    </>
  );
}
