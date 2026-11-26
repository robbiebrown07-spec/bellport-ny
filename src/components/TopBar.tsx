import React, { useEffect, useState } from 'react';
import { Edit3, Plus, RefreshCw, Settings } from 'lucide-react';
import type { PrimaryView } from '../types';
import { AppMark } from './AppMark';

interface TopBarProps {
  activeView: PrimaryView;
  counts: {
    listings: number;
    parcels: number;
    favorites: number;
    alertHits: number;
    priceDrops: number;
  };
  apiConfigured: boolean;
  editMode: boolean;
  onSelectView: (view: PrimaryView) => void;
  onOpenSync: () => void;
  onOpenAdd: () => void;
  onToggleEditMode: () => void;
  onOpenSettings: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeView,
  counts,
  apiConfigured,
  editMode,
  onSelectView,
  onOpenSync,
  onOpenAdd,
  onToggleEditMode,
  onOpenSettings,
}) => {
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
        <div className="topbar__brand">
          <AppMark size={26} />
          <span className="topbar__title">Bellport Watch</span>
          <span className="topbar__slash" aria-hidden="true">
            /
          </span>
          <span className="topbar__scope-chip" title="Focused on Bellport Village, NY (11713)">
            Bellport Village, NY
          </span>
        </div>

        <div className="topbar__right">
          <div className="segmented-tabs" role="tablist" aria-label="Primary views">
            <button
              id="view-listings"
              type="button"
              role="tab"
              aria-selected={activeView === 'listings'}
              className={`segmented-tabs__tab ${activeView === 'listings' ? 'is-active' : ''}`}
              onClick={() => onSelectView('listings')}
            >
              Listings
              <span className="segmented-tabs__count">{counts.listings}</span>
            </button>

            <button
              id="view-map"
              type="button"
              role="tab"
              aria-selected={activeView === 'map'}
              className={`segmented-tabs__tab ${activeView === 'map' ? 'is-active' : ''}`}
              onClick={() => onSelectView('map')}
            >
              Village Map
              <span className="segmented-tabs__count">{counts.parcels.toLocaleString()}</span>
            </button>

            <button
              id="view-favorites"
              type="button"
              role="tab"
              aria-selected={activeView === 'favorites'}
              className={`segmented-tabs__tab ${activeView === 'favorites' ? 'is-active' : ''}`}
              onClick={() => onSelectView('favorites')}
            >
              Favorites
              <span className="segmented-tabs__count">{counts.favorites}</span>
            </button>

            <button
              id="view-alerts"
              type="button"
              role="tab"
              aria-selected={activeView === 'alerts'}
              className={`segmented-tabs__tab ${activeView === 'alerts' ? 'is-active' : ''}`}
              onClick={() => onSelectView('alerts')}
            >
              Alerts
              <span className="segmented-tabs__count">{counts.alertHits}</span>
            </button>

            <button
              id="view-history"
              type="button"
              role="tab"
              aria-selected={activeView === 'history'}
              className={`segmented-tabs__tab ${activeView === 'history' ? 'is-active' : ''}`}
              onClick={() => onSelectView('history')}
            >
              Prices
              <span className="segmented-tabs__count">{counts.priceDrops}</span>
            </button>
          </div>

          <button
            id="btn-open-sync"
            type="button"
            className="icon-btn"
            onClick={onOpenSync}
            title="Sync live Bellport listings via RealtyAPI.io"
          >
            <span
              className="status-dot"
              style={{
                background: apiConfigured ? 'var(--g-green)' : 'var(--g-yellow-600)',
              }}
            />
            <RefreshCw size={14} />
            <span style={{ display: 'inline' }}>Sync</span>
          </button>

          <button
            id="btn-open-add"
            type="button"
            className="icon-btn icon-btn--primary"
            onClick={onOpenAdd}
            title="Add or clip a listing"
          >
            <Plus size={16} />
            <span>Add</span>
          </button>

          <button
            id="btn-toggle-edit"
            type="button"
            className={`icon-btn ${editMode ? 'is-active' : ''}`}
            onClick={onToggleEditMode}
            title="Toggle inline copy editing"
            aria-pressed={editMode}
          >
            <Edit3 size={15} />
          </button>

          <button
            id="btn-open-settings"
            type="button"
            className="icon-btn"
            onClick={onOpenSettings}
            title="Settings & Data export/import"
            aria-label="Settings and Data"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>
    </header>
  );
};
