import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Copy, FileSpreadsheet, Image as ImageIcon, Link2, LoaderCircle, Share2, Users } from 'lucide-react';
import type { ImportBundle, ScheduleEvent, ScheduleTag, Timetable } from '../types';
import { DAY_NAMES, downloadDataUrl, encodeShareCode, eventOccursInWeek, eventToExport, formatMonthDay, formatSize, getWeekDates, parseWeekSelection } from '../utils';
import { Field, Modal, TagPicker } from './ui';

function slotsFor(events: ScheduleEvent[]) {
  return [...new Set(events.map((event) => event.start))].sort();
}

function eventsForWeek(events: ScheduleEvent[], timetableId: string, week: number, selectedTags: string[]) {
  return events.filter((event) => event.timetableId === timetableId && eventOccursInWeek(event, week) && (!selectedTags.length || event.tags.some((tag) => selectedTags.includes(tag))));
}

function cellText(event: ScheduleEvent) {
  return `${event.start}–${event.end}-${event.title}${event.location ? `-@${event.location}` : ''}`;
}

async function assertImageHasContent(dataUrl: string) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const scale = Math.min(1, 480 / image.width, 480 / image.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('无法校验生成的图片');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const colors = new Set<number>();
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] > 0) colors.add((pixels[index] >> 4) * 256 + (pixels[index + 1] >> 4) * 16 + (pixels[index + 2] >> 4));
  }
  if (colors.size < 4) throw new Error('生成的图片为空，请重试');
}

