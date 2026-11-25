import React, { useState } from 'react';
import { DollarSign, EyeOff, Moon, Search, StickyNote, Sun, X } from 'lucide-react';

interface CornerDockProps {
  theme: 'light' | 'dark';
  privacyBlur: boolean;
  scratchpad: string;
  onFocusSearch: () => void;
  onTogglePrivacy: () => void;
  onToggleTheme: () => void;
  onChangeScratchpad: (val: string) => void;
}

export const CornerDock: React.FC<CornerDockProps> = ({
  theme,
  privacyBlur,
  scratchpad,
  onFocusSearch,
  onTogglePrivacy,
  onToggleTheme,
  onChangeScratchpad,
}) => {
  const [notesOpen, setNotesOpen] = useState(false);

  return (
    <>
      {notesOpen && (
        <aside className="scratchpad-popover" aria-label="Quick field notes">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <strong style={{ fontSize: 14 }}>Bellport Field Scratchpad</strong>
            <button
              type="button"
              className="icon-btn"
              style={{ minWidth: 30, minHeight: 30, padding: 0 }}
              onClick={() => setNotesOpen(false)}
              aria-label="Close scratchpad"
            >
              <X size={14} />
            </button>
          </div>
          <textarea
            id="dock-scratchpad-input"
            className="textarea priv-val"
            rows={5}
            value={scratchpad}
            onChange={(e) => onChangeScratchpad(e.target.value)}
            placeholder="Jot broker whispers, weekend LIRR train times, or flood-zone questions..."
          />
          <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
            Auto-saved locally on this device.
          </span>
        </aside>
      )}

      <nav className="corner-dock" aria-label="Quick utilities">
        <button
          id="dock-search-btn"
          type="button"
          className="corner-dock__btn"
          onClick={onFocusSearch}
          title="Focus keyword search (/)"
          aria-label="Focus keyword search"
        >
          <Search size={17} />
        </button>

        <button
          id="dock-privacy-btn"
          type="button"
          className={`corner-dock__btn ${privacyBlur ? 'is-active' : ''}`}
          onClick={onTogglePrivacy}
          title={privacyBlur ? 'Show dollar amounts' : 'Privacy Blur: hide prices & private notes'}
          aria-pressed={privacyBlur}
          aria-label="Toggle privacy blur"
        >
          {privacyBlur ? <EyeOff size={17} /> : <DollarSign size={17} />}
        </button>

        <button
          id="dock-notes-btn"
          type="button"
          className={`corner-dock__btn ${notesOpen ? 'is-active' : ''}`}
          onClick={() => setNotesOpen((v) => !v)}
          title="Quick scratchpad notes"
          aria-expanded={notesOpen}
          aria-label="Toggle quick scratchpad notes"
        >
          <StickyNote size={17} />
        </button>

        <button
          id="dock-theme-btn"
          type="button"
          className="corner-dock__btn"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle color theme"
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </nav>
    </>
  );
};
