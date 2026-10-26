import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Check, ChevronRight, Download, FileJson, FolderInput, LoaderCircle,
  UploadCloud,
} from 'lucide-react';
import type { ImportBundle, ScheduleEvent, ScheduleTag, Timetable } from '../types';
import { createId, DAY_NAMES, downloadText, eventSignature, eventToExport } from '../utils';
import { Field, Modal, TagPicker } from './ui';

export function ExportModal({
  open,
  onClose,
  timetables,
  activeTimetableId,
  events,
  tags,
  onExported,
  notify,
}: {
  open: boolean;
  onClose: () => void;
  timetables: Timetable[];
  activeTimetableId: string;
  events: ScheduleEvent[];
  tags: ScheduleTag[];
  onExported: (summary: string) => void;
  notify: (message: string) => void;
}) {
  const [timetableId, setTimetableId] = useState(activeTimetableId);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const candidates = useMemo(() => events.filter((event) => event.timetableId === timetableId && (!selectedTags.length || event.tags.some((tag) => selectedTags.includes(tag)))), [events, timetableId, selectedTags]);

  useEffect(() => {
    if (open) {
      setTimetableId(activeTimetableId);
      setSelectedTags([]);
      setSelectedIds(new Set(events.filter((event) => event.timetableId === activeTimetableId).map((event) => event.id)));
    }
  }, [open, activeTimetableId, events]);

  function changeTimetable(id: string) {
    setTimetableId(id);
    setSelectedTags([]);
    setSelectedIds(new Set(events.filter((event) => event.timetableId === id).map((event) => event.id)));
  }

  function changeTags(value: string[]) {
    setSelectedTags(value);
    const next = events.filter((event) => event.timetableId === timetableId && (!value.length || event.tags.some((tag) => value.includes(tag))));
    setSelectedIds(new Set(next.map((event) => event.id)));
  }

  function exportData() {
    const selected = events.filter((event) => selectedIds.has(event.id) && event.timetableId === timetableId);
    if (!selected.length) {
      notify('请至少选择一项日程');
      return;
    }
    const timetable = timetables.find((table) => table.id === timetableId)!;
    const usedTagNames = new Set(selected.flatMap((event) => event.tags));
    const bundle: ImportBundle = {
      app: 'BoSchedule', version: 1, exportedAt: new Date().toISOString(),
      timetables: [timetable], events: selected.map(eventToExport), tags: tags.filter((tag) => usedTagNames.has(tag.name)),
    };
    downloadText(JSON.stringify(bundle, null, 2), `${timetable.name}-${selected.length}项日程.boschedule.json`);
    onExported(`导出「${timetable.name}」中的 ${selected.length} 项日程`);
    notify(`已导出 ${selected.length} 项日程`);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="导出日程" subtitle="导出为开放的 BoSchedule JSON 文件，图片与来源也会保留。" size="large">
      <div className="transfer-form-grid">
        <Field label="从时间表导出"><select value={timetableId} onChange={(event) => changeTimetable(event.target.value)}>{timetables.map((table) => <option value={table.id} key={table.id}>{table.name}</option>)}</select></Field>
        <Field label="按标签筛选"><TagPicker tags={tags} value={selectedTags} onChange={changeTags} /></Field>
      </div>
      <div className="export-selection">
        <div className="selection-heading"><span>选择日程 <strong>{selectedIds.size}</strong> / {candidates.length}</span><div><button onClick={() => setSelectedIds(new Set(candidates.map((event) => event.id)))}>全选当前</button><button onClick={() => setSelectedIds(new Set())}>清空</button></div></div>
        <div className="export-event-list">
          {candidates.map((event) => {
            const checked = selectedIds.has(event.id);
            return <button className={`export-event ${checked ? 'is-selected' : ''}`} key={event.id} onClick={() => { const next = new Set(selectedIds); if (checked) next.delete(event.id); else next.add(event.id); setSelectedIds(next); }}><span className="result-checkbox">{checked && <Check size={14} />}</span><span><strong>{event.title}</strong><small>{DAY_NAMES[event.day]} · {event.start}–{event.end} · 第 {event.startWeek}–{event.endWeek} 周</small></span><span>{event.tags.join(' · ')}</span></button>;
          })}
          {!candidates.length && <div className="selection-empty">当前筛选条件下没有日程</div>}
        </div>
      </div>
      <div className="export-file-note"><FileJson size={18} /><span>.boschedule.json</span><small>包含标签、周期规则、Base64 图片与原始来源</small></div>
      <div className="modal-actions"><button className="button button-plain" onClick={onClose}>取消</button><button className="button button-primary" onClick={exportData} disabled={!selectedIds.size}><Download size={17} /> 导出 {selectedIds.size} 项日程</button></div>
    </Modal>
  );
}