export function ShareModal({
  open,
  onClose,
  timetable,
  events,
  tags,
  currentWeek,
  nickname,
  onNicknameChange,
  notify,
  onExported,
}: {
  open: boolean;
  onClose: () => void;
  timetable: Timetable;
  events: ScheduleEvent[];
  tags: ScheduleTag[];
  currentWeek: number;
  nickname: string;
  onNicknameChange: (name: string) => void;
  notify: (message: string) => void;
  onExported: (summary: string, action?: '分享' | '导出') => void;
}) {
  const [weeksText, setWeeksText] = useState(String(currentWeek));
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [format, setFormat] = useState<'xlsx' | 'png' | 'friend'>('xlsx');
  const [shareResult, setShareResult] = useState<{ code: string; size: number; count: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setWeeksText(String(currentWeek));
      setShareResult(null);
    }
  }, [open, currentWeek]);

  const weeks = useMemo(() => parseWeekSelection(weeksText), [weeksText]);
  const total = weeks.reduce((count, week) => count + eventsForWeek(events, timetable.id, week, selectedTags).length, 0);
  const friendTotal = useMemo(() => events.filter((event) => event.timetableId === timetable.id && (!selectedTags.length || event.tags.some((tag) => selectedTags.includes(tag)))).length, [events, timetable.id, selectedTags]);
  const shareLink = shareResult ? `${window.location.origin}${window.location.pathname}#share=${shareResult.code}` : '';
  const canSystemShare = typeof navigator.share === 'function';

  async function copyText(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify(message);
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand('copy');
      area.remove();
      notify(copied ? message : '复制失败，请长按文本手动复制');
    }
  }

  async function systemShare() {
    if (!shareResult) return;
    try {
      await navigator.share({ title: `波日程 · ${timetable.name}`, text: `这是我的「${timetable.name}」日程分享码，用波日程导入即可查看：\n${shareResult.code}` });
    } catch { /* 用户取消了系统分享 */ }
  }

  function tableRows(week: number) {
    const weekEvents = eventsForWeek(events, timetable.id, week, selectedTags);
    const dates = getWeekDates(timetable.termStart, week);
    const slots = slotsFor(weekEvents);
    return {
      weekEvents,
      header: ['时间', ...DAY_NAMES.map((day, index) => `${day} ${dates[index].getMonth() + 1}/${dates[index].getDate()}`)],
      rows: slots.map((slot) => [
        slot,
        ...DAY_NAMES.map((_, day) => weekEvents.filter((event) => event.day === day && event.start === slot).map(cellText).join('\n\n')),
      ]),
    };
  }

  function buildSheet(week: number) {
    const { header, rows, weekEvents } = tableRows(week);
    const dates = getWeekDates(timetable.termStart, week);
    const title = `${timetable.name} · 第 ${week} 周`;
    const subtitle = `${formatMonthDay(dates[0])} – ${formatMonthDay(dates[6])}`;
    const body = rows.length ? rows : [['', '本周暂无符合条件的日程', '', '', '', '', '', '']];
    const footer = `由 波日程 BoSchedule 生成 · 本周共 ${weekEvents.length} 项日程`;
    return { title, subtitle, header, body, footer, weekEvents };
  }

  async function exportSchedule() {
    if (format === 'friend') {
      const selected = events.filter((event) => event.timetableId === timetable.id && (!selectedTags.length || event.tags.some((tag) => selectedTags.includes(tag))));
      if (!selected.length) {
        notify('当前筛选条件下没有可分享的日程');
        return;
      }
      setBusy(true);
      try {
        const usedTagNames = new Set(selected.flatMap((event) => event.tags));
        const author = nickname.trim();
        const bundle: ImportBundle = {
          app: 'BoSchedule', version: 1, exportedAt: new Date().toISOString(),
          author: author || undefined,
          timetables: [timetable], events: selected.map(eventToExport), tags: tags.filter((tag) => usedTagNames.has(tag.name)),
        };
        const code = await encodeShareCode(bundle);
        setShareResult({ code, size: new Blob([code]).size, count: selected.length });
        onExported(`生成「${timetable.name}」好友分享码，含 ${selected.length} 项日程`, '分享');
      } catch (error) {
        notify(error instanceof Error ? `生成分享码失败：${error.message}` : '生成分享码失败，请重试');
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!weeks.length) {
      notify('请至少填写一个有效周数');
      return;
    }
    setBusy(true);
    try {
      if (format === 'xlsx') {
        const XLSX = await import('xlsx-js-style');
        const workbook = XLSX.utils.book_new();
        weeks.forEach((week) => {
          const { title, subtitle, header, body, footer, weekEvents } = buildSheet(week);
          const aoa = [[title], [subtitle], header, ...body, [], [footer]];
          const sheet = XLSX.utils.aoa_to_sheet(aoa);
          const lastRow = aoa.length - 1;
          sheet['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
            { s: { r: lastRow, c: 0 }, e: { r: lastRow, c: 7 } },
            ...(!weekEvents.length ? [{ s: { r: 3, c: 0 }, e: { r: 3, c: 7 } }] : []),
          ];
          sheet['!cols'] = [{ wch: 14 }, ...DAY_NAMES.map(() => ({ wch: 30 }))];
          sheet['!rows'] = [{ hpt: 34 }, { hpt: 20 }, { hpt: 26 }, ...body.map(() => ({ hpt: 52 })), { hpt: 10 }, { hpt: 22 }];
          const border = { top: { style: 'thin' as const, color: { rgb: 'DFE5DF' } }, bottom: { style: 'thin' as const, color: { rgb: 'DFE5DF' } }, left: { style: 'thin' as const, color: { rgb: 'DFE5DF' } }, right: { style: 'thin' as const, color: { rgb: 'DFE5DF' } } };
          const styleFor = (row: number, column: number) => {
            if (row === 0) return { font: { sz: 18, bold: true, color: { rgb: '26362C' } }, alignment: { vertical: 'center', horizontal: 'left' } };
            if (row === 1) return { font: { sz: 10, color: { rgb: '708075' } }, alignment: { vertical: 'center', horizontal: 'left' } };
            if (row === 2) return { font: { sz: 11, bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '315F50' } }, alignment: { vertical: 'center', horizontal: 'center' }, border };
            if (row === lastRow) return { font: { sz: 9, color: { rgb: '849087' } }, alignment: { vertical: 'center', horizontal: 'center' } };
            if (row === aoa.length - 2) return {};
            if (column === 0) return { font: { sz: 11, bold: true, color: { rgb: '52675A' } }, fill: { patternType: 'solid', fgColor: { rgb: 'F1F4EF' } }, alignment: { vertical: 'center', horizontal: 'center' }, border };
            return { font: { sz: 11, color: { rgb: '26362C' } }, fill: { patternType: 'solid', fgColor: { rgb: (row - 3) % 2 ? 'F7F9F6' : 'FFFFFF' } }, alignment: { vertical: 'top', horizontal: 'left', wrapText: true }, border };
          };
          for (let row = 0; row < aoa.length; row += 1) {
            for (let column = 0; column < 8; column += 1) {
              const address = XLSX.utils.encode_cell({ r: row, c: column });
              if (!sheet[address]) sheet[address] = { t: 's', v: '' } as never;
              (sheet[address] as { s?: unknown }).s = styleFor(row, column);
            }
          }
          XLSX.utils.book_append_sheet(workbook, sheet, `第${week}周`);
        });
        XLSX.writeFile(workbook, `${timetable.name}-日程分享.xlsx`);
      } else {
        if (!printRef.current) return;
        await document.fonts.ready;
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const { toPng } = await import('html-to-image');
        const dataUrl = await toPng(printRef.current, {
          backgroundColor: '#f4f7f2',
          pixelRatio: 2,
          cacheBust: true,
          style: { left: '0px', top: '0px' },
        });
        await assertImageHasContent(dataUrl);
        downloadDataUrl(dataUrl, `${timetable.name}-日程分享.png`);
      }
      const summary = `分享 ${weeks.length} 周、共 ${total} 项日程（${format.toUpperCase()}）`;
      onExported(summary);
      notify(`已导出 ${format === 'xlsx' ? 'Excel 日程表' : '整页日程图片'}`);
      onClose();
    } catch (error) {
      notify(error instanceof Error ? `导出失败：${error.message}` : '导出失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="分享时间表" subtitle="导出 Excel / 长图，或生成分享码发给好友。" size="medium">
      {shareResult ? (
        <div className="share-result">
          <div className="share-result-meta"><Users size={18} /><span>已为「{timetable.name}」生成分享码，含 <strong>{shareResult.count}</strong> 项日程 · {formatSize(shareResult.size)}</span></div>
          <textarea className="share-code" readOnly value={shareResult.code} rows={5} aria-label="好友分享码" onFocus={(event) => event.currentTarget.select()} />
          <p className="share-result-hint">好友在「数据同步 → 导入」中粘贴分享码，或直接打开分享链接即可导入副本。</p>
          {shareResult.size > 1024 * 1024 && <div className="share-size-warning"><AlertTriangle size={15} /><span>分享码超过 1MB，部分聊天工具可能无法发送长文本，建议使用系统分享，或让好友改用导出文件。</span></div>}
          <div className="share-result-actions">
            <button className="button button-tonal" onClick={() => void copyText(shareResult.code, '分享码已复制，发给好友即可')}><Copy size={16} /> 复制分享码</button>
            <button className="button button-tonal" onClick={() => void copyText(shareLink, '链接已复制，好友打开即可导入')}><Link2 size={16} /> 复制链接</button>
            {canSystemShare && <button className="button button-tonal" onClick={() => void systemShare()}><Share2 size={16} /> 系统分享</button>}
          </div>
          <div className="modal-actions">
            <button className="button button-plain" onClick={() => setShareResult(null)}>返回修改</button>
            <button className="button button-primary" onClick={onClose}>完成</button>
          </div>
        </div>
      ) : (
      <div className="share-options">
        {format !== 'friend' && (
          <Field label="分享周数" hint="可输入 1,3,5-8，支持多周与连续周">
            <div className="week-input-row">
              <input value={weeksText} onChange={(event) => setWeeksText(event.target.value)} placeholder="例如：1,3,5-8" />
              <button className="button button-tonal" onClick={() => setWeeksText(String(currentWeek))}>本周</button>
            </div>
          </Field>
        )}
        <Field label="标签筛选" hint={format === 'friend' ? '不选择标签时，将分享该时间表的全部日程' : '不选择标签时，将分享全部日程'}>
          <TagPicker tags={tags} value={selectedTags} onChange={setSelectedTags} />
        </Field>
        {format === 'friend' && (
          <Field label="我的署名" hint="好友导入后会显示课表来源，留空则不署名">
            <input value={nickname} onChange={(event) => onNicknameChange(event.target.value.slice(0, 20))} placeholder="例如：小波" />
          </Field>
        )}
        <div className="field">
          <span className="field-label">分享方式</span>
          <div className="format-options">
            <button className={format === 'xlsx' ? 'is-selected' : ''} onClick={() => setFormat('xlsx')}>
              <FileSpreadsheet size={23} /><strong>Excel 表格</strong><small>.xlsx · 每周一个工作表</small>
            </button>
            <button className={format === 'png' ? 'is-selected' : ''} onClick={() => setFormat('png')}>
              <ImageIcon size={23} /><strong>长图</strong><small>.png · 多周整页导出</small>
            </button>
            <button className={format === 'friend' ? 'is-selected' : ''} onClick={() => setFormat('friend')}>
              <Users size={23} /><strong>好友分享</strong><small>分享码 / 链接 · 对方一键导入</small>
            </button>
          </div>
        </div>
        <div className="share-summary">
          <Share2 size={18} />
          <span>{format === 'friend' ? <>将分享「{timetable.name}」的 <strong>{friendTotal}</strong> 项日程，含周期规则、地点与图片</> : <>将分享 <strong>{weeks.length}</strong> 周，共 <strong>{total}</strong> 项日程</>}</span>
        </div>
        <div className="modal-actions">
          <button className="button button-plain" onClick={onClose}>取消</button>
          <button className="button button-primary" onClick={() => void exportSchedule()} disabled={busy || (format === 'friend' ? !friendTotal : !weeks.length)}>
            {busy && <LoaderCircle size={17} className="spin" />} {busy ? '正在生成…' : format === 'friend' ? '生成分享码' : '导出并分享'}
          </button>
        </div>
      </div>
      )}
      <div className="share-print-root" ref={printRef}>
        <h1>{timetable.name} · 波日程</h1>
        {weeks.map((week) => {
          const { header, rows, weekEvents } = tableRows(week);
          const dates = getWeekDates(timetable.termStart, week);
          return (
            <section className="print-week" key={week}>
              <h2>第 {week} 周 <span>{formatMonthDay(dates[0])} – {formatMonthDay(dates[6])}</span></h2>
              <table>
                <thead><tr>{header.map((cell) => <th key={cell}>{cell}</th>)}</tr></thead>
                <tbody>
                  {rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}
                  {!weekEvents.length && <tr><td colSpan={8}>本周暂无符合条件的日程</td></tr>}
                </tbody>
              </table>
            </section>
          );
        })}
        <p className="print-footer">由 波日程 BoSchedule 生成 · 作者 古月波</p>
      </div>
    </Modal>
  );
}
