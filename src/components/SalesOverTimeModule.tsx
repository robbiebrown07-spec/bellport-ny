import React, { useEffect, useMemo, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { median } from 'd3-array';
import { RotateCcw } from 'lucide-react';
import type { HistoricalSaleRecord } from '../types';
import {
  fmtShortDollar,
  MECE_VILLAGE_AREAS,
  parseFlexibleNumber,
  resolveAssetUrl,
} from '../lib/unifiedCatalog';

interface SalesOverTimeModuleProps {
  privacyBlur: boolean;
  onSelectParcel?: (parcelId: string) => void;
}

type TimeSpanOption = '5y' | '10y' | '20y' | 'all';

// S&P CoreLogic Case-Shiller U.S. National Home Price Index (CSUSHPINSA, annual avg, 2000 = 100)
const US_NATIONAL_HPI_BY_YEAR: Record<number, number> = {
  1993: 77.4,
  1994: 79.5,
  1995: 81.0,
  1996: 82.8,
  1997: 85.3,
  1998: 90.1,
  1999: 95.6,
  2000: 104.8,
  2001: 113.2,
  2002: 122.3,
  2003: 133.7,
  2004: 150.4,
  2005: 171.7,
  2006: 183.4,
  2007: 179.9,
  2008: 164.0,
  2009: 148.5,
  2010: 144.6,
  2011: 139.2,
  2012: 141.0,
  2013: 154.5,
  2014: 164.7,
  2015: 172.2,
  2016: 180.9,
  2017: 191.4,
  2018: 202.5,
  2019: 209.5,
  2020: 222.2,
  2021: 260.1,
  2022: 298.5,
  2023: 305.8,
  2024: 320.6,
  2025: 330.2,
  2026: 338.5,
};

function dateToYearFloat(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return (y || 2024) + ((m || 6) - 1) / 12 + (d || 15) / 365;
}

export const SalesOverTimeModule: React.FC<SalesOverTimeModuleProps> = ({
  privacyBlur: _privacyBlur,
  onSelectParcel,
}) => {
  const [sales, setSales] = useState<HistoricalSaleRecord[]>([]);
  const [metric, setMetric] = useState<'price' | 'ppsf'>('price');
  const [span, setSpan] = useState<TimeSpanOption>('all');
  const [belowSC, setBelowSC] = useState(false);
  const [area, setArea] = useState('');
  const [minPrice, setMinPrice] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [minSqft, setMinSqft] = useState<number | null>(null);
  const [minLot, setMinLot] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(resolveAssetUrl('/data/bellport-sales-history.json') ?? '/data/bellport-sales-history.json')
      .then((r) => r.json() as Promise<HistoricalSaleRecord[]>)
      .then((data) => {
        if (active) setSales(data);
      })
      .catch((err) => console.error('Failed to load sales history:', err));
    return () => {
      active = false;
    };
  }, []);

  const minAllowedYear = useMemo(() => {
    if (span === '5y') return 2021;
    if (span === '10y') return 2016;
    if (span === '20y') return 2006;
    return 1993;
  }, [span]);

  const filtered = useMemo(() => {
    return sales.filter((s) => {
      const yr = Number(s.date.slice(0, 4));
      if (yr < minAllowedYear) return false;
      if (metric === 'ppsf' && (!s.ppsf || s.ppsf <= 0)) return false;
      if (belowSC && !s.belowSC) return false;
      if (area && s.area !== area) return false;
      if (minPrice !== null && s.price < minPrice) return false;
      if (maxPrice !== null && s.price > maxPrice) return false;
      if (minSqft !== null && (s.sqft ?? 1800) < minSqft) return false;
      if (minLot !== null && (s.acres ?? 0.3) < minLot) return false;
      return true;
    });
  }, [sales, minAllowedYear, metric, belowSC, area, minPrice, maxPrice, minSqft, minLot]);

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
    belowSC ||
    area !== '' ||
    minPrice !== null ||
    maxPrice !== null ||
    minSqft !== null ||
    minLot !== null;

  const resetFilters = () => {
    setBelowSC(false);
    setArea('');
    setMinPrice(null);
    setMaxPrice(null);
    setMinSqft(null);
    setMinLot(null);
  };

  const firstEntry = yearlyMedians[0] ?? null;
  const lastEntry = yearlyMedians[yearlyMedians.length - 1] ?? null;
  const earliestYear = firstEntry?.year ?? minAllowedYear;
  const latestYear = lastEntry?.year ?? 2026;
  const latestMedian = lastEntry?.medianVal ?? 0;
  const earliestMedian = firstEntry?.medianVal ?? 0;

  const changePct =
    earliestMedian > 0 && yearlyMedians.length >= 2
      ? Math.round(((latestMedian - earliestMedian) / earliestMedian) * 100)
      : null;

  // Compute exact U.S. National Real Estate Average % change over the identical [earliestYear -> latestYear] window
  const usStartIdx = US_NATIONAL_HPI_BY_YEAR[earliestYear] ?? US_NATIONAL_HPI_BY_YEAR[1993];
  const usEndIdx = US_NATIONAL_HPI_BY_YEAR[latestYear] ?? US_NATIONAL_HPI_BY_YEAR[2026];
  const usNationalChangePct =
    usStartIdx > 0 && yearlyMedians.length >= 2
      ? Math.round(((usEndIdx - usStartIdx) / usStartIdx) * 100)
      : null;

  // Build U.S. National Average benchmark curve indexed to Bellport's starting median in earliestYear
  const nationalCurvePoints = useMemo(() => {
    if (!firstEntry || earliestMedian <= 0 || !usStartIdx) return [];
    const pts: Array<{ year: number; x: number; val: number }> = [];
    for (let y = earliestYear; y <= latestYear; y++) {
      const idx = US_NATIONAL_HPI_BY_YEAR[y];
      if (!idx) continue;
      pts.push({
        year: y,
        x: y + 0.5,
        val: Math.round(earliestMedian * (idx / usStartIdx)),
      });
    }
    return pts;
  }, [firstEntry, earliestMedian, earliestYear, latestYear, usStartIdx]);

  const W = 940;
  const H = 310;
  const m = { top: 20, right: 26, bottom: 38, left: 68 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  const domainStartYear = filtered.length > 0 ? Math.min(minAllowedYear, earliestYear) : minAllowedYear;
  const yValues = filtered.map((s) => (metric === 'ppsf' ? (s.ppsf ?? 0) : s.price));
  const natMax = nationalCurvePoints.length ? Math.max(...nationalCurvePoints.map((p) => p.val)) : 0;
  const maxVal = Math.max(
    yValues.length ? Math.max(...yValues) : metric === 'ppsf' ? 1200 : 4_000_000,
    natMax
  );

  const xScale = scaleLinear().domain([domainStartYear, 2027]).range([0, iw]);
  const yScale = scaleLinear().domain([0, maxVal * 1.1]).range([ih, 0]).nice();

  const yearSpan = 2026 - domainStartYear;
  const tickStep = yearSpan <= 10 ? 1 : yearSpan <= 20 ? 2 : 4;
  const xYears: number[] = [];
  for (let y = domainStartYear; y <= 2026; y += tickStep) {
    xYears.push(y);
  }
  if (xYears[xYears.length - 1] !== 2026) xYears.push(2026);

  const yTicks = yScale.ticks(5);
  const hoveredSale = filtered.find((s) => s.id === hoveredId) ?? null;

  const linePath = yearlyMedians
    .map((pt, i) => `${i === 0 ? 'M' : 'L'}${xScale(pt.x).toFixed(1)},${yScale(pt.medianVal).toFixed(1)}`)
    .join(' ');

  const nationalPath = nationalCurvePoints
    .map((pt, i) => `${i === 0 ? 'M' : 'L'}${xScale(pt.x).toFixed(1)},${yScale(pt.val).toFixed(1)}`)
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

  const uniqueHomesCount = useMemo(
    () => new Set(filtered.map((s) => s.parcelId ?? s.address)).size,
    [filtered]
  );

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
          alignItems: 'flex-start',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <span className="eyebrow" style={{ marginBottom: 4 }}>
            Market History · {domainStartYear}–2026
          </span>
          <h2 style={{ fontSize: 22, margin: 0 }}>Home Prices Over Time</h2>
          <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: '4px 0 0', lineHeight: 1.5 }}>
            {filtered.length} closed Bellport Village sales across {uniqueHomesCount} homes ({domainStartYear}–2026)
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
              <span>
                {' '}
                · Bellport{' '}
                <strong
                  style={{ color: changePct >= 0 ? 'var(--g-green-600)' : 'var(--g-red-600)' }}
                >
                  {changePct >= 0 ? `+${changePct}%` : `${changePct}%`}
                </strong>
                {usNationalChangePct !== null && (
                  <span style={{ color: 'var(--ink-2)' }}>
                    {' '}
                    vs.{' '}
                    <strong style={{ color: 'var(--ink)' }}>
                      {usNationalChangePct >= 0
                        ? `+${usNationalChangePct}%`
                        : `${usNationalChangePct}%`}{' '}
                      U.S. national real estate avg
                    </strong>{' '}
                    ({earliestYear}–{latestYear} Case-Shiller)
                  </span>
                )}
              </span>
            )}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="segmented-tabs" role="group" aria-label="Time period">
            {(
              [
                ['5y', '5Y'],
                ['10y', '10Y'],
                ['20y', '20Y'],
                ['all', 'All (1993–2026)'],
              ] as const
            ).map(([val, lbl]) => (
              <button
                key={val}
                type="button"
                className={`segmented-tabs__tab ${span === val ? 'is-active' : ''}`}
                style={{ fontSize: 12, padding: '5px 10px' }}
                onClick={() => setSpan(val)}
              >
                {lbl}
              </button>
            ))}
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
      </div>

      {/* Chart Filter Controls + Legend */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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
            Below S Country Rd
          </button>

          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            style={{
              height: 32,
              padding: '0 12px',
              borderRadius: 999,
              border: '1px solid var(--line)',
              background: 'var(--bg)',
              fontSize: 12,
            }}
          >
            <option value="">All Village Areas</option>
            {MECE_VILLAGE_AREAS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>

          <input
            style={pillInputStyle}
            placeholder="Min $"
            onBlur={(e) => setMinPrice(parseFlexibleNumber(e.target.value))}
          />
          <input
            style={pillInputStyle}
            placeholder="Max $"
            onBlur={(e) => setMaxPrice(parseFlexibleNumber(e.target.value))}
          />
          <input
            type="number"
            style={pillInputStyle}
            placeholder="Min ft²"
            onChange={(e) => setMinSqft(e.target.value ? Number(e.target.value) : null)}
          />
          <input
            type="number"
            step="0.1"
            style={pillInputStyle}
            placeholder="Min ac"
            onChange={(e) => setMinLot(e.target.value ? Number(e.target.value) : null)}
          />

          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              style={{
                height: 32,
                padding: '0 10px',
                borderRadius: 999,
                border: '1px solid var(--line)',
                background: 'transparent',
                fontSize: 11.5,
                color: 'var(--ink-2)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <RotateCcw size={11} />
              <span>Reset</span>
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11.5, color: 'var(--ink-2)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 16, height: 2.5, background: 'var(--accent)', borderRadius: 2 }} />
            Bellport Village Annual Median
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 16,
                height: 0,
                borderTop: '2px dashed #80868b',
              }}
            />
            U.S. National Avg (Indexed)
          </span>
        </div>
      </div>

      {/* SVG Scatter + Bellport Median + U.S. National Benchmark Line */}
      <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          role="img"
          aria-label="Bellport Village closed home prices over time compared to the U.S. national real estate average"
        >
          <g transform={`translate(${m.left},${m.top})`}>
            {yTicks.map((t) => (
              <g key={t} transform={`translate(0,${yScale(t)})`}>
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
                  {metric === 'ppsf' ? `$${t}` : fmtShortDollar(t)}
                </text>
              </g>
            ))}

            {xYears.map((yr) => (
              <g key={yr} transform={`translate(${xScale(yr + 0.5)},${ih})`}>
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

            {/* U.S. National Average Benchmark Trajectory */}
            {nationalCurvePoints.length > 1 && (
              <path
                d={nationalPath}
                fill="none"
                stroke="#80868b"
                strokeWidth={2}
                strokeDasharray="5 4"
                opacity={0.85}
              />
            )}

            {/* Bellport Annual Median Trend Line */}
            {yearlyMedians.length > 1 && (
              <path
                d={linePath}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2.5}
                opacity={0.92}
              />
            )}

            {/* Individual Closed Sales */}
            {filtered.map((s) => {
              const cx = xScale(dateToYearFloat(s.date));
              const cy = yScale(metric === 'ppsf' ? (s.ppsf ?? 0) : s.price);
              const isHov = hoveredId === s.id;
              return (
                <circle
                  key={s.id}
                  cx={cx}
                  cy={cy}
                  r={isHov ? 7 : 4.5}
                  fill={s.belowSC ? 'var(--accent)' : '#7baaf7'}
                  fillOpacity={isHov ? 1 : 0.72}
                  stroke="#ffffff"
                  strokeWidth={1.3}
                  style={{ cursor: s.parcelId ? 'pointer' : 'default' }}
                  onMouseEnter={() => setHoveredId(s.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => {
                    if (s.parcelId && onSelectParcel) onSelectParcel(s.parcelId);
                  }}
                />
              );
            })}
          </g>
        </svg>

        {hoveredSale && (
          <div
            style={{
              marginTop: 6,
              padding: '8px 12px',
              borderRadius: 12,
              background: 'var(--bg)',
              border: '1px solid var(--line)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 12,
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <div>
              <strong>{hoveredSale.address}</strong> · <span>{hoveredSale.area}</span> · Sold{' '}
              {hoveredSale.date} ({hoveredSale.source})
            </div>
            <div className="priv-val" style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
              ${hoveredSale.price.toLocaleString()}
              {hoveredSale.ppsf ? ` ($${hoveredSale.ppsf}/ft²)` : ''} · {hoveredSale.acres ?? 0.3} ac
            </div>
          </div>
        )}

        {/* Screen-reader data table fallback */}
        <table className="sr-only">
          <caption>
            Bellport Village annual median home sale prices compared to U.S. national index
          </caption>
          <thead>
            <tr>
              <th scope="col">Year</th>
              <th scope="col">Closed Sales</th>
              <th scope="col">{metric === 'ppsf' ? 'Median $/Sq Ft' : 'Median Sale Price'}</th>
            </tr>
          </thead>
          <tbody>
            {yearlyMedians.map((row) => (
              <tr key={row.year}>
                <td>{row.year}</td>
                <td>{row.count}</td>
                <td>
                  {metric === 'ppsf' ? `$${row.medianVal}/ft²` : `$${row.medianVal.toLocaleString()}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
