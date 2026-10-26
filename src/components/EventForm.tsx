import { useRef } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import type { ScheduleEvent, Timetable, ScheduleTag } from '../types';
import { DAY_NAMES, fileToDataUrl } from '../utils';
import { ColorPicker, Field, TagPicker } from './ui';

export type EventDraft = Omit<ScheduleEvent, 'id' | 'createdAt' | 'updatedAt'>;

export function emptyEventDraft(timetableId: string, week = 1): EventDraft {
  return {
    timetableId,
    title: '',
    detail: '',
    day: 0,
    start: '08:00',
    end: '09:40',
    location: '',
    tags: [],
    color: 'sage',
    images: [],
    repeat: 'weekly',
    startWeek: week,
    endWeek: 16,
    source: { type: 'manual', content: '' },
  };
}

export function EventForm({
  draft,
  onChange,
  timetables,
  tags,
  showTimetable = true,
}: {
  draft: EventDraft;
  onChange: (draft: EventDraft) => void;
  timetables: Timetable[];
  tags: ScheduleTag[];
  showTimetable?: boolean;
}) {
  const imageInput = useRef<HTMLInputElement>(null);
  const patch = (value: Partial<EventDraft>) => onChange({ ...draft, ...value });

  async function addImages(files: FileList | null) {
    if (!files?.length) return;
    const images = await Promise.all([...files].map(fileToDataUrl));
    patch({ images: [...draft.images, ...images] });
  }

  return (
    <div className="event-form">
      {showTimetable && (
        <Field label="导入到时间表" className="field-full">
          <select value={draft.timetableId} onChange={(event) => patch({ timetableId: event.target.value })}>
            {timetables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}
          </select>
        </Field>
      )}
      <Field label="日程名称" className="field-full">
        <input value={draft.title} onChange={(event) => patch({ title: event.target.value })} placeholder="例如：高等数学" autoComplete="off" />
      </Field>
      <Field label="星期">
        <select value={draft.day} onChange={(event) => patch({ day: Number(event.target.value) })}>
          {DAY_NAMES.map((day, index) => <option value={index} key={day}>{day}</option>)}
        </select>
      </Field>
      <div className="field time-field-group">
        <span className="field-label">时间段</span>
        <div className="time-range">
          <input type="time" aria-label="开始时间" value={draft.start} onChange={(event) => patch({ start: event.target.value })} />
          <span>至</span>
          <input type="time" aria-label="结束时间" value={draft.end} onChange={(event) => patch({ end: event.target.value })} />
        </div>
      </div>
      <Field label="重复规则">
        <select value={draft.repeat} onChange={(event) => {
          const repeat = event.target.value as EventDraft['repeat'];
          patch({ repeat, endWeek: repeat === 'once' ? draft.startWeek : Math.max(draft.endWeek, draft.startWeek) });
        }}>
          <option value="weekly">每周重复</option>
          <option value="odd">仅单周</option>
          <option value="even">仅双周</option>
          <option value="once">单次日程</option>
        </select>
      </Field>
      <div className="field">
        <span className="field-label">生效周</span>
        <div className="week-range-inputs">
          <input
            type="number" min={1} max={52} value={draft.startWeek} aria-label="开始周"
            onChange={(event) => {
              const startWeek = Math.max(1, Number(event.target.value));
              patch({ startWeek, endWeek: draft.repeat === 'once' ? startWeek : Math.max(startWeek, draft.endWeek) });
            }}
          />
          <span>{draft.repeat === 'once' ? '周' : '至'}</span>
          {draft.repeat !== 'once' && (
            <input type="number" min={draft.startWeek} max={52} value={draft.endWeek} aria-label="结束周" onChange={(event) => patch({ endWeek: Math.max(draft.startWeek, Number(event.target.value)) })} />
          )}
          <span>周</span>
        </div>
      </div>
      <Field label="地点" className="field-full">
        <input value={draft.location} onChange={(event) => patch({ location: event.target.value })} placeholder="教室、会议室或线上链接" />
      </Field>
      <Field label="标签" className="field-full">
        <TagPicker tags={tags} value={draft.tags} onChange={(value) => patch({ tags: value })} />
      </Field>
      <Field label="日程颜色" className="field-full">
        <ColorPicker value={draft.color} onChange={(value) => patch({ color: value })} />
      </Field>
      <Field label="详细说明" className="field-full">
        <textarea rows={4} value={draft.detail} onChange={(event) => patch({ detail: event.target.value })} placeholder="补充课程内容、会议议程或注意事项…" />
      </Field>
      <div className="field field-full">
        <span className="field-label">图片 <span className="label-muted">· 以 Base64 保存在本机</span></span>
        <input ref={imageInput} hidden type="file" accept="image/*" multiple onChange={(event) => addImages(event.target.files)} />
        <div className="image-upload-grid">
          {draft.images.map((image, index) => (
            <div className="upload-preview" key={`${image.slice(0, 30)}-${index}`}>
              <img src={image} alt={`日程图片 ${index + 1}`} />
              <button type="button" onClick={() => patch({ images: draft.images.filter((_, itemIndex) => itemIndex !== index) })} aria-label="删除图片"><Trash2 size={15} /></button>
            </div>
          ))}
          <button className="image-upload-button" type="button" onClick={() => imageInput.current?.click()}>
            <ImagePlus size={22} /><span>添加图片</span>
          </button>
        </div>
      </div>
    </div>
  );
}
