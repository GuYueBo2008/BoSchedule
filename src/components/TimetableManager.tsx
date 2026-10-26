import { useState } from 'react';
import { CalendarDays, Check, Plus, Trash2 } from 'lucide-react';
import type { ScheduleEvent, Timetable } from '../types';
import { Modal } from './ui';

export function TimetableManager({
  open,
  onClose,
  timetables,
  events,
  activeId,
  onSelect,
  onCreate,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  timetables: Timetable[];
  events: ScheduleEvent[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: (name: string, termStart: string) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [termStart, setTermStart] = useState('2026-08-31');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  function create() {
    if (!name.trim()) return;
    onCreate(name.trim(), termStart);
    setName('');
  }

  return (
    <Modal open={open} onClose={onClose} title="我的时间表" subtitle="为学期、工作与生活保留独立的时间视图。">
      <div className="timetable-list">
        {timetables.map((table) => {
          const count = events.filter((event) => event.timetableId === table.id).length;
          const active = table.id === activeId;
          return (
            <div className={`timetable-row ${active ? 'is-active' : ''}`} key={table.id}>
              <button className="timetable-main" onClick={() => { onSelect(table.id); onClose(); }}>
                <span className="timetable-icon"><CalendarDays size={20} /></span>
                <span><strong>{table.name}</strong><small>{count} 项日程 · {table.termStart} 开始</small></span>
                {active && <span className="active-check"><Check size={16} /> 使用中</span>}
              </button>
              {timetables.length > 1 && (
                deleteId === table.id ? (
                  <button className="text-danger" onClick={() => { onDelete(table.id); setDeleteId(null); }}>确认删除</button>
                ) : (
                  <button className="icon-button subtle-danger" onClick={() => setDeleteId(table.id)} aria-label={`删除${table.name}`}><Trash2 size={17} /></button>
                )
              )}
            </div>
          );
        })}
      </div>
      <div className="inline-create">
        <div className="inline-create-title"><Plus size={17} /> 新建时间表</div>
        <div className="inline-create-fields">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：2027 春季学期" />
          <input type="date" value={termStart} onChange={(event) => setTermStart(event.target.value)} aria-label="第一周周一日期" />
          <button className="button button-primary" onClick={create} disabled={!name.trim()}>创建</button>
        </div>
        <p>开始日期应为第一周的周一，用于计算单双周和周日期。</p>
      </div>
    </Modal>
  );
}
