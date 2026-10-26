import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import type { EventColor, ScheduleTag } from '../types';
import { EVENT_COLORS } from '../utils';

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  size = 'medium',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  size?: 'small' | 'medium' | 'large';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭"><X size={20} /></button>
        </header>
        <div className="modal-content">{children}</div>
      </section>
    </div>,
    document.body,
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button className={`toggle ${checked ? 'is-on' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`field ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function ColorPicker({ value, onChange }: { value: EventColor; onChange: (color: EventColor) => void }) {
  return (
    <div className="color-picker" role="radiogroup" aria-label="日程颜色">
      {(Object.entries(EVENT_COLORS) as [EventColor, (typeof EVENT_COLORS)[EventColor]][]).map(([key, color]) => (
        <button
          key={key}
          className={`color-swatch ${value === key ? 'is-selected' : ''}`}
          style={{ '--swatch': color.bg, '--swatch-accent': color.accent } as React.CSSProperties}
          onClick={() => onChange(key)}
          type="button"
          title={color.label}
          aria-label={color.label}
          aria-pressed={value === key}
        >
          {value === key && <Check size={15} strokeWidth={3} />}
        </button>
      ))}
    </div>
  );
}

export function TagPicker({ tags, value, onChange }: { tags: ScheduleTag[]; value: string[]; onChange: (tags: string[]) => void }) {
  return (
    <div className="tag-picker">
      {tags.map((tag) => {
        const selected = value.includes(tag.name);
        return (
          <button
            type="button"
            key={tag.id}
            className={`selectable-tag ${selected ? 'is-selected' : ''}`}
            style={{ '--tag-color': tag.color } as React.CSSProperties}
            onClick={() => onChange(selected ? value.filter((name) => name !== tag.name) : [...value, tag.name])}
          >
            <span className="tag-dot" />{tag.name}{selected && <Check size={13} />}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
