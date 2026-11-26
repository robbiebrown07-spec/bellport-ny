import React, { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import type { PrimaryView } from '../types';
import { AppMark } from './AppMark';

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
  { id: 'about', label: 'About Bellport' },
];

export const TopBar: React.FC<TopBarProps> = ({ activeView, onSelectView, onOpenSettings }) => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`topbar ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="container topbar__inner">
        <div className="topbar__brand-row">
          <button
            type="button"
            className="topbar__brand"
            onClick={() => onSelectView('map')}
          >
            <AppMark size={26} />
            <div>
              <div className="topbar__title">Bellport, NY</div>
              <div className="topbar__subtitle">Robbie’s search for a family vacation house</div>
            </div>
          </button>

          <button
            id="btn-open-settings-mobile"
            type="button"
            className="icon-btn topbar__settings-mobile"
            onClick={onOpenSettings}
            title="Settings & Sync"
            aria-label="Settings"
            style={{
              width: 36,
              height: 36,
              minWidth: 36,
              minHeight: 36,
              padding: 0,
              justifyContent: 'center',
            }}
          >
            <Settings size={15} />
          </button>
        </div>

        <div className="topbar__right">
          <nav className="segmented-tabs" role="tablist" aria-label="Primary navigation">
            {NAV_ITEMS.map((item) => {
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  id={`view-${item.id}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`segmented-tabs__tab ${active ? 'is-active' : ''}`}
                  onClick={() => onSelectView(item.id)}
                >
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <button
            id="btn-open-settings"
            type="button"
            className="icon-btn topbar__settings-desktop"
            onClick={onOpenSettings}
            title="Settings & Sync"
            aria-label="Settings"
            style={{
              width: 36,
              height: 36,
              minWidth: 36,
              minHeight: 36,
              padding: 0,
              justifyContent: 'center',
            }}
          >
            <Settings size={15} />
          </button>
        </div>
      </div>
    </header>
  );
};

