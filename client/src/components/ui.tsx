import type { ReactNode } from 'react';
import { Icon } from './Icons.js';
import type { Grade } from '../types.js';

export function BackBar({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <div className="topbar">
      <button className="backbtn" onClick={onBack} aria-label="Back">
        <Icon name="back" size={18} />
      </button>
      <div>
        <div className="screentitle">{title}</div>
        {subtitle && <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{subtitle}</div>}
      </div>
    </div>
  );
}

export function GradePill({ grade }: { grade: Grade }) {
  const cls = grade === 'A' || grade === 'B' ? '' : grade === 'C' ? 'gpill--mid' : 'gpill--low';
  return <span className={`gpill ${cls}`}>{grade}</span>;
}

export function Stat({
  label,
  value,
  highlighted = false,
  numeric = true,
}: {
  label: string;
  value: string | number;
  highlighted?: boolean;
  numeric?: boolean;
}) {
  return (
    <div className={`stat${highlighted ? ' stat--hl' : ''}`}>
      <div className="stat__k">{label}</div>
      <div className={`stat__v${numeric ? ' num' : ''}`}>{value}</div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__t">{title}</div>
      {children}
    </div>
  );
}

export function CourseRow({
  code,
  title,
  meta,
  grade,
}: {
  code: string;
  title: string;
  meta?: string;
  grade: Grade;
}) {
  return (
    <div className="rrow">
      <div>
        <div className="rrow__code">{code || '-'}</div>
        <div className="rrow__meta">
          {title || 'Untitled'}
          {meta ? ` · ${meta}` : ''}
        </div>
      </div>
      <span className="rrow__grade">
        <GradePill grade={grade} />
      </span>
    </div>
  );
}
