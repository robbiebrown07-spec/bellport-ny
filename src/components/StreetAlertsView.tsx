import React, { useState } from 'react';
import { Bell, BellRing, Plus, Trash2 } from 'lucide-react';
import type { Listing, StreetAlertRule } from '../types';
import { evaluateStreetAlerts } from '../lib/intelligence';

interface StreetAlertsViewProps {
  rules: StreetAlertRule[];
  listings: Listing[];
  onAddRule: (rule: StreetAlertRule) => void;
  onToggleRule: (id: string) => void;
  onDeleteRule: (id: string) => void;
  onOpenListing: (id: string) => void;
}

const BELLPORT_STREETS = [
  'Bellport Lane',
  'Browns Lane',
  'Otis Lane',
  'Academy Lane',
  'Thornhedge Road',
  'Shore Road',
  'South Howells Point',
  'North Howells Point',
  'Country Club Road',
  'Mooring Drive',
  'South Country Road',
  'Bell Street',
  'Circuit Road',
  'Peat Hole Lane',
  'Bieselin Road',
  'Station Road',
];

export const StreetAlertsView: React.FC<StreetAlertsViewProps> = ({
  rules,
  listings,
  onAddRule,
  onToggleRule,
  onDeleteRule,
  onOpenListing,
}) => {
  const [street, setStreet] = useState('Otis Lane');
  const [maxPriceStr, setMaxPriceStr] = useState('');
  const [minBedsStr, setMinBedsStr] = useState('3');
  const [keyword, setKeyword] = useState('');
  const [notifyOnPriceDrop, setNotifyOnPriceDrop] = useState(true);

  const triggered = evaluateStreetAlerts(rules, listings);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!street.trim()) return;
    const rule: StreetAlertRule = {
      id: `alert-${Date.now().toString(36)}`,
      street: street.trim(),
      maxPrice: maxPriceStr ? Number(maxPriceStr.replace(/[^0-9]/g, '')) || null : null,
      minBeds: minBedsStr ? Number(minBedsStr) || null : null,
      mustHaveKeyword: keyword.trim(),
      notifyOnPriceDrop,
      enabled: true,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    onAddRule(rule);
    setKeyword('');
    setMaxPriceStr('');
  };

  return (
    <section className="results-band" aria-label="Street-specific listing alerts">
      <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        {/* Create Street Alert Form */}
        <form
          onSubmit={handleCreate}
          style={{
            padding: 24,
            borderRadius: 'var(--radius)',
            background: 'var(--surface-subtle)',
            border: '1px solid var(--line)',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div>
            <span className="eyebrow">Hyper-Local Watchlist</span>
            <h2 style={{ fontSize: 24, marginBottom: 4 }}>
              Create Street-Specific Bellport Alerts
            </h2>
            <p style={{ fontSize: 14, color: 'var(--ink-2)' }}>
              Pinpoint exact lanes you care about—every sync checks new listings, whisper additions,
              and price reductions against these street rules.
            </p>
          </div>

          {/* Quick-pick Bellport Village lanes */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {BELLPORT_STREETS.map((s) => (
              <button
                key={s}
                type="button"
                className={`kw-chip ${street.toLowerCase() === s.toLowerCase() ? 'is-active' : ''}`}
                onClick={() => setStreet(s)}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="filter-controls" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div className="filter-field">
              <label className="filter-field__label">Street / Lane Name</label>
              <input
                required
                className="input"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="e.g. Bellport Lane"
              />
            </div>

            <div className="filter-field">
              <label className="filter-field__label">Max Price (optional)</label>
              <input
                className="input"
                value={maxPriceStr}
                onChange={(e) => setMaxPriceStr(e.target.value)}
                placeholder="e.g. 2500000"
              />
            </div>

            <div className="filter-field">
              <label className="filter-field__label">Min Bedrooms</label>
              <select
                className="filter-field__select"
                value={minBedsStr}
                onChange={(e) => setMinBedsStr(e.target.value)}
              >
                <option value="">Any Beds</option>
                <option value="3">3+ Beds</option>
                <option value="4">4+ Beds</option>
                <option value="5">5+ Beds</option>
              </select>
            </div>

            <div className="filter-field">
              <label className="filter-field__label">Must-Have Keyword (optional)</label>
              <input
                className="input"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g. pool, cottage"
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={notifyOnPriceDrop}
                onChange={(e) => setNotifyOnPriceDrop(e.target.checked)}
              />
              <span>Flag whenever an active house on this street cuts its asking price</span>
            </label>

            <button type="submit" className="icon-btn icon-btn--primary">
              <Plus size={15} />
              <span>Add Street Alert</span>
            </button>
          </div>
        </form>

        {/* Active Rules & Triggered Matches */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 style={{ fontSize: 22 }}>Watched Streets & Live Matches ({rules.length})</h2>

          {rules.map((rule) => {
            const evalEntry = triggered.find((t) => t.rule.id === rule.id);
            const matches = evalEntry?.matches ?? [];

            return (
              <div
                key={rule.id}
                style={{
                  padding: 20,
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--line)',
                  background: 'var(--surface)',
                  opacity: rule.enabled ? 1 : 0.6,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {matches.length > 0 ? (
                      <BellRing size={18} color="var(--g-green-600)" />
                    ) : (
                      <Bell size={18} color="var(--ink-muted)" />
                    )}
                    <strong style={{ fontSize: 18 }}>{rule.street}</strong>
                    {rule.maxPrice && (
                      <span className="tag-pill priv-val">
                        Under ${(rule.maxPrice / 1_000_000).toFixed(2)}M
                      </span>
                    )}
                    {rule.minBeds && <span className="tag-pill">{rule.minBeds}+ Beds</span>}
                    {rule.mustHaveKeyword && (
                      <span className="tag-pill">Keyword: &ldquo;{rule.mustHaveKeyword}&rdquo;</span>
                    )}
                    <span
                      className={`badge ${matches.length > 0 ? 'badge--village' : ''}`}
                    >
                      {matches.length} {matches.length === 1 ? 'match' : 'matches'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => onToggleRule(rule.id)}
                      style={{ fontSize: 12 }}
                    >
                      {rule.enabled ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => onDeleteRule(rule.id)}
                      aria-label={`Delete street alert for ${rule.street}`}
                      style={{ color: 'var(--g-red-600)' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {matches.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {matches.map(({ listing, hasPriceCut, dropAmount }) => (
                      <div
                        key={listing.id}
                        onClick={() => onOpenListing(listing.id)}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--surface-subtle)',
                          border: '1px solid var(--line)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          gap: 12,
                          flexWrap: 'wrap',
                        }}
                      >
                        <div>
                          <strong>{listing.address}</strong>
                          <span style={{ fontSize: 13, color: 'var(--ink-2)', marginLeft: 8 }}>
                            {listing.beds} bd · {listing.baths} ba · {listing.sqft.toLocaleString()}{' '}
                            sq ft · {listing.marketStatus}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {hasPriceCut && rule.notifyOnPriceDrop && (
                            <span className="badge badge--village priv-val">
                              Price Cut ↓ ${Math.round(dropAmount / 1000)}k
                            </span>
                          )}
                          <strong
                            className="priv-val"
                            style={{ fontFamily: 'var(--font-mono)', fontSize: 15 }}
                          >
                            ${listing.price.toLocaleString()}
                          </strong>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
