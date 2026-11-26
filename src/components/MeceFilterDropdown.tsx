import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface MeceBucketOption {
  value: string;
  label: string;
  swatch?: string;
}

interface MeceFilterDropdownProps {
  label: string;
  options: MeceBucketOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}

export const MeceFilterDropdown: React.FC<MeceFilterDropdownProps> = ({
  label,
  options,
  selected,
  onChange,
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggleVal = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(next);
  };

  const count = selected.size;
  const buttonText =
    count === 0
      ? label
      : count === 1
        ? `${label}: ${options.find((o) => selected.has(o.value))?.label ?? '1'}`
        : `${label} (${count})`;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className={`pill-toggle ${count > 0 ? 'is-active' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          height: 36,
          padding: '0 12px',
          fontSize: 13,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span>{buttonText}</span>
        <ChevronDown size={14} style={{ opacity: 0.7 }} />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            minWidth: 220,
            padding: 6,
            borderRadius: 16,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            boxShadow: 'var(--shadow-2)',
            zIndex: 35,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {options.map((opt) => {
            const active = selected.has(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                role="menuitemcheckbox"
                aria-checked={active}
                onClick={() => toggleVal(opt.value)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: 'none',
                  background: active ? 'var(--accent-soft)' : 'transparent',
                  color: 'var(--ink)',
                  fontSize: 13,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {opt.swatch && (
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 3,
                        background: opt.swatch,
                        display: 'inline-block',
                      }}
                    />
                  )}
                  <span>{opt.label}</span>
                </span>
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    border: active ? 'none' : '1px solid var(--line-strong)',
                    background: active ? 'var(--accent)' : 'transparent',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {active && <Check size={11} />}
                </span>
              </button>
            );
          })}

          {count > 0 && (
            <button
              type="button"
              onClick={() => onChange(new Set())}
              style={{
                marginTop: 4,
                padding: '6px 10px',
                borderRadius: 8,
                border: 'none',
                borderTop: '1px solid var(--line)',
                background: 'transparent',
                color: 'var(--ink-2)',
                fontSize: 12,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              Clear {label}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
