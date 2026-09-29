import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Icon } from './Icons.js';

export function Select({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select',
  compact = false,
  labelHidden = false
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  placeholder?: string;
  compact?: boolean;
  labelHidden?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open ]);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
    btnRef.current?.focus();
  }

  function onBtnKey(e: ReactKeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
    }
  }

  return (
    <div ref={rootRef} className={compact ? 'select select--sm' : 'select'}>
      <span className={labelHidden ? 'vh' : 'select__label'} id={`${id}-label`}>
        {label}
      </span>
      <button
        type="button"
        ref={btnRef}
        className="select__btn"
        id={`${id}-btn`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-btn`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onBtnKey}
      >
        <span className={value ? '' : 'select__placeholder'}>{value || placeholder}</span>
        <Icon
          name="chevronDown"
          size={16}
          className={open ? 'select__chev select__chev--open' : 'select__chev'}
        />
      </button>
      {open && (
        <ul className="select__panel" role="listbox" aria-labelledby={`${id}-label`}>
          {options.map((o) => (
            <li key={o} role="option" aria-selected={o === value}>
              <button
                type="button"
                className={o === value ? 'select__opt select__opt--on' : 'select__opt'}
                onClick={() => pick(o)}
              >
                {o}
                {o === value && <Icon name="check" size={16} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
