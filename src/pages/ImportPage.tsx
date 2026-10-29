import { useMemo, useRef, useState } from 'react';
import {
  ArrowRight, Bot, Check, ChevronRight, Eye, EyeOff, FileText, ImagePlus, KeyRound,
  LoaderCircle, MapPin, Plus, Sparkles, Tag, Trash2, WandSparkles, X,
} from 'lucide-react';
import type { EventColor, ScheduleEvent, ScheduleTag, Timetable } from '../types';
import { createId, DAY_NAMES, fileToDataUrl, getCurrentWeek, timeToMinutes } from '../utils';
import { emptyEventDraft, EventForm, type EventDraft } from '../components/EventForm';
import { Field, Modal } from '../components/ui';

const AI_COLORS: EventColor[] = ['sage', 'blue', 'lavender', 'amber', 'cyan', 'rose'];
const TAG_COLORS = ['#39745c', '#496e9f', '#b37731', '#806695', '#a15e68', '#39757b'];

function normalizeTime(value: unknown, fallback: string) {
  const match = String(value || '').match(/(\d{1,2})[:：](\d{2})/);
  return match ? `${String(Math.min(23, Number(match[1]))).padStart(2, '0')}:${match[2]}` : fallback;
}

function addMinutes(time: string, minutes: number) {
  const total = Math.min(23 * 60 + 59, timeToMinutes(time) + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function ImportPage({
  timetables,
  activeTimetableId,
  events,
  tags,
  apiKey,
  onApiKeyChange,
  onCreateEvent,
  onImportEvents,
  onAddTag,
  onEnsureTags,
  onDeleteTag,
  notify,
}: {
  timetables: Timetable[];
  activeTimetableId: string;
  events: ScheduleEvent[];
  tags: ScheduleTag[];
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  onCreateEvent: (event: ScheduleEvent) => void;
  onImportEvents: (events: ScheduleEvent[]) => void;
  onAddTag: (name: string, color: string) => void;
  onEnsureTags: (names: string[]) => void;
  onDeleteTag: (name: string, transferTo?: string) => void;
  notify: (message: string) => void;
}) {
  const activeTable = timetables.find((table) => table.id === activeTimetableId) || timetables[0];
  const [mode, setMode] = useState<'manual' | 'ai'>('manual');
  const [draft, setDraft] = useState<EventDraft>(() => emptyEventDraft(activeTimetableId, getCurrentWeek(activeTable.termStart)));
  const [newTag, setNewTag] = useState('');
  const [deleteTag, setDeleteTag] = useState<ScheduleTag | null>(null);
  const [transferTo, setTransferTo] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiImage, setAiImage] = useState('');
  const [aiTimetableId, setAiTimetableId] = useState(activeTimetableId);
  const [extracting, setExtracting] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiResults, setAiResults] = useState<ScheduleEvent[]>([]);
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set());
  const imageInput = useRef<HTMLInputElement>(null);

  const deleteTagCount = useMemo(() => deleteTag ? events.filter((event) => event.tags.includes(deleteTag.name)).length : 0, [deleteTag, events]);

  function saveManual() {
    if (!draft.title.trim()) {
      notify('请先填写日程名称');
      return;
    }
    if (timeToMinutes(draft.end) <= timeToMinutes(draft.start)) {
      notify('结束时间需要晚于开始时间');
      return;
    }
    const now = new Date().toISOString();
    onCreateEvent({ ...draft, title: draft.title.trim(), id: createId('event'), createdAt: now, updatedAt: now });
    setDraft(emptyEventDraft(draft.timetableId, draft.startWeek));
    notify('日程已添加到时间表');
  }

  function addTag() {
    const name = newTag.trim();
    if (!name) return;
    if (tags.some((tag) => tag.name === name)) {
      notify('这个标签已经存在');
      return;
    }
    onAddTag(name, TAG_COLORS[tags.length % TAG_COLORS.length]);
    setNewTag('');
    notify(`已创建标签「${name}」`);
  }

  async function chooseAiImage(files: FileList | null) {
    if (!files?.[0]) return;
    setAiImage(await fileToDataUrl(files[0]));
  }

  async function extractWithAi() {
    if (!apiKey.trim()) {
      setAiError('请先填写 DeepSeek API Key');
      return;
    }
    if (!aiText.trim() && !aiImage) {
      setAiError('请粘贴课表文字，或上传一张日程图片');
      return;
    }
    setExtracting(true);
    setAiError('');
    setAiResults([]);
    const systemPrompt = `你是大学课程表与日程解析助手。从用户文字或图片中提取所有日程，只输出 JSON 对象，格式为 {"events":[...]}。每项包含 title, detail, day, start, end, location, tags, repeat, startWeek, endWeek。day 用 1-7 表示周一至周日；时间使用 24 小时 HH:mm；tags 为字符串数组；repeat 只能是 weekly、odd、even、once；startWeek 和 endWeek 为数字。若原文出现“1-16周”“a-b周”等，写入起止周；单双周分别用 odd/even。缺失 detail 或 location 时输出空字符串。不要输出 Markdown 或其他解释。`;
    const prompt = `请提取以下日程。未注明年份时不需要推测具体日期，只需解析星期和周数。\n${aiText}`;
    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: aiImage ? [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: aiImage } },
            ] : prompt },
          ],
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`API 返回 ${response.status}${body ? `：${body.slice(0, 140)}` : ''}`);
      }
      const result = await response.json();
      const content = result.choices?.[0]?.message?.content;
      if (!content) throw new Error('API 没有返回可识别的内容');
      const parsed = JSON.parse(String(content).replace(/```json|```/g, '').trim());
      const list = Array.isArray(parsed) ? parsed : parsed.events;
      if (!Array.isArray(list) || !list.length) throw new Error('没有从来源中识别到日程');
      const now = new Date().toISOString();
      const normalized = list.map((item, index): ScheduleEvent => {
        const start = normalizeTime(item.start || item.startTime, '08:00');
        const repeat = ['weekly', 'odd', 'even', 'once'].includes(item.repeat) ? item.repeat : 'weekly';
        const startWeek = Math.max(1, Number(item.startWeek) || 1);
        return {
          id: createId('ai'),
          timetableId: aiTimetableId,
          title: String(item.title || item.name || '未命名日程'),
          detail: String(item.detail || item.description || ''),
          day: Math.min(6, Math.max(0, Number(item.day) ? Number(item.day) - 1 : 0)),
          start,
          end: normalizeTime(item.end || item.endTime, addMinutes(start, 90)),
          location: String(item.location || ''),
          tags: Array.isArray(item.tags) ? item.tags.map(String).filter(Boolean) : ['课程'],
          color: AI_COLORS[index % AI_COLORS.length],
          images: [],
          repeat,
          startWeek,
          endWeek: repeat === 'once' ? startWeek : Math.max(startWeek, Number(item.endWeek) || 16),
          source: { type: aiImage ? 'image' : 'text', content: aiImage || aiText },
          createdAt: now,
          updatedAt: now,
        };
      });
      setAiResults(normalized);
      setSelectedResults(new Set(normalized.map((event) => event.id)));
      notify(`识别完成，共找到 ${normalized.length} 项日程`);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : '提取失败，请检查网络与 API Key');
    } finally {
      setExtracting(false);
    }
  }

  function importAiResults() {
    const selected = aiResults.filter((event) => selectedResults.has(event.id));
    if (!selected.length) return;
    onEnsureTags([...new Set(selected.flatMap((event) => event.tags))]);
    onImportEvents(selected);
    setAiResults([]);
    setSelectedResults(new Set());
    setAiText('');
    setAiImage('');
    notify(`已导入 ${selected.length} 项日程`);
  }

  return (
    <div className="page import-page">
      <header className="page-heading">
        <div><h1>日程导入</h1><p>手动记录，或让 AI 从一段文字、一张课表中提取安排。</p></div>
        <div className="segmented page-tabs">
          <button className={mode === 'manual' ? 'is-active' : ''} onClick={() => setMode('manual')}><Plus size={17} /> 手动添加</button>
          <button className={mode === 'ai' ? 'is-active' : ''} onClick={() => setMode('ai')}><WandSparkles size={17} /> AI 智能提取</button>
        </div>
      </header>

      <div className="import-layout">
        <div className="import-main">
          {mode === 'manual' ? (
            <section className="surface form-card">
              <div className="section-card-header"><span className="section-icon"><Plus size={21} /></span><div><h2>添加一个新日程</h2><p>课程、会议、活动，都按你的节奏安排。</p></div></div>
              <EventForm draft={draft} onChange={setDraft} timetables={timetables} tags={tags} />
              <div className="form-footer"><span>保存至 <strong>{timetables.find((table) => table.id === draft.timetableId)?.name}</strong></span><button className="button button-primary" onClick={saveManual}>添加日程 <ArrowRight size={17} /></button></div>
            </section>
          ) : (
            <section className="surface ai-card">
              <div className="section-card-header"><span className="section-icon ai-icon"><Sparkles size={21} /></span><div><h2>把课表交给 AI</h2><p>DeepSeek 会提取名称、时间、地点、详情和标签。</p></div><span className="beta-badge">BETA</span></div>
              <div className="ai-settings-row">
                <Field label="DeepSeek API Key" hint="密钥仅保存在当前设备">
                  <div className="key-input"><KeyRound size={17} /><input type={showKey ? 'text' : 'password'} value={apiKey} onChange={(event) => onApiKeyChange(event.target.value)} placeholder="sk-••••••••••••••••" autoComplete="off" /><button onClick={() => setShowKey(!showKey)} aria-label={showKey ? '隐藏密钥' : '显示密钥'}>{showKey ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
                </Field>
                <Field label="导入到时间表">
                  <select value={aiTimetableId} onChange={(event) => setAiTimetableId(event.target.value)}>{timetables.map((table) => <option value={table.id} key={table.id}>{table.name}</option>)}</select>
                </Field>
              </div>
              <div className="ai-source-grid">
                <div className="ai-text-source">
                  <div className="source-label"><FileText size={16} /> 粘贴文字</div>
                  <textarea value={aiText} onChange={(event) => setAiText(event.target.value)} placeholder={'例如：\n高等数学，周一 8:00-9:40，理科楼 A203，1-16 周每周。\n项目工作坊，周三 14:00-16:00，单周，创新工坊。'} rows={9} />
                  <span className="source-counter">{aiText.length} 字</span>
                </div>
                <div className="ai-image-source">
                  <input ref={imageInput} hidden type="file" accept="image/*" onChange={(event) => chooseAiImage(event.target.files)} />
                  {aiImage ? (
                    <div className="ai-image-preview"><img src={aiImage} alt="待识别课表" /><button onClick={() => setAiImage('')}><X size={16} /> 移除图片</button></div>
                  ) : (
                    <button className="ai-dropzone" onClick={() => imageInput.current?.click()}><span><ImagePlus size={25} /></span><strong>上传课表图片</strong><p>支持 PNG、JPG、WebP</p><small>原图将作为来源一起保存</small></button>
                  )}
                </div>
              </div>
              {aiError && <div className="inline-error">{aiError}</div>}
              <div className="ai-action-row"><p><Bot size={16} /> 提取结果会先展示，确认后才会写入时间表。</p><button className="button button-primary" onClick={extractWithAi} disabled={extracting}>{extracting ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}{extracting ? '正在识别…' : '开始提取'}</button></div>
              {aiResults.length > 0 && (
                <div className="ai-results">
                  <div className="ai-results-heading"><div><Check size={18} /><strong>识别到 {aiResults.length} 项日程</strong></div><button onClick={() => setSelectedResults(selectedResults.size === aiResults.length ? new Set() : new Set(aiResults.map((event) => event.id)))}>{selectedResults.size === aiResults.length ? '取消全选' : '全选'}</button></div>
                  {aiResults.map((event) => {
                    const selected = selectedResults.has(event.id);
                    return (
                      <button className={`ai-result ${selected ? 'is-selected' : ''}`} key={event.id} onClick={() => {
                        const next = new Set(selectedResults);
                        if (selected) next.delete(event.id); else next.add(event.id);
                        setSelectedResults(next);
                      }}>
                        <span className="result-checkbox">{selected && <Check size={14} />}</span>
                        <span className="result-main"><strong>{event.title}</strong><small>{DAY_NAMES[event.day]} · {event.start}–{event.end} · 第 {event.startWeek}–{event.endWeek} 周</small><span><MapPin size={12} />{event.location || '未识别地点'}</span></span>
                        <span className="result-tags">{event.tags.join(' · ')}</span>
                      </button>
                    );
                  })}
                  <div className="form-footer"><span>已选择 {selectedResults.size} 项</span><button className="button button-primary" disabled={!selectedResults.size} onClick={importAiResults}>导入所选 <ChevronRight size={17} /></button></div>
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="import-sidebar">
          <section className="surface tag-manager">
            <div className="section-card-header compact"><span className="section-icon"><Tag size={19} /></span><div><h2>标签管理</h2><p>{tags.length} 个标签 · {events.length} 项日程</p></div></div>
            <div className="new-tag-row"><input value={newTag} onChange={(event) => setNewTag(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addTag()} placeholder="新标签名称" /><button onClick={addTag} disabled={!newTag.trim()} aria-label="添加标签"><Plus size={18} /></button></div>
            <div className="tag-list">
              {tags.map((tag) => {
                const count = events.filter((event) => event.tags.includes(tag.name)).length;
                return <div className="tag-row" key={tag.id}><span className="tag-color" style={{ background: tag.color }} /><strong>{tag.name}</strong><span className="tag-count">{count} 项</span><button onClick={() => { setDeleteTag(tag); setTransferTo(tags.find((item) => item.name !== tag.name)?.name || ''); }} aria-label={`删除${tag.name}`}><Trash2 size={15} /></button></div>;
              })}
            </div>
            <p className="tag-tip">删除正在使用的标签时，可以将相关日程安全转移到其他标签。</p>
          </section>
          <section className="tip-card"><span><Sparkles size={18} /></span><div><strong>小提示</strong><p>“1-8 周单周”这样的大学课程规则，波日程也能准确保存。</p></div></section>
        </aside>
      </div>

      <Modal open={Boolean(deleteTag)} onClose={() => setDeleteTag(null)} title={`删除标签「${deleteTag?.name}」`} subtitle={deleteTagCount ? `有 ${deleteTagCount} 项日程正在使用这个标签。` : '这个标签尚未关联任何日程。'} size="small">
        {deleteTagCount > 0 && (
          <div className="transfer-notice"><span>删除前，请为相关日程选择一个新标签。</span><Field label="转移至"><select value={transferTo} onChange={(event) => setTransferTo(event.target.value)}>{tags.filter((tag) => tag.name !== deleteTag?.name).map((tag) => <option value={tag.name} key={tag.id}>{tag.name}</option>)}</select></Field>{tags.length < 2 && <p className="inline-error">请先创建另一个标签，再执行转移。</p>}</div>
        )}
        <div className="modal-actions"><button className="button button-plain" onClick={() => setDeleteTag(null)}>取消</button><button className="button button-danger" disabled={deleteTagCount > 0 && !transferTo} onClick={() => { if (deleteTag) onDeleteTag(deleteTag.name, deleteTagCount ? transferTo : undefined); setDeleteTag(null); notify(deleteTagCount ? '标签已删除，相关日程已完成转移' : '标签已删除'); }}>确认删除</button></div>
      </Modal>
    </div>
  );
}
