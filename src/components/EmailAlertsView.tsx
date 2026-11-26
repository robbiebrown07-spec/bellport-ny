import React, { useMemo, useState } from 'react';
import { BellRing, Check, Eye, Mail, Plus, Send, Sparkles, Trash2 } from 'lucide-react';
import type {
  AlertPoolMode,
  EmailAlertFrequency,
  EmailAlertRule,
  Listing,
} from '../types';
import {
  BEAUTIFUL_STREET_OPTIONS,
  DESIGN_FEATURE_LABELS,
  DESIGN_FEATURE_OPTIONS,
  fmtShortDollar,
  homeMatchesUnifiedFilters,
  INITIAL_UNIFIED_FILTERS,
  parseFlexibleNumber,
  type UnifiedFilters,
  type UnifiedHome,
} from '../lib/unifiedCatalog';
import { getPriceChangeStats } from '../lib/intelligence';

interface EmailAlertsViewProps {
  rules: EmailAlertRule[];
  catalog: UnifiedHome[];
  activeUnifiedFilters: UnifiedFilters;
  onAddRule: (rule: EmailAlertRule) => void;
  onToggleRule: (id: string) => void;
  onDeleteRule: (id: string) => void;
  onOpenListing: (parcelId: string) => void;
}

const FREQUENCY_LABELS: Record<EmailAlertFrequency, { label: string; desc: string }> = {
  immediately: {
    label: 'Immediately',
    desc: 'Instant alert as soon as a matching Bellport Village home hits the market',
  },
  daily: {
    label: 'Daily',
    desc: '8:00 AM ET daily summary of new matching listings & price reductions',
  },
  weekly: {
    label: 'Weekly',
    desc: 'Friday morning weekend-house digest before Bellport open houses',
  },
};

function ruleToUnifiedFilters(rule: EmailAlertRule): UnifiedFilters {
  const feats = [...rule.feats];
  if (rule.poolMode === 'pool_only') feats.push('pool');
  else if (rule.poolMode === 'room_only') feats.push('space_pool');
  else if (rule.poolMode === 'pool_or_room') feats.push('pool', 'space_pool');

  return {
    ...INITIAL_UNIFIED_FILTERS,
    forSale: true,
    minPrice: rule.minPrice,
    maxPrice: rule.maxPrice,
    minBeds: rule.minBeds,
    minBaths: rule.minBaths,
    minSqft: rule.minSqft,
    minLot: rule.minLotAcres,
    belowSC: rule.belowSC,
    beautifulStreetsOnly: rule.beautifulStreetsOnly || rule.selectedStreets.length > 0,
    beautifulStreets: rule.selectedStreets,
    feats,
    nlQuery: rule.naturalQuery,
  };
}

