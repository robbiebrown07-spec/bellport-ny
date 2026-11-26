import React, { useState } from 'react';
import {
  Download,
  ExternalLink,
  KeyRound,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { PersistedAppState, SyncMetadata } from '../types';
import {
  clearStoredGeminiApiKey,
  maskGeminiKey,
  useGeminiApiKey,
} from '../lib/geminiKey';
import {
  exportListingsAsCsv,
  exportStateAsJson,
  parseImportedJson,
} from '../lib/storage';

interface SettingsDrawerProps {
  open: boolean;
  state: PersistedAppState;
  syncMeta: SyncMetadata;
  hasSampleData: boolean;
  onClose: () => void;
  onRefreshNow: () => Promise<void>;
  onImportState: (next: PersistedAppState) => void;
  onClearSampleData: () => void;
  onRestoreSeedData: () => void;
  onToggleTheme: () => void;
  onTogglePrivacy: () => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  open,
  state,
  syncMeta,
  hasSampleData,
  onClose,
  onRefreshNow,
  onImportState,
  onClearSampleData,
  onRestoreSeedData,
  onToggleTheme,
  onTogglePrivacy,
}) => {
  const [importError, setImportError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const [geminiKey, setGeminiKey] = useGeminiApiKey();
  const [geminiDraft, setGeminiDraft] = useState('');
  const [geminiSavedNote, setGeminiSavedNote] = useState<string | null>(null);

  if (!open) return null;

  const handleSaveGemini = (e: React.FormEvent) => {
    e.preventDefault();
    if (!geminiDraft.trim()) return;
    setGeminiKey(geminiDraft.trim());
    setGeminiDraft('');
    setGeminiSavedNote('Gemini API key saved on this device — Search with Gemini is live.');
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      await onRefreshNow();
      setRefreshMsg('Updated with latest Bellport Village listings (your saved homes & notes are preserved).');
    } catch {
      setRefreshMsg('Could not reach update feed — using locally saved data.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const raw = await file.text();
      const imported = parseImportedJson(raw);
      onImportState(imported);
      setImportError(null);
      onClose();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Invalid JSON file.');
    }
  };

  const formattedSyncTime = syncMeta.lastSyncAt
    ? new Date(syncMeta.lastSyncAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Today';

  return (
    <div
      className="backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-drawer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="drawer" style={{ width: 'min(460px, 100vw)' }}>
        <div className="drawer__header">
          <h2 id="settings-drawer-title" style={{ fontSize: 20 }}>
            Settings, Gemini AI &amp; Sync
          </h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close settings">
            <X size={16} />
          </button>
        </div>

        <div className="drawer__body">
          {/* Gemini AI Search & Open-Ended Reasoning */}
          <div
            style={{
              padding: 14,
              borderRadius: 14,
              background: 'var(--surface-subtle)',
              border: '1px solid var(--line)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <h3 style={{ fontSize: 15, margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={15} color="var(--accent)" />
                <span>Gemini AI Search &amp; Reasoning</span>
              </h3>
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: geminiKey ? '#188038' : 'var(--ink-2)',
                }}
              >
                {geminiKey ? `Connected (${maskGeminiKey(geminiKey)})` : 'Not connected'}
              </span>
            </div>
            <p style={{ fontSize: 12.8, color: 'var(--ink-2)', margin: 0, lineHeight: 1.45 }}>
              Powers open-ended complex questions in <strong>Search with Gemini</strong> using{' '}
              <strong>Gemini 2.5 Flash + Google Search</strong> (taxes, ARB historic rules, pool &amp;
              renovation costs, commute, comparisons). Stored privately on this device only.
            </p>
            <form onSubmit={handleSaveGemini} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="password"
                value={geminiDraft}
                onChange={(e) => setGeminiDraft(e.target.value)}
                placeholder={geminiKey ? 'Paste new key to replace…' : 'Paste Gemini key (AIzaSy…)'}
                autoComplete="off"
                style={{
                  flex: '1 1 180px',
                  height: 36,
                  padding: '0 10px',
                  borderRadius: 10,
                  border: '1px solid var(--line-strong)',
                  background: '#ffffff',
                  color: '#202124',
                  fontSize: 16,
                  fontFamily: 'var(--font-mono)',
                }}
              />
              <button
                type="submit"
                className="icon-btn icon-btn--primary"
                disabled={!geminiDraft.trim()}
                style={{ height: 36, fontWeight: 600 }}
              >
                <KeyRound size={14} />
                <span>{geminiKey ? 'Update' : 'Save Key'}</span>
              </button>
              {geminiKey && (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => {
                    clearStoredGeminiApiKey();
                    setGeminiSavedNote('Disconnected Gemini API key from this device.');
                  }}
                  style={{ height: 36 }}
                >
                  <span>Clear</span>
                </button>
              )}
            </form>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12,
                color: 'var(--accent)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>Get a free Gemini API key at Google AI Studio</span>
              <ExternalLink size={12} />
            </a>
            {geminiSavedNote && (
              <p style={{ fontSize: 12.5, color: '#188038', margin: 0 }}>{geminiSavedNote}</p>
            )}
          </div>

          <div
            style={{
              padding: 14,
              borderRadius: 14,
              background: 'var(--surface-subtle)',
              border: '1px solid var(--line)',
            }}
          >
            <h3 style={{ fontSize: 15, marginBottom: 4 }}>Daily Listing Refresh</h3>
            <p style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 10 }}>
              Bellport Watch refreshes automatically every morning at <strong>7:00 AM ET</strong> and
              syncs new listings &amp; price cuts whenever you open the app — while preserving your
              saved homes, downvotes, notes, and ideal search settings.
            </p>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 10 }}>
              Last feed check: <strong>{formattedSyncTime}</strong>
              {syncMeta.lastSyncSummary ? ` · ${syncMeta.lastSyncSummary}` : ''}
            </div>
            <button
              type="button"
              className="icon-btn icon-btn--primary"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
            >
              <RefreshCw size={14} />
              <span>{refreshing ? 'Checking for Updates…' : 'Refresh Listings Now'}</span>
            </button>
            {refreshMsg && (
              <p style={{ fontSize: 12.5, color: '#188038', marginTop: 8 }}>{refreshMsg}</p>
            )}
          </div>

          <div>
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>Preferences</h3>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="icon-btn" onClick={onToggleTheme}>
                Theme: {state.preferences.theme === 'dark' ? 'Dark' : 'Light'}
              </button>
              <button type="button" className="icon-btn" onClick={onTogglePrivacy}>
                Privacy Blur: {state.preferences.privacyBlur ? 'On' : 'Off'}
              </button>
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: 15, marginBottom: 6 }}>1-Click Export (Own Your Data)</h3>
            <p style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 12 }}>
              All listings, custom tags, and notes live locally in IndexedDB (`schemaVersion: 1`).
              Export anytime as portable JSON or spreadsheet-ready CSV.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="icon-btn"
                onClick={() => exportStateAsJson(state)}
              >
                <Download size={15} />
                <span>Export JSON Backup</span>
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => exportListingsAsCsv(state.listings)}
              >
                <Download size={15} />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: 15, marginBottom: 6 }}>Import JSON Backup</h3>
            <label className="icon-btn" style={{ display: 'inline-flex', cursor: 'pointer' }}>
              <Upload size={15} />
              <span>Choose JSON File</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleFileImport}
                style={{ display: 'none' }}
              />
            </label>
            {importError && (
              <p style={{ fontSize: 13, color: 'var(--g-red-600)', marginTop: 8 }}>{importError}</p>
            )}
          </div>

          <div style={{ paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <h3 style={{ fontSize: 15, marginBottom: 6 }}>Sample Seed Listings</h3>
            <p style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 12 }}>
              Remove the 12 Bellport sample properties once you start adding real homes, or restore
              them anytime for testing.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {hasSampleData && (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={onClearSampleData}
                  style={{ color: 'var(--g-red-600)' }}
                >
                  <Trash2 size={15} />
                  <span>Clear Sample Data</span>
                </button>
              )}
              <button type="button" className="icon-btn" onClick={onRestoreSeedData}>
                <RotateCcw size={15} />
                <span>Restore Bellport Seed</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