type ConflictChoice = 'overwrite' | 'ignore';

export function ImportModal({
  open,
  onClose,
  timetables,
  activeTimetableId,
  events,
  tags,
  onImport,
  notify,
}: {
  open: boolean;
  onClose: () => void;
  timetables: Timetable[];
  activeTimetableId: string;
  events: ScheduleEvent[];
  tags: ScheduleTag[];
  onImport: (events: ScheduleEvent[], newTags: ScheduleTag[]) => void;
  notify: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [bundle, setBundle] = useState<ImportBundle | null>(null);
  const [targetId, setTargetId] = useState(activeTimetableId);
  const [tagMappings, setTagMappings] = useState<Record<string, string>>({});
  const [choices, setChoices] = useState<Record<string, ConflictChoice>>({});
  const [reading, setReading] = useState(false);

  useEffect(() => {
    if (open) {
      setTargetId(activeTimetableId);
      setBundle(null);
      setTagMappings({});
      setChoices({});
    }
  }, [open, activeTimetableId]);

  const unknownTags = useMemo(() => {
    if (!bundle) return [];
    return [...new Set(bundle.events.flatMap((event) => event.tags || []))].filter((name) => !tags.some((tag) => tag.name === name));
  }, [bundle, tags]);

  const mappedEvents = useMemo(() => {
    if (!bundle) return [];
    return bundle.events.map((event) => ({
      ...event,
      timetableId: targetId,
      tags: (event.tags || []).map((name) => tagMappings[name] === '__create__' || !tagMappings[name] ? name : tagMappings[name]),
    }));
  }, [bundle, targetId, tagMappings]);

  const conflicts = useMemo(() => mappedEvents.flatMap((imported) => {
    const local = events.find((event) => event.timetableId === targetId && (event.id === imported.id || eventSignature(event) === eventSignature(imported)));
    return local ? [{ imported, local }] : [];
  }), [mappedEvents, events, targetId]);

  async function readBundle(file?: File) {
    if (!file) return;
    setReading(true);
    try {
      const parsed = JSON.parse(await file.text()) as ImportBundle;
      if (parsed.app !== 'BoSchedule' || !Array.isArray(parsed.events)) throw new Error('这不是有效的波日程导出文件');
      setBundle(parsed);
      const mappings: Record<string, string> = {};
      const names = [...new Set(parsed.events.flatMap((event) => event.tags || []))];
      names.forEach((name) => { if (!tags.some((tag) => tag.name === name)) mappings[name] = '__create__'; });
      setTagMappings(mappings);
      setChoices({});
    } catch (error) {
      notify(error instanceof Error ? error.message : '文件读取失败');
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function resolveImport() {
    if (!bundle) return;
    if (conflicts.some(({ imported }) => !choices[imported.id])) {
      notify('请先选择每个冲突日程的处理方式');
      return;
    }
    const now = new Date().toISOString();
    const resolved: ScheduleEvent[] = [];
    mappedEvents.forEach((imported) => {
      const conflict = conflicts.find(({ imported: item }) => item.id === imported.id);
      if (conflict) {
        if (choices[imported.id] === 'ignore') return;
        resolved.push({ ...imported, id: conflict.local.id, createdAt: conflict.local.createdAt, updatedAt: now });
      } else {
        const idUsedElsewhere = events.some((event) => event.id === imported.id);
        resolved.push({ ...imported, id: idUsedElsewhere ? createId('event') : imported.id, createdAt: imported.createdAt || now, updatedAt: now });
      }
    });
    const newTags = unknownTags.filter((name) => tagMappings[name] === '__create__').map((name, index) => ({
      id: createId('tag'), name, color: bundle.tags.find((tag) => tag.name === name)?.color || ['#39745c', '#496e9f', '#b37731', '#806695'][index % 4],
    }));
    onImport(resolved, newTags);
    notify(`导入完成：写入 ${resolved.length} 项，忽略 ${conflicts.filter(({ imported }) => choices[imported.id] === 'ignore').length} 项冲突`);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="导入日程" subtitle="选择目标时间表，并妥善处理新标签与时间冲突。" size="large">
      <input ref={inputRef} hidden type="file" accept=".json,.boschedule,application/json" onChange={(event) => readBundle(event.target.files?.[0])} />
      {!bundle ? (
        <button className="file-dropzone" onClick={() => inputRef.current?.click()}>
          {reading ? <LoaderCircle size={30} className="spin" /> : <UploadCloud size={30} />}
          <strong>{reading ? '正在读取文件…' : '选择波日程文件'}</strong>
          <p>支持 .boschedule.json 文件</p><span>文件仅在本机解析，不会上传到云端</span>
        </button>
      ) : (
        <div className="import-review">
          <div className="file-summary"><span><FileJson size={22} /></span><div><strong>已读取 {bundle.events.length} 项日程</strong><small>导出于 {new Date(bundle.exportedAt).toLocaleString('zh-CN')}</small></div><button onClick={() => { setBundle(null); setChoices({}); }}>重新选择</button></div>
          <Field label="导入到哪个时间表" className="field-full"><select value={targetId} onChange={(event) => { setTargetId(event.target.value); setChoices({}); }}>{timetables.map((table) => <option value={table.id} key={table.id}>{table.name}</option>)}</select></Field>
          {unknownTags.length > 0 && (
            <section className="resolve-section"><div className="resolve-heading"><span><FolderInput size={18} /></span><div><h3>处理新标签</h3><p>可以创建新标签，或同步为本地已有标签。</p></div></div>{unknownTags.map((name) => <div className="tag-mapping-row" key={name}><span className="incoming-tag">{name}</span><ChevronRight size={16} /><select value={tagMappings[name]} onChange={(event) => setTagMappings({ ...tagMappings, [name]: event.target.value })}><option value="__create__">创建新标签「{name}」</option>{tags.map((tag) => <option value={tag.name} key={tag.id}>同步为「{tag.name}」</option>)}</select></div>)}</section>
          )}
          {conflicts.length > 0 && (
            <section className="resolve-section"><div className="resolve-heading conflict"><span><AlertTriangle size={18} /></span><div><h3>发现 {conflicts.length} 项冲突</h3><p>选择覆盖本地日程，或保留本地并忽略导入项。</p></div></div><div className="conflict-bulk"><button onClick={() => setChoices(Object.fromEntries(conflicts.map(({ imported }) => [imported.id, 'overwrite'])))}>全部覆盖</button><button onClick={() => setChoices(Object.fromEntries(conflicts.map(({ imported }) => [imported.id, 'ignore'])))}>全部忽略</button></div>{conflicts.map(({ imported, local }) => <div className="conflict-row" key={imported.id}><div><strong>{imported.title}</strong><small>{DAY_NAMES[imported.day]} · {imported.start}–{imported.end}</small></div><div className="conflict-options"><button className={choices[imported.id] === 'overwrite' ? 'is-selected' : ''} onClick={() => setChoices({ ...choices, [imported.id]: 'overwrite' })}>覆盖本地</button><button className={choices[imported.id] === 'ignore' ? 'is-selected' : ''} onClick={() => setChoices({ ...choices, [imported.id]: 'ignore' })}>忽略导入</button></div></div>)}</section>
          )}
          {!unknownTags.length && !conflicts.length && <div className="ready-import"><Check size={18} /> 没有新标签或冲突，可以直接导入。</div>}
          <div className="modal-actions"><button className="button button-plain" onClick={onClose}>取消</button><button className="button button-primary" onClick={resolveImport}><FolderInput size={17} /> 确认导入</button></div>
        </div>
      )}
    </Modal>
  );
}