export const EmailAlertsView: React.FC<EmailAlertsViewProps> = ({
  rules,
  catalog,
  activeUnifiedFilters,
  onAddRule,
  onToggleRule,
  onDeleteRule,
  onOpenListing,
}) => {
  const [name, setName] = useState('Bellport Family Vacation House Alert');
  const [email, setEmail] = useState('robbiebrown07@gmail.com');
  const [frequency, setFrequency] = useState<EmailAlertFrequency>('immediately');
  const [minPriceStr, setMinPriceStr] = useState('');
  const [maxPriceStr, setMaxPriceStr] = useState('2.5m');
  const [minBedsStr, setMinBedsStr] = useState('3');
  const [minBathsStr, setMinBathsStr] = useState('2');
  const [minLotStr, setMinLotStr] = useState('');
  const [belowSC, setBelowSC] = useState(true);
  const [beautifulStreetsOnly, setBeautifulStreetsOnly] = useState(false);
  const [selectedStreets, setSelectedStreets] = useState<string[]>([
    'bellport-lane',
    'browns-lane',
    'bell-hulse-pocket',
    'livingston-rogers',
  ]);
  const [poolMode, setPoolMode] = useState<AlertPoolMode>('pool_or_room');
  const [feats, setFeats] = useState<string[]>([]);
  const [naturalQuery, setNaturalQuery] = useState('');
  const [notifyOnPriceDrop, setNotifyOnPriceDrop] = useState(true);

  const [previewRuleId, setPreviewRuleId] = useState<string | null>(null);
  const [dispatchStatus, setDispatchStatus] = useState<Record<string, string>>({});

  const importFromActiveFilters = () => {
    setMinPriceStr(activeUnifiedFilters.minPrice ? String(activeUnifiedFilters.minPrice) : '');
    setMaxPriceStr(activeUnifiedFilters.maxPrice ? String(activeUnifiedFilters.maxPrice) : '');
    setMinBedsStr(activeUnifiedFilters.minBeds ? String(activeUnifiedFilters.minBeds) : '');
    setMinBathsStr(activeUnifiedFilters.minBaths ? String(activeUnifiedFilters.minBaths) : '');
    setMinLotStr(activeUnifiedFilters.minLot ? String(activeUnifiedFilters.minLot) : '');
    setBelowSC(activeUnifiedFilters.belowSC);
    setBeautifulStreetsOnly(activeUnifiedFilters.beautifulStreetsOnly);
    setSelectedStreets(activeUnifiedFilters.beautifulStreets);
    const hasP = activeUnifiedFilters.feats.includes('pool');
    const hasS = activeUnifiedFilters.feats.includes('space_pool');
    setPoolMode(
      hasP && hasS ? 'pool_or_room' : hasP ? 'pool_only' : hasS ? 'room_only' : 'any'
    );
    setFeats(activeUnifiedFilters.feats.filter((f) => f !== 'pool' && f !== 'space_pool'));
    setNaturalQuery(activeUnifiedFilters.nlQuery || activeUnifiedFilters.q);
  };

  const toggleStreet = (id: string) => {
    setSelectedStreets((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleFeat = (fk: string) => {
    setFeats((prev) => (prev.includes(fk) ? prev.filter((x) => x !== fk) : [...prev, fk]));
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    const newRule: EmailAlertRule = {
      id: `email-alert-${Date.now().toString(36)}`,
      name: name.trim() || 'Bellport Listing Alert',
      email: email.trim(),
      frequency,
      minPrice: parseFlexibleNumber(minPriceStr),
      maxPrice: parseFlexibleNumber(maxPriceStr),
      minBeds: minBedsStr ? Number(minBedsStr) : null,
      minBaths: minBathsStr ? Number(minBathsStr) : null,
      minSqft: null,
      minLotAcres: minLotStr ? Number(minLotStr) : null,
      belowSC,
      beautifulStreetsOnly,
      selectedStreets,
      poolMode,
      feats,
      naturalQuery: naturalQuery.trim(),
      notifyOnPriceDrop,
      enabled: true,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    onAddRule(newRule);
  };

  const evaluatedRules = useMemo(() => {
    return rules.map((rule) => {
      const uf = ruleToUnifiedFilters(rule);
      const matches = catalog.filter((h) => h.isForSale && homeMatchesUnifiedFilters(h, uf, false));
      return { rule, matches };
    });
  }, [catalog, rules]);

  const handleDraftOrSendDigest = async (rule: EmailAlertRule, matches: UnifiedHome[]) => {
    const subject = `[Bellport, NY] ${matches.length} Matching Listing${matches.length === 1 ? '' : 's'} — ${rule.name}`;
    const lines = [
      `Bellport, NY — Robbie’s search for a family vacation house`,
      `Alert: ${rule.name} (${FREQUENCY_LABELS[rule.frequency].label} delivery to ${rule.email})`,
      ``,
      matches.length === 0
        ? `No active listings currently match all criteria — watching for new arrivals.`
        : `Matching Bellport Village Homes For Sale (${matches.length}):`,
      ...matches.map(
        (m) =>
          `• ${m.address} — $${m.price.toLocaleString()} | ${m.beds} bd · ${m.baths} ba · ${m.sqft.toLocaleString()} ft² · ${m.lotAcres} ac (${m.style})`
      ),
    ];
    const bodyText = lines.join('\n');

    setDispatchStatus((s) => ({ ...s, [rule.id]: 'Creating Gmail draft…' }));
    try {
      const res = await fetch('/api/alerts/draft-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: rule.email,
          subject,
          body: bodyText,
        }),
      });
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const data = (await res.json()) as { ok?: boolean; message?: string };
        if (data.ok) {
          setDispatchStatus((s) => ({
            ...s,
            [rule.id]: data.message ?? `Saved draft for ${rule.email} in Gmail!`,
          }));
          return;
        }
      }
    } catch {
      // Static mode fallback -> open pre-filled Gmail compose window
    }

    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
      rule.email
    )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
    window.open(gmailUrl, '_blank', 'noopener,noreferrer');
    setDispatchStatus((s) => ({
      ...s,
      [rule.id]: `Opened pre-filled Gmail digest for ${rule.email}`,
    }));
  };

  return (
    <section className="results-band" aria-label="Email listing alerts">
      <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {/* Create Email Notification Rule */}
        <form
          onSubmit={handleCreate}
          style={{
            padding: 24,
            borderRadius: 'var(--radius)',
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <span className="eyebrow">Email Listing Notifications</span>
              <h2 style={{ fontSize: 24, marginBottom: 4 }}>
                Email Alerts for New Bellport, NY Listings
              </h2>
              <p style={{ fontSize: 13.5, color: 'var(--ink-2)', maxWidth: '64ch' }}>
                Receive email notifications at <strong>robbiebrown07@gmail.com</strong> whenever a
                new Incorporated Bellport Village listing or price reduction matches your family
                vacation house criteria.
              </p>
            </div>

            <button
              type="button"
              className="icon-btn"
              onClick={importFromActiveFilters}
              title="Copy your active Map & Natural Language filters into this alert"
            >
              <Sparkles size={14} color="var(--accent)" />
              <span>Import Current Map Filters</span>
            </button>
          </div>

          {/* Recipient Email + Alert Name + Delivery Frequency */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 14,
            }}
          >
            <div className="filter-field">
              <label className="filter-field__label">Recipient Email</label>
              <input
                type="email"
                required
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="robbiebrown07@gmail.com"
              />
            </div>

            <div className="filter-field">
              <label className="filter-field__label">Alert Name</label>
              <input
                required
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Historic Lanes Shingled 4BR"
              />
            </div>

            <div className="filter-field">
              <label className="filter-field__label">Delivery Frequency</label>
              <div className="segmented-tabs" role="group" aria-label="Email delivery frequency">
                {(['immediately', 'daily', 'weekly'] as const).map((freq) => (
                  <button
                    key={freq}
                    type="button"
                    className={`segmented-tabs__tab ${frequency === freq ? 'is-active' : ''}`}
                    style={{ flex: 1, justifyContent: 'center' }}
                    onClick={() => setFrequency(freq)}
                  >
                    {FREQUENCY_LABELS[freq].label}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: 11, color: 'var(--ink-2)', marginTop: 4 }}>
                {FREQUENCY_LABELS[frequency].desc}
              </span>
            </div>
          </div>

          {/* Price, Size & Pool Criteria */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 12,
            }}
          >
            <div className="filter-field">
              <label className="filter-field__label">Min Price</label>
              <input
                className="input"
                value={minPriceStr}
                onChange={(e) => setMinPriceStr(e.target.value)}
                placeholder="No min (e.g. 900k)"
              />
            </div>

            <div className="filter-field">
              <label className="filter-field__label">Max Price</label>
              <input
                className="input"
                value={maxPriceStr}
                onChange={(e) => setMaxPriceStr(e.target.value)}
                placeholder="e.g. 2.5m"
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
              <label className="filter-field__label">Min Bathrooms</label>
              <select
                className="filter-field__select"
                value={minBathsStr}
                onChange={(e) => setMinBathsStr(e.target.value)}
              >
                <option value="">Any Baths</option>
                <option value="2">2+ Baths</option>
                <option value="2.5">2.5+ Baths</option>
                <option value="3">3+ Baths</option>
              </select>
            </div>

            <div className="filter-field">
              <label className="filter-field__label">Min Lot (Acres)</label>
              <input
                type="number"
                step="0.05"
                className="input"
                value={minLotStr}
                onChange={(e) => setMinLotStr(e.target.value)}
                placeholder="Any (e.g. 0.35)"
              />
            </div>

            <div className="filter-field">
              <label className="filter-field__label">Pool Requirement</label>
              <select
                className="filter-field__select"
                value={poolMode}
                onChange={(e) => setPoolMode(e.target.value as AlertPoolMode)}
              >
                <option value="any">Any / No Filter</option>
                <option value="pool_or_room">Current Pool OR Room for Pool</option>
                <option value="pool_only">Current Pool Only</option>
                <option value="room_only">Room for Pool Only</option>
              </select>
            </div>
          </div>

          {/* Location & Favorite Beautiful Streets */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label className="filter-field__label">
              Preferred Streets & Sections (Optional — leave unselected for any Village street)
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button
                type="button"
                className={`kw-chip ${belowSC ? 'is-active' : ''}`}
                onClick={() => setBelowSC((v) => !v)}
              >
                Below South Country Rd {belowSC ? '✓' : ''}
              </button>
              <button
                type="button"
                className={`kw-chip ${beautifulStreetsOnly && selectedStreets.length === 0 ? 'is-active' : ''}`}
                onClick={() => {
                  setBeautifulStreetsOnly((v) => !v);
                  setSelectedStreets([]);
                }}
              >
                All 8 Beautiful Streets
              </button>
              {BEAUTIFUL_STREET_OPTIONS.map((st) => {
                const active = selectedStreets.includes(st.id);
                return (
                  <button
                    key={st.id}
                    type="button"
                    className={`kw-chip ${active ? 'is-active' : ''}`}
                    onClick={() => toggleStreet(st.id)}
                  >
                    {st.label} {active ? '✓' : ''}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Design Elements + Natural Language Description */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label className="filter-field__label">Design & Architectural Must-Haves</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {DESIGN_FEATURE_OPTIONS.filter(
                (f) => f.value !== 'pool' && f.value !== 'space_pool'
              ).map((f) => {
                const on = feats.includes(f.value);
                return (
                  <button
                    key={f.value}
                    type="button"
                    className={`kw-chip ${on ? 'is-active' : ''}`}
                    onClick={() => toggleFeat(f.value)}
                  >
                    {DESIGN_FEATURE_LABELS[f.value] ?? f.label} {on ? '✓' : ''}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="filter-field">
            <label className="filter-field__label">
              Natural Language Criteria (Optional — describe extra details in plain English)
            </label>
            <input
              className="input"
              value={naturalQuery}
              onChange={(e) => setNaturalQuery(e.target.value)}
              placeholder='e.g. "shingled pre-war Colonial near the marina with fireplace or guest studio"'
            />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              paddingTop: 4,
            }}
          >
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={notifyOnPriceDrop}
                onChange={(e) => setNotifyOnPriceDrop(e.target.checked)}
              />
              <span>Also email me when a matching active listing reduces its asking price</span>
            </label>

            <button type="submit" className="icon-btn icon-btn--primary">
              <Plus size={15} />
              <span>Save Email Alert</span>
            </button>
          </div>
        </form>

        {/* Active Email Alert Subscriptions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 style={{ fontSize: 21 }}>Saved Email Alert Rules ({rules.length})</h2>

          {evaluatedRules.map(({ rule, matches }) => {
            const isPreviewOpen = previewRuleId === rule.id;
            return (
              <div
                key={rule.id}
                style={{
                  padding: 20,
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--line)',
                  background: 'var(--surface)',
                  opacity: rule.enabled ? 1 : 0.62,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <BellRing size={17} color="var(--accent)" />
                      <strong style={{ fontSize: 17 }}>{rule.name}</strong>
                      <span
                        className="badge"
                        style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                      >
                        {FREQUENCY_LABELS[rule.frequency].label}
                      </span>
                      <span className="badge">
                        <Mail size={11} style={{ marginRight: 4 }} />
                        {rule.email}
                      </span>
                      <span className={`badge ${matches.length > 0 ? 'badge--village' : ''}`}>
                        {matches.length} current {matches.length === 1 ? 'match' : 'matches'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {rule.minPrice && (
                        <span className="tag-pill priv-val">
                          Min {fmtShortDollar(rule.minPrice)}
                        </span>
                      )}
                      {rule.maxPrice && (
                        <span className="tag-pill priv-val">
                          Max {fmtShortDollar(rule.maxPrice)}
                        </span>
                      )}
                      {rule.minBeds && <span className="tag-pill">{rule.minBeds}+ Beds</span>}
                      {rule.minBaths && <span className="tag-pill">{rule.minBaths}+ Baths</span>}
                      {rule.minLotAcres && (
                        <span className="tag-pill">{rule.minLotAcres}+ Acres</span>
                      )}
                      {rule.belowSC && <span className="tag-pill">Below S. Country Rd</span>}
                      {rule.poolMode === 'pool_or_room' && (
                        <span className="tag-pill">Pool or Room for Pool</span>
                      )}
                      {rule.poolMode === 'pool_only' && (
                        <span className="tag-pill">Current Pool Only</span>
                      )}
                      {rule.poolMode === 'room_only' && (
                        <span className="tag-pill">Room for Pool</span>
                      )}
                      {rule.selectedStreets.map((sid) => (
                        <span key={sid} className="tag-pill">
                          {BEAUTIFUL_STREET_OPTIONS.find((s) => s.id === sid)?.label ?? sid}
                        </span>
                      ))}
                      {rule.feats.map((fk) => (
                        <span key={fk} className="tag-pill">
                          {DESIGN_FEATURE_LABELS[fk] ?? fk}
                        </span>
                      ))}
                      {rule.naturalQuery && (
                        <span className="tag-pill">“{rule.naturalQuery}”</span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="icon-btn"
                      style={{ fontSize: 12 }}
                      onClick={() =>
                        setPreviewRuleId((cur) => (cur === rule.id ? null : rule.id))
                      }
                    >
                      <Eye size={14} />
                      <span>{isPreviewOpen ? 'Hide Preview' : 'Preview Email'}</span>
                    </button>
                    <button
                      type="button"
                      className="icon-btn icon-btn--primary"
                      style={{ fontSize: 12 }}
                      onClick={() => void handleDraftOrSendDigest(rule, matches)}
                    >
                      <Send size={13} />
                      <span>Draft / Send Now</span>
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      style={{ fontSize: 12 }}
                      onClick={() => onToggleRule(rule.id)}
                    >
                      {rule.enabled ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      style={{ color: 'var(--g-red-600)' }}
                      onClick={() => onDeleteRule(rule.id)}
                      aria-label={`Delete alert ${rule.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {dispatchStatus[rule.id] && (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--g-green-600)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Check size={14} />
                    <span>{dispatchStatus[rule.id]}</span>
                  </div>
                )}

                {isPreviewOpen && (
                  <div
                    style={{
                      padding: 16,
                      borderRadius: 12,
                      background: 'var(--surface-subtle)',
                      border: '1px solid var(--line)',
                      fontSize: 12.5,
                      lineHeight: 1.55,
                    }}
                  >
                    <div style={{ color: 'var(--ink-2)', marginBottom: 8 }}>
                      <div>
                        <strong>To:</strong> {rule.email}
                      </div>
                      <div>
                        <strong>Cadence:</strong> {FREQUENCY_LABELS[rule.frequency].label} (
                        {FREQUENCY_LABELS[rule.frequency].desc})
                      </div>
                      <div>
                        <strong>Subject:</strong> [Bellport, NY] {matches.length} Matching Listing
                        {matches.length === 1 ? '' : 's'} — {rule.name}
                      </div>
                    </div>
                    <div style={{ height: 1, background: 'var(--line)', margin: '8px 0' }} />
                    <p style={{ margin: '0 0 8px' }}>
                      Here {matches.length === 1 ? 'is' : 'are'} the Incorporated Bellport Village
                      home{matches.length === 1 ? '' : 's'} currently matching{' '}
                      <strong>{rule.name}</strong>:
                    </p>
                    {matches.length === 0 ? (
                      <p style={{ color: 'var(--ink-2)', margin: 0 }}>
                        No active listings match right now — you will receive an email{' '}
                        {rule.frequency} as soon as one is listed.
                      </p>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {matches.map((m) => (
                          <li key={m.parcelId}>
                            <strong>{m.address}</strong> — ${m.price.toLocaleString()} ({m.beds} bd
                            · {m.baths} ba · {m.sqft.toLocaleString()} ft² · {m.lotAcres} ac ·{' '}
                            {m.style})
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {matches.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {matches.map((m) => {
                      const priceStats = m.listingRef
                        ? getPriceChangeStats(m.listingRef as Listing)
                        : null;
                      return (
                        <div
                          key={m.parcelId}
                          onClick={() => onOpenListing(m.parcelId)}
                          style={{
                            padding: '10px 14px',
                            borderRadius: 12,
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {m.photoUrl && (
                              <img
                                src={m.photoUrl}
                                alt={m.address}
                                style={{
                                  width: 52,
                                  height: 36,
                                  objectFit: 'cover',
                                  borderRadius: 6,
                                }}
                              />
                            )}
                            <div>
                              <strong>{m.address}</strong>
                              <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                                {m.beds} bd · {m.baths} ba · {m.sqft.toLocaleString()} ft² ·{' '}
                                {m.lotAcres} ac · {m.style}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {priceStats &&
                              priceStats.totalDropDollar > 0 &&
                              rule.notifyOnPriceDrop && (
                                <span className="badge badge--village priv-val">
                                  Price Cut ↓ ${Math.round(priceStats.totalDropDollar / 1000)}k
                                </span>
                              )}
                            <strong
                              className="priv-val"
                              style={{ fontFamily: 'var(--font-mono)', fontSize: 15 }}
                            >
                              ${m.price.toLocaleString()}
                            </strong>
                          </div>
                        </div>
                      );
                    })}
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
