import React, { useEffect, useMemo, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { median } from 'd3-array';
import { RotateCcw } from 'lucide-react';
import type { HistoricalSaleRecord } from '../types';
import { fmtShortDollar, MECE_VILLAGE_AREAS, parseFlexibleNumber } from '../lib/unifiedCatalog';

interface SalesOverTimeModuleProps {
  privacyBlur: boolean;
  onSelectParcel?: (parcelId: string) => void;
}

function dateToYearFloat(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return (y || 2024) + ((m || 6) - 1) / 12 + (d || 15) / 365;
}

export const SalesOverTimeModule: React.FC<SalesOverTimeModuleProps> = ({
  privacyBlur,
  onSelectParcel,
}) => {
  const [sales, setSales] = useState<HistoricalSaleRecord[]>([]);
  const [metric, setMetric] = useState<'price' | 'ppsf'>('price');
  const [belowSC, setBelowSC] = useState(false);
  const [area, setArea] = useState('');
  const [minPrice, setMinPrice] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [minSqft, setMinSqft] = useState<number | null>(null);
  const [minLot, setMinLot] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/data/bellport-sales-history.json')
      .then((r) => r.json() as Promise<HistoricalSaleRecord[]>)
      .then((data) => {
        if (active) setSales(data);
      })
      .catch((err) => console.error('Failed to load sales history:', err));
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    return sales.filter((s) => {
      if (metric === 'ppsf' && (!s.ppsf || s.ppsf <= 0)) return false;
      if (belowSC && !s.belowSC) return false;
      if (area && s.area !== area) return false;
      if (minPrice !== null && s.price < minPrice) return false;
      if (maxPrice !== null && s.price > maxPrice) return false;
      if (minSqft !== null && (s.sqft ?? 1800) < minSqft) return false;
      if (minLot !== null && (s.acres ?? 0.3) < minLot) return false;
      return true;
    });
  }, [sales, metric, belowSC, area, minPrice, maxPrice, minSqft, minLot]);

  const yearlyMedians = useMemo(() => {
    const byYr = new Map<number, number[]>();
    for (const s of filtered) {
      const y = Number(s.date.slice(0, 4));
      const val = metric === 'ppsf' ? (s.ppsf ?? 0) : s.price;
      if (!val) continue;
      const arr = byYr.get(y) ?? [];
      arr.push(val);
      byYr.set(y, arr);
    }
    return Array.from(byYr.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([year, vals]) => ({
        year,
        x: year + 0.5,
        medianVal: Math.round(median(vals) ?? 0),
        count: vals.length,
      }));
  }, [filtered, metric]);

  const hasFilters =
    belowSC || area !== '' || minPrice !== null || maxPrice !== null || minSqft !== null || minLot !== null;

  const resetFilters = () => {
    setBelowSC(false);
    setArea('');
    setMinPrice(null);
    setMaxPrice(null);
    setMinSqft(null);
    setMinLot(null);
  };

  const latestMedian = yearlyMedians[yearlyMedians.length - 1]?.medianVal ?? 0;
  const earliestMedian = yearlyMedians[0]?.medianVal ?? 0;
  const changePct =
    earliestMedian > 0 && yearlyMedians.length >= 2
      ? Math.round(((latestMedian - earliestMedian) / earliestMedian) * 100)
      : null;

  const W = 940;
  const H = 300;
  const m = { top: 20, right: 26, bottom: 36, left: 68 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  const yValues = filtered.map((s) => (metric === 'ppsf' ? (s.ppsf ?? 0) : s.price));
  const maxVal = yValues.length ? Math.max(...yValues) : metric === 'ppsf' ? 1200 : 4_000_000;

  const xScale = scaleLinear().domain([2017, 2027]).range([0, iw]);
  const yScale = scaleLinear().domain([0, maxVal * 1.1]).range([ih, 0]).nice();

  const xYears = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
  const yTicks = yScale.ticks(5);
  const hoveredSale = filtered.find((s) => s.id === hoveredId) ?? null;

  const linePath = yearlyMedians
    .map((pt, i) => `${i === 0 ? 'M' : 'L'}${xScale(pt.x).toFixed(1)},${yScale(pt.medianVal).toFixed(1)}`)
    .join(' ');

  const pillInputStyle: React.CSSProperties = {
    height: 32,
    width: 92,
    padding: '0 10px',
    borderRadius: 999,
    border: '1px solid var(--line)',
    background: 'var(--bg)',
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
  };

  return (
    <div
      style={{
        padding: 22,
        borderRadius: 'var(--radius)',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={{ fontSize: 22, margin: 0 }}>Home Prices Over Time</h2>
          <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: '2px 0 0' }}>
            {filtered.length} closed Bellport Village sales (2017–2026)
            {latestMedian > 0 && (
              <span className="priv-val">
                {' '}
                · Latest median{' '}
                <strong style={{ color: 'var(--ink)' }}>
                  {metric === 'ppsf' ? `$${latestMedian}/ft²` : fmtShortDollar(latestMedian)}
                </strong>
              </span>
            )}
            {changePct !== null && (
              <span style={{ color: changePct >= 0 ? 'var(--g-green-600)' : 'var(--g-red-600)' }}>
                {' '}
                ({changePct >= 0 ? `+${changePct}%` : `${changePct}%`})
              </span>
            )}
          </p>
        </div>

        <div className="segmented-tabs" role="group" aria-label="Price metric">
          <button
            type="button"
            className={`segmented-tabs__tab ${metric === 'price' ? 'is-active' : ''}`}
            style={{ fontSize: 12, padding: '5px 12px' }}
            onClick={() => setMetric('price')}
          >
            Sale Price ($)
          </button>
          <button
            type="button"
            className={`segmented-tabs__tab ${metric === 'ppsf' ? 'is-active' : ''}`}
            style={{ fontSize: 12, padding: '5px 12px' }}
            onClick={() => setMetric('ppsf')}
          >
            $/Sq Ft
          </button>
        </div>
      </div>

      {/* Compact Range & Area Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => setBelowSC((v) => !v)}
          style={{
            height: 32,
            padding: '0 12px',
            borderRadius: 999,
            border: belowSC ? '1px solid var(--accent)' : '1px solid var(--line)',
            background: belowSC ? 'var(--accent)' : 'var(--bg)',
            color: belowSC ? '#ffffff' : 'var(--ink)',
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          Below South Country Rd
        </button>

        <select
          value={area}
          onChange={(e) => setArea(e.target.value)}
          style={{ ...pillInputStyle, width: 'auto', fontFamily: 'var(--font-text)' }}
        >
          <option value="">All Village Areas</option>
          {MECE_VILLAGE_AREAS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Min $"
          onChange={(e) => setMinPrice(parseFlexibleNumber(e.target.value))}
          style={pillInputStyle}
        />
        <input
          type="text"
          placeholder="Max $"
          onChange={(e) => setMaxPrice(parseFlexibleNumber(e.target.value))}
          style={pillInputStyle}
        />
        <input
          type="text"
          placeholder="Min ft²"
          onChange={(e) => setMinSqft(parseFlexibleNumber(e.target.value))}
          style={pillInputStyle}
        />
        <input
          type="text"
          placeholder="Min ac"
          onChange={(e) => setMinLot(parseFlexibleNumber(e.target.value))}
          style={{ ...pillInputStyle, width: 78 }}
        />

        {hasFilters && (
          <button type="button" className="icon-btn" onClick={resetFilters} style={{ height: 32 }}>
            <RotateCcw size={13} />
            <span>Reset</span>
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: 28, textAlign: 'center', color: 'var(--ink-2)', fontSize: 13 }}>
          No closed Village sales match these filters.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{ width: '100%', minWidth: 540, height: 'auto', display: 'block' }}
            role="img"
            aria-label="Bellport Village closed home sales over time"
          >
            <g transform={`translate(${m.left},${m.top})`}>
              {yTicks.map((t) => (
                <g key={`yt-${t}`} transform={`translate(0,${yScale(t)})`}>
                  <line x1={0} x2={iw} stroke="var(--line)" strokeDasharray="3 3" />
                  <text
                    x={-10}
                    dy="0.32em"
                    textAnchor="end"
                    fontSize={11}
                    fontFamily="var(--font-mono)"
                    fill="var(--ink-2)"
                    className="priv-val"
                  >
                    {privacyBlur ? '•••' : metric === 'ppsf' ? `$${t}` : fmtShortDollar(t)}
                  </text>
                </g>
              ))}

              {xYears.map((yr) => (
                <g key={`xt-${yr}`} transform={`translate(${xScale(yr + 0.5)},${ih})`}>
                  <text
                    y={22}
                    textAnchor="middle"
                    fontSize={11}
                    fontFamily="var(--font-mono)"
                    fill="var(--ink-2)"
                  >
                    {yr}
                  </text>
                </g>
              ))}

              <line x1={0} x2={iw} y1={ih} y2={ih} stroke="var(--line-strong)" />

              {yearlyMedians.length >= 2 && (
                <path
                  d={linePath}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                />
              )}

              {filtered.map((s) => {
                const val = metric === 'ppsf' ? (s.ppsf ?? 0) : s.price;
                const cx = xScale(dateToYearFloat(s.date));
                const cy = yScale(val);
                const isHov = hoveredId === s.id;
                return (
                  <circle
                    key={s.id}
                    cx={cx}
                    cy={cy}
                    r={isHov ? 7 : 5}
                    fill="#4f9d69"
                    fillOpacity={0.88}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                    style={{ cursor: s.parcelId && onSelectParcel ? 'pointer' : 'default' }}
                    onMouseEnter={() => setHoveredId(s.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => {
                      if (s.parcelId && onSelectParcel) onSelectParcel(s.parcelId);
                    }}
                  />
                );
              })}

              {yearlyMedians.map((pt) => (
                <circle
                  key={`med-${pt.year}`}
                  cx={xScale(pt.x)}
                  cy={yScale(pt.medianVal)}
                  r={3.5}
                  fill="var(--accent)"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
              ))}
            </g>
          </svg>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
          fontSize: 12,
          color: 'var(--ink-2)',
          minHeight: 20,
        }}
      >
        {hoveredSale ? (
          <div>
            <strong style={{ color: 'var(--ink)' }}>{hoveredSale.address}</strong> ·{' '}
            {hoveredSale.date} ·{' '}
            <strong className="priv-val" style={{ color: 'var(--ink)' }}>
              ${hoveredSale.price.toLocaleString()}
            </strong>
            {hoveredSale.sqft ? ` · ${hoveredSale.sqft.toLocaleString()} ft²` : ''}
            {hoveredSale.acres ? ` · ${hoveredSale.acres} ac` : ''} · {hoveredSale.area}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{ width: 9, height: 9, borderRadius: '50%', background: '#4f9d69' }}
              />
              Closed Sale (click dot to locate on map)
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, height: 2.5, background: 'var(--accent)' }} />
              Annual Median
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
