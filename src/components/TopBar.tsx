import React, { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import type { PrimaryView } from '../types';

interface TopBarProps {
  activeView: PrimaryView;
  onSelectView: (view: PrimaryView) => void;
  onOpenSettings: () => void;
}

const NAV_ITEMS: Array<{ id: PrimaryView; label: string }> = [
  { id: 'map', label: 'Map' },
  { id: 'listings', label: 'Homes' },
  { id: 'history', label: 'Prices' },
  { id: 'favorites', label: 'Saved' },
  { id: 'alerts', label: 'Alerts' },
];

export const TopBar: React.FC<TopBarProps> = ({ activeView, onSelectView, onOpenSettings }) => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`topbar ${scrolled ? 'is-scrolled' : ''}`}
      style={{
        height: 68,
        background: scrolled ? 'rgba(246, 244, 239, 0.94)' : 'rgba(246, 244, 239, 0.86)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <div
        className="container"
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        {/* Single Brand Title + Subtitle Tucked Underneath */}
        <button
          type="button"
          onClick={() => onSelectView('map')}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 23,
              lineHeight: 1.05,
              color: 'var(--ink)',
              letterSpacing: '-0.02em',
            }}
          >
            Bellport NY
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 2 }}>
            Search for a beach house
          </div>
        </button>

        {/* Clean Minimal Underline Navigation Tabs (No Count Numbers, No Add Button) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: '100%' }}>
          <nav
            role="tablist"
            aria-label="Primary navigation"
            style={{ display: 'flex', alignItems: 'center', gap: 4, height: '100%' }}
          >
            {NAV_ITEMS.map((item) => {
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  id={`view-${item.id}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onSelectView(item.id)}
                  style={{
                    position: 'relative',
                    height: '100%',
                    padding: '0 10px',
                    background: 'none',
                    border: 'none',
                    fontSize: 13.5,
                    fontWeight: active ? 600 : 500,
                    color: active ? 'var(--ink)' : 'var(--ink-2)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    transition: 'color 160ms ease',
                  }}
                >
                  <span>{item.label}</span>
                  {active && (
                    <span
                      style={{
                        position: 'absolute',
                        left: 8,
                        right: 8,
                        bottom: 0,
                        height: 2,
                        borderRadius: 999,
                        background: 'var(--accent)',
                      }}
                    />
                  )}
                </button>
              );
            })}
          </nav>

          <button
            id="btn-open-settings"
            type="button"
            className="icon-btn"
            onClick={onOpenSettings}
            title="Settings & Sync"
            aria-label="Settings"
            style={{ width: 32, height: 32, padding: 0, justifyContent: 'center' }}
          >
            <Settings size={15} />
          </button>
        </div>
      </div>
    </header>
  );
};
