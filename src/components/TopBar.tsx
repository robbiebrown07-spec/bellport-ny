import React, { useEffect, useState } from 'react';
import { Edit3, Plus, Settings } from 'lucide-react';
import { AppMark } from './AppMark';

interface TopBarProps {
  activeTab: 'all' | 'shortlist' | 'comps';
  counts: { all: number; shortlist: number; comps: number };
  editMode: boolean;
  onSelectTab: (tab: 'all' | 'shortlist' | 'comps') => void;
  onOpenAdd: () => void;
  onToggleEditMode: () => void;
  onOpenSettings: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  counts,
  editMode,
  onSelectTab,
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
          <div className="segmented-tabs" role="tablist" aria-label="Listing views">
            <button
              id="tab-all"
              type="button"
              role="tab"
              aria-selected={activeTab === 'all'}
              className={`segmented-tabs__tab ${activeTab === 'all' ? 'is-active' : ''}`}
              onClick={() => onSelectTab('all')}
            >
              All
              <span className="segmented-tabs__count">{counts.all}</span>
            </button>
            <button
              id="tab-shortlist"
              type="button"
              role="tab"
              aria-selected={activeTab === 'shortlist'}
              className={`segmented-tabs__tab ${activeTab === 'shortlist' ? 'is-active' : ''}`}
              onClick={() => onSelectTab('shortlist')}
            >
              Shortlist
              <span className="segmented-tabs__count">{counts.shortlist}</span>
            </button>
            <button
              id="tab-comps"
              type="button"
              role="tab"
              aria-selected={activeTab === 'comps'}
              className={`segmented-tabs__tab ${activeTab === 'comps' ? 'is-active' : ''}`}
              onClick={() => onSelectTab('comps')}
            >
              Comps
              <span className="segmented-tabs__count">{counts.comps}</span>
            </button>
          </div>

          <button
            id="btn-open-add"
            type="button"
            className="icon-btn icon-btn--primary"
            onClick={onOpenAdd}
            title="Add or import listings"
          >
            <Plus size={16} />
            <span>Add</span>
          </button>

          <button
            id="btn-toggle-edit"
            type="button"
            className={`icon-btn ${editMode ? 'is-active' : ''}`}
            onClick={onToggleEditMode}
            title="Toggle inline headline/lede editing"
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
