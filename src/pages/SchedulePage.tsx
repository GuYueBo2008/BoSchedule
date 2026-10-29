import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock3, Edit3, FileText,
  MapPin, Plus, Repeat2, Share2, Trash2, X,
} from 'lucide-react';
import type { EventColor, ScheduleEvent, ScheduleTag, Timetable } from '../types';
import {
  DAY_NAMES, DAY_SHORT, EVENT_COLORS, eventOccursInWeek, formatDuration, formatMonthDay,
  formatWeekRange, getCurrentWeek, getWeekDates, repeatLabel, sameDate, timeToMinutes,
} from '../utils';
import { ColorPicker, Field, Modal } from '../components/ui';
import { EventForm, type EventDraft } from '../components/EventForm';
import { TimetableManager } from '../components/TimetableManager';
import { ShareModal } from '../components/ShareModal';

const START_HOUR = 7;
const END_HOUR = 22;
const HOUR_HEIGHT = 70;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, index) => START_HOUR + index);

export function SchedulePage({
  timetable,
  timetables,
  events,
  tags,
  onSelectTimetable,
  onCreateTimetable,
  onDeleteTimetable,
  onUpdateEvent,
  onDeleteEvent,
  onNavigateImport,
  notify,
  onExported,
}: {
  timetable: Timetable;
  timetables: Timetable[];
  events: ScheduleEvent[];
  tags: ScheduleTag[];
  onSelectTimetable: (id: string) => void;
  onCreateTimetable: (name: string, termStart: string) => void;
  onDeleteTimetable: (id: string) => void;
  onUpdateEvent: (event: ScheduleEvent) => void;
  onDeleteEvent: (id: string) => void;
  onNavigateImport: () => void;
  notify: (message: string) => void;
  onExported: (summary: string) => void;
}) {
  const [currentWeek, setCurrentWeek] = useState(() => getCurrentWeek(timetable.termStart));
  const [selectedDay, setSelectedDay] = useState(() => (new Date().getDay() + 6) % 7);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [filterTag, setFilterTag] = useState('all');
  const [manageOpen, setManageOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleEvent | null>(null);
  const [editDraft, setEditDraft] = useState<EventDraft | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);

  useEffect(() => {
    setCurrentWeek(getCurrentWeek(timetable.termStart));
    setSelectedEventId(null);
  }, [timetable.id, timetable.termStart]);

  useEffect(() => setDeleteArmed(false), [selectedEventId]);

  const dates = getWeekDates(timetable.termStart, currentWeek);
  const timetableEvents = useMemo(() => events.filter((event) => event.timetableId === timetable.id), [events, timetable.id]);
  const weekEvents = useMemo(() => timetableEvents.filter((event) => eventOccursInWeek(event, currentWeek)), [timetableEvents, currentWeek]);
  const visibleEvents = useMemo(() => weekEvents.filter((event) => filterTag === 'all' || event.tags.includes(filterTag)), [weekEvents, filterTag]);
  const selectedEvent = events.find((event) => event.id === selectedEventId) || null;
  const realCurrentWeek = getCurrentWeek(timetable.termStart);
  const todayIndex = (new Date().getDay() + 6) % 7;

  function openEditor(event: ScheduleEvent) {
    const { id, createdAt, updatedAt, ...draft } = event;
    setEditing(event);
    setEditDraft(draft);
  }

  function saveEdit() {
    if (!editing || !editDraft) return;
    if (!editDraft.title.trim()) {
      notify('请填写日程名称');
      return;
    }
    if (timeToMinutes(editDraft.end) <= timeToMinutes(editDraft.start)) {
      notify('结束时间需要晚于开始时间');
      return;
    }
    onUpdateEvent({ ...editing, ...editDraft, title: editDraft.title.trim(), updatedAt: new Date().toISOString() });
    setEditing(null);
    setEditDraft(null);
    notify('日程已更新');
  }

  return (
    <div className="page schedule-page">
      <header className="page-heading">
        <div>
          <h1>我的时间表</h1>
          <p>本周 {weekEvents.length} 项安排，把时间留给重要的事。</p>
        </div>
        <div className="heading-actions">
          <button className="button button-tonal" onClick={() => setShareOpen(true)}><Share2 size={18} /> 分享</button>
          <button className="button button-primary" onClick={onNavigateImport}><Plus size={19} /> 新建日程</button>
        </div>
      </header>

      <section className="schedule-shell">
        <div className="schedule-toolbar">
          <button className="timetable-switch" onClick={() => setManageOpen(true)}>
            <span className="toolbar-calendar"><CalendarDays size={20} /></span>
            <span><small>当前时间表</small><strong>{timetable.name}</strong></span>
            <ChevronDown size={17} />
          </button>
          <div className="week-switcher">
            <button className="icon-button" onClick={() => setCurrentWeek((week) => Math.max(1, week - 1))} aria-label="上一周"><ChevronLeft size={20} /></button>
            <div className="week-label"><strong>第 {currentWeek} 周</strong><span>{formatWeekRange(timetable.termStart, currentWeek)}</span></div>
            <button className="icon-button" onClick={() => setCurrentWeek((week) => Math.min(52, week + 1))} aria-label="下一周"><ChevronRight size={20} /></button>
            <button className="today-button" onClick={() => { setCurrentWeek(realCurrentWeek); setSelectedDay(todayIndex); }}>今天</button>
          </div>
          <div className="schedule-filter">
            <span>筛选</span>
            <select value={filterTag} onChange={(event) => setFilterTag(event.target.value)} aria-label="按标签筛选">
              <option value="all">全部日程</option>
              {tags.map((tag) => <option value={tag.name} key={tag.id}>{tag.name}</option>)}
            </select>
          </div>
        </div>

        <div className="desktop-week">
          <div className="week-grid-scroll">
            <div className="week-grid">
              <div className="week-grid-header">
                <div className="timezone">GMT+8</div>
                {dates.map((date, index) => {
                  const today = currentWeek === realCurrentWeek && sameDate(date, new Date());
                  return (
                    <div className={`day-header ${today ? 'is-today' : ''}`} key={date.toISOString()}>
                      <span>{DAY_NAMES[index]}</span>
                      <strong>{date.getDate()}</strong>
                      {today && <i>今天</i>}
                    </div>
                  );
                })}
              </div>
              <div className="week-grid-body">
                <div className="time-axis" style={{ height: (END_HOUR - START_HOUR) * HOUR_HEIGHT }}>
                  {HOURS.map((hour, index) => <span key={hour} style={{ top: index * HOUR_HEIGHT - 8 }}>{String(hour).padStart(2, '0')}:00</span>)}
                </div>
                {DAY_NAMES.map((day, dayIndex) => (
                  <div className={`day-column ${currentWeek === realCurrentWeek && dayIndex === todayIndex ? 'is-today' : ''}`} key={day} style={{ height: (END_HOUR - START_HOUR) * HOUR_HEIGHT }}>
                    {HOURS.slice(0, -1).map((hour) => <div className="hour-line" key={hour} style={{ height: HOUR_HEIGHT }} />)}
                    {visibleEvents.filter((event) => event.day === dayIndex).map((event) => {
                      const top = Math.max(0, (timeToMinutes(event.start) - START_HOUR * 60) / 60 * HOUR_HEIGHT);
                      const height = Math.max(48, (timeToMinutes(event.end) - timeToMinutes(event.start)) / 60 * HOUR_HEIGHT - 5);
                      const color = EVENT_COLORS[event.color];
                      return (
                        <button
                          key={event.id}
                          className="week-event"
                          style={{ top, height, '--event-bg': color.bg, '--event-accent': color.accent } as React.CSSProperties}
                          onClick={() => setSelectedEventId(event.id)}
                        >
                          <span className="event-accent" />
                          <span className="week-event-time">{event.start}–{event.end}</span>
                          <strong>{event.title}</strong>
                          {height > 72 && <small><MapPin size={11} />{event.location || '未设置地点'}</small>}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="schedule-legend">
            <span><i className="legend-dot" />{visibleEvents.length} 项日程</span>
            <span>点击日程查看详情</span>
          </div>
        </div>

        <div className="mobile-week">
          <div className="mobile-day-strip">
            {dates.map((date, index) => (
              <button key={date.toISOString()} className={`${selectedDay === index ? 'is-selected' : ''} ${currentWeek === realCurrentWeek && sameDate(date, new Date()) ? 'is-today' : ''}`} onClick={() => setSelectedDay(index)}>
                <span>{DAY_SHORT[index]}</span><strong>{date.getDate()}</strong><i />
              </button>
            ))}
          </div>
          <div className="mobile-agenda">
            <div className="mobile-agenda-title"><strong>{DAY_NAMES[selectedDay]}</strong><span>{formatMonthDay(dates[selectedDay])} · {visibleEvents.filter((event) => event.day === selectedDay).length} 项安排</span></div>
            {visibleEvents.filter((event) => event.day === selectedDay).sort((a, b) => a.start.localeCompare(b.start)).map((event) => {
              const color = EVENT_COLORS[event.color];
              return (
                <button className="mobile-event" key={event.id} onClick={() => setSelectedEventId(event.id)} style={{ '--event-bg': color.bg, '--event-accent': color.accent } as React.CSSProperties}>
                  <span className="mobile-event-time"><strong>{event.start}</strong><small>{event.end}</small></span>
                  <span className="mobile-event-card"><strong>{event.title}</strong><small><MapPin size={12} />{event.location || '未设置地点'}</small><span>{event.tags.join(' · ')}</span></span>
                </button>
              );
            })}
            {!visibleEvents.some((event) => event.day === selectedDay) && (
              <div className="mobile-empty"><CalendarDays size={28} /><strong>这一天，留一点空白</strong><span>没有符合筛选条件的日程</span></div>
            )}
          </div>
        </div>
      </section>

      {selectedEvent && createPortal(
        <div className="detail-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelectedEventId(null)}>
          <aside className="event-detail" aria-label="日程详情">
            <div className="detail-color-band" style={{ background: EVENT_COLORS[selectedEvent.color].bg }} />
            <header className="detail-header">
              <span className="detail-kicker">日程详情</span>
              <button className="icon-button" onClick={() => setSelectedEventId(null)} aria-label="关闭详情"><X size={20} /></button>
            </header>
            <div className="detail-body">
              <h2>{selectedEvent.title}</h2>
              <div className="detail-tags">{selectedEvent.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
              <div className="detail-info-list">
                <div><span><Clock3 size={19} /></span><p><strong>{formatMonthDay(dates[selectedEvent.day])} · {DAY_NAMES[selectedEvent.day]}</strong><small>{selectedEvent.start}–{selectedEvent.end} · {formatDuration(selectedEvent)}</small></p></div>
                <div><span><MapPin size={19} /></span><p><strong>{selectedEvent.location || '未设置地点'}</strong><small>日程地点</small></p></div>
                <div><span><Repeat2 size={19} /></span><p><strong>{repeatLabel(selectedEvent)}</strong><small>重复规则</small></p></div>
              </div>
              <div className="detail-section"><h3>详细说明</h3><p className={!selectedEvent.detail ? 'muted' : ''}>{selectedEvent.detail || '还没有添加详细说明。'}</p></div>
              {selectedEvent.images.length > 0 && <div className="detail-section"><h3>图片</h3><div className="detail-images">{selectedEvent.images.map((image, index) => <img src={image} alt={`日程附件 ${index + 1}`} key={index} />)}</div></div>}
              <div className="detail-section"><h3>日程颜色</h3><ColorPicker value={selectedEvent.color} onChange={(color: EventColor) => onUpdateEvent({ ...selectedEvent, color, updatedAt: new Date().toISOString() })} /></div>
              {selectedEvent.source?.content && (
                <details className="source-details">
                  <summary><FileText size={16} /> 查看原始来源</summary>
                  {selectedEvent.source.type === 'image' ? <img src={selectedEvent.source.content} alt="日程原始来源" /> : <p>{selectedEvent.source.content}</p>}
                </details>
              )}
            </div>
            <footer className="detail-footer">
              {deleteArmed ? (
                <div className="delete-confirm"><span>确认删除这个日程？</span><button onClick={() => setDeleteArmed(false)}>取消</button><button className="danger" onClick={() => { onDeleteEvent(selectedEvent.id); setSelectedEventId(null); notify('日程已删除'); }}>删除</button></div>
              ) : (
                <><button className="button button-plain subtle-danger" onClick={() => setDeleteArmed(true)}><Trash2 size={17} /> 删除</button><button className="button button-primary" onClick={() => openEditor(selectedEvent)}><Edit3 size={17} /> 编辑日程</button></>
              )}
            </footer>
          </aside>
        </div>, document.body,
      )}

      <Modal open={Boolean(editing && editDraft)} onClose={() => setEditing(null)} title="编辑日程" subtitle="调整后的时间会同步到所有重复周。" size="large">
        {editDraft && <EventForm draft={editDraft} onChange={setEditDraft} timetables={timetables} tags={tags} showTimetable={false} />}
        <div className="modal-actions"><button className="button button-plain" onClick={() => setEditing(null)}>取消</button><button className="button button-primary" onClick={saveEdit}>保存更改</button></div>
      </Modal>

      <TimetableManager open={manageOpen} onClose={() => setManageOpen(false)} timetables={timetables} events={events} activeId={timetable.id} onSelect={onSelectTimetable} onCreate={onCreateTimetable} onDelete={onDeleteTimetable} />
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} timetable={timetable} events={events} tags={tags} currentWeek={currentWeek} notify={notify} onExported={onExported} />
    </div>
  );
}
