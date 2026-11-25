import React, { useState } from 'react';
import { CheckCircle2, ExternalLink, KeyRound, RefreshCw, ShieldCheck, X } from 'lucide-react';
import type { PersistedAppState, SyncMetadata } from '../types';
import { saveRealtyApiKey, triggerServerSync } from '../lib/storage';

interface SyncModalProps {
  open: boolean;
  syncMeta: SyncMetadata;
  onClose: () => void;
  onSyncMetaChange: (meta: SyncMetadata) => void;
  onSyncComplete: (nextState: PersistedAppState, meta: SyncMetadata) => void;
}

export const SyncModal: React.FC<SyncModalProps> = ({
  open,
  syncMeta,
  onClose,
  onSyncMetaChange,
  onSyncComplete,
}) => {
  const [keyInput, setKeyInput] = useState('');
  const [editingKey, setEditingKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!open) return null;

  const showKeyForm = !syncMeta.apiConfigured || editingKey;

  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim()) return;
    setSavingKey(true);
    setErrorMsg(null);
    try {
      const updated = await saveRealtyApiKey(keyInput.trim());
      onSyncMetaChange(updated);
      setKeyInput('');
      setEditingKey(false);
      setStatusMsg('API key saved server-side to .env.local. Ready to sync Bellport Village.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save API key.');
    } finally {
      setSavingKey(false);
    }
  };

  const handleRunSync = async () => {
    setSyncing(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const result = await triggerServerSync();
      onSyncComplete(result.state, result.syncMeta);
      setStatusMsg(result.summary);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div
      className="backdrop backdrop--center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <div className="modal__header">
          <div>
            <h2 id="sync-modal-title" style={{ fontSize: 22 }}>
              Bellport Village Live MLS Sync
            </h2>
            <p style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              Polygon radar + one-time cached photo & verbatim description fetch via RealtyAPI.io.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close sync modal">
            <X size={16} />
          </button>
        </div>

        <div className="modal__body">
          {/* Status & Credit Meter */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 12,
              padding: 16,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-subtle)',
              border: '1px solid var(--line)',
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>API Connection</div>
              <strong
                style={{
                  fontSize: 14,
                  color: syncMeta.apiConfigured ? 'var(--g-green-600)' : 'var(--g-yellow-700)',
                }}
              >
                {syncMeta.apiConfigured ? `Ready (${syncMeta.maskedKey})` : 'Awaiting Key'}
              </strong>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>Free Monthly Credits</div>
              <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 15 }}>
                {syncMeta.creditsRemaining !== undefined
                  ? `${syncMeta.creditsRemaining} / ${syncMeta.creditsLimit ?? 250}`
                  : '250 / mo free'}
              </strong>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>Cached Property Details</div>
              <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 15 }}>
                {syncMeta.cachedDetailsCount} homes
              </strong>
            </div>
          </div>

          {/* API Key Setup / Update */}
          {showKeyForm ? (
            <form
              onSubmit={handleSaveKey}
              style={{
                padding: 18,
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line-strong)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 15, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <KeyRound size={16} color="var(--accent)" />
                  Connect Your Free RealtyAPI Key
                </strong>
                <a
                  href="https://www.realtyapi.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 13,
                    color: 'var(--accent)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span>Get free key at realtyapi.io (no card)</span>
                  <ExternalLink size={13} />
                </a>
              </div>
              <p style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                Stored strictly server-side in gitignored <code>.env.local</code>—never bundled into
                browser code.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="password"
                  required
                  className="input"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="Paste x-realtyapi-key..."
                  style={{ flex: 1, fontFamily: 'var(--font-mono)' }}
                />
                <button type="submit" className="icon-btn icon-btn--primary" disabled={savingKey}>
                  {savingKey ? 'Saving...' : 'Save Key'}
                </button>
                {editingKey && (
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setEditingKey(false)}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-2)' }}>
                <ShieldCheck size={16} color="var(--g-green-600)" />
                <span>
                  Using official US Census Bellport Village boundary (GEOID <code>3605771</code>) for
                  Ho-Hum ferry verification.
                </span>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setEditingKey(true)}
                style={{ fontSize: 12 }}
              >
                Change API Key
              </button>
            </div>
          )}

          {/* Sync Trigger */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
              paddingTop: 12,
              borderTop: '1px solid var(--line)',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              {syncMeta.lastSyncAt
                ? `Last synced: ${new Date(syncMeta.lastSyncAt).toLocaleString()}`
                : 'Not synced yet — currently showing sample Bellport seed listings.'}
            </div>

            <button
              id="btn-trigger-sync"
              type="button"
              className="icon-btn icon-btn--primary"
              disabled={!syncMeta.apiConfigured || syncing}
              onClick={handleRunSync}
              style={{ opacity: !syncMeta.apiConfigured || syncing ? 0.55 : 1 }}
            >
              <RefreshCw size={15} />
              <span>{syncing ? 'Syncing Bellport Listings...' : 'Sync Bellport Now'}</span>
            </button>
          </div>

          {(statusMsg || syncMeta.lastSyncSummary) && !errorMsg && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--g-green-50)',
                color: 'var(--g-green-600)',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <CheckCircle2 size={16} />
              <span>{statusMsg ?? syncMeta.lastSyncSummary}</span>
            </div>
          )}

          {errorMsg && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--g-red-50)',
                color: 'var(--g-red-600)',
                fontSize: 13,
              }}
            >
              {errorMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
