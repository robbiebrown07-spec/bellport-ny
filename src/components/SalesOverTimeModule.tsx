import React, { useEffect, useMemo, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { median } from 'd3-array';
import { RotateCcw } from 'lucide-react';
import type { HistoricalSaleRecord } from '../types';
import { MeceFilterDropdown, type MeceBucketOption } from './MeceFilterDropdown';

interface SalesOverTimeModuleProps {
  privacyBlur: boolean;
  onSelectParcel?: (parcelId: string) => void;
}

const AREA_OPTIONS: MeceBucketOption[] = [
  { value: 'Historic Lanes', label: 'Historic Lanes' },
  { value: 'Country Club & Golf', label: 'Country Club & Golf' },
  { value: 'Village Center', label: 'Village Center' },
  { value: 'East Lanes & Circuit', label: 'East Lanes & Circuit' },
];

const SIZE_OPTIONS: MeceBucketOption[] = [
  { value: 's1', label: '< 1,800 ft² (1–2 BR)' },
  { value: 's2', label: '1,800 – 2,349 ft² (3 BR)' },
  { value: 's3', label: '2,350 – 3,499 ft² (4 BR)' },
  { value: 's4', label: '3,500+ ft² (5+ BR)' },
];

const PRICE_OPTIONS: MeceBucketOption[] = [
  { value: 'p1', label: 'Under $1M' },
  { value: 'p2', label: '$1M – $2M' },
  { value: 'p3', label: '$2M – $3M' },
  { value: 'p4', label: '$3M+' },
];

const LOT_OPTIONS: MeceBucketOption[] = [
  { value: 'l1', label: '< 0.35 ac' },
  { value: 'l2', label: '0.35 – 0.49 ac' },
  { value: 'l3', label: '0.50 – 0.99 ac' },
  { value: 'l4', label: '1.00+ ac' },
];

const POOL_OPTIONS: MeceBucketOption[] = [
  { value: 'yes', label: 'With Pool' },
  { value: 'no', label: 'No Pool' },
];

function sizeBucket(s: HistoricalSaleRecord): string {
  const sf = s.sqft ?? (s.beds ? s.beds * 620 : 2000);
  if (sf < 1800) return 's1';
  if (sf < 2350) return 's2';
  if (sf < 3500) return 's3';
  return 's4';
}

function priceBucket(price: number): string {
  if (price < 1_000_000) return 'p1';
  if (price < 2_000_000) return 'p2';
  if (price < 3_000_000) return 'p3';
  return 'p4';
}

function lotBucket(acres?: number | null): string {
  const a = acres ?? 0.32;
  if (a < 0.35) return 'l1';
  if (a < 0.5) return 'l2';
  if (a < 1.0) return 'l3';
  return 'l4';
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
  const [areaSet, setAreaSet] = useState<Set<string>>(() => new Set());
  const [sizeSet, setSizeSet] = useState<Set<string>>(() => new Set());
  const [priceSet, setPriceSet] = useState<Set<string>>(() => new Set());
  const [lotSet, setLotSet] = useState<Set<string>>(() => new Set());
  const [poolSet, setPoolSet] = useState<Set<string>>(() => new Set());
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
      if (areaSet.size > 0 && !areaSet.has(s.area)) return false;
      if (sizeSet.size > 0 && !sizeSet.has(sizeBucket(s))) return false;
      if (priceSet.size > 0 && !priceSet.has(priceBucket(s.price))) return false;
      if (lotSet.size > 0 && !lotSet.has(lotBucket(s.acres))) return false;
      if (poolSet.size > 0 && !poolSet.has(s.pool ? 'yes' : 'no')) return false;
      return true;
    });
  }, [sales, metric, areaSet, sizeSet, priceSet, lotSet, poolSet]);

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
    areaSet.size > 0 ||
    sizeSet.size > 0 ||
    priceSet.size > 0 ||
    lotSet.size > 0 ||
    poolSet.size > 0;

  const resetFilters = () => {
    setAreaSet(new Set());
    setSizeSet(new Set());
    setPriceSet(new Set());
    setLotSet(new Set());
    setPoolSet(new Set());
  };

  const latestMedian = yearlyMedians[yearlyMedians.length - 1]?.medianVal ?? 0;
  const earliestMedian = yearlyMedians[0]?.medianVal ?? 0;
  const changePct =
    earliestMedian > 0 && yearlyMedians.length >= 2
      ? Math.round(((latestMedian - earliestMedian) / earliestMedian) * 100)
      : null;

  const W = 940;
  const H = 310;
  const m = { top: 20, right: 26, bottom: 36, left: 68 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  const yValues = filtered.map((s) => (metric === 'ppsf' ? (s.ppsf ?? 0) : s.price));
  const maxVal = yValues.length ? Math.max(...yValues) : metric === 'ppsf' ? 1200 : 4_000_000;

  const xScale = scaleLinear().domain([2017, 2027]).range([0, iw]);
  const yScale = scaleLinear()
    .domain([0, maxVal * 1.1])
    .range([ih, 0])
    .nice();

  const xYears = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
  const yTicks = yScale.ticks(5);
  const hoveredSale = filtered.find((s) => s.id === hoveredId) ?? null;

  const linePath = yearlyMedians
    .map((pt, i) => `${i === 0 ? 'M' : 'L'}${xScale(pt.x).toFixed(1)},${yScale(pt.medianVal).toFixed(1)}`)
    .join(' ');

  return (
    <div
      style={{
        padding: 20,
        borderRadius: 'var(--radius)',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {/* Lean Header + KPI Strip */}
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
          <h2 style={{ fontSize: 20, margin: 0 }}>Home Prices Over Time</h2>
          <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: '2px 0 0' }}>
            {filtered.length} closed sales (2017–2026)
            {latestMedian > 0 && (
              <span className="priv-val">
                {' '}
                · Latest median{' '}
                <strong>
                  {metric === 'ppsf'
                    ? `$${latestMedian}/ft²`
                    : `$${(latestMedian / 1_000_000).toFixed(2)}M`}
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

      {/* Clean MECE Dropdown Bar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <MeceFilterDropdown
          label="Area"
          options={AREA_OPTIONS}
          selected={areaSet}
          onChange={setAreaSet}
        />
        <MeceFilterDropdown
          label="Size"
          options={SIZE_OPTIONS}
          selected={sizeSet}
          onChange={setSizeSet}
        />
        <MeceFilterDropdown
          label="Price"
          options={PRICE_OPTIONS}
          selected={priceSet}
          onChange={setPriceSet}
        />
        <MeceFilterDropdown
          label="Lot"
          options={LOT_OPTIONS}
          selected={lotSet}
          onChange={setLotSet}
        />
        <MeceFilterDropdown
          label="Pool"
          options={POOL_OPTIONS}
          selected={poolSet}
          onChange={setPoolSet}
        />
        {hasFilters && (
          <button type="button" className="icon-btn" onClick={resetFilters} style={{ height: 34 }}>
            <RotateCcw size={13} />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* Interactive Time-Series Chart */}
      {filtered.length === 0 ? (
        <div style={{ padding: 28, textAlign: 'center', color: 'var(--ink-2)', fontSize: 13 }}>
          No closed sales match this filter combination.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{ width: '100%', minWidth: 540, height: 'auto', display: 'block' }}
            role="img"
            aria-label="Bellport closed home sales over time"
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
                    {privacyBlur
                      ? '•••'
                      : metric === 'ppsf'
                        ? `$${t}`
                        : t >= 1_000_000
                          ? `$${(t / 1_000_000).toFixed(1)}M`
                          : `$${Math.round(t / 1000)}k`}
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

              {/* Annual Median Trend Curve */}
              {yearlyMedians.length >= 2 && (
                <path
                  d={linePath}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                />
              )}

              {/* Individual Closed Sales */}
              {filtered.map((s) => {
                const val = metric === 'ppsf' ? (s.ppsf ?? 0) : s.price;
                const cx = xScale(dateToYearFloat(s.date));
                const cy = yScale(val);
                const isHov = hoveredId === s.id;
                return (
                  <rect
                    key={s.id}
                    x={cx - (isHov ? 5.5 : 4)}
                    y={cy - (isHov ? 5.5 : 4)}
                    width={isHov ? 11 : 8}
                    height={isHov ? 11 : 8}
                    rx={2}
                    fill={s.inVillage ? '#34a853' : '#9aa0a6'}
                    fillOpacity={0.85}
                    stroke="var(--surface)"
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

              {/* Hover Readout */}
              {hoveredSale && (
                <g
                  transform={`translate(${Math.min(iw - 230, Math.max(8, xScale(dateToYearFloat(hoveredSale.date)) + 10))},${Math.max(8, yScale(metric === 'ppsf' ? (hoveredSale.ppsf ?? 0) : hoveredSale.price) - 42)})`}
                  style={{ pointerEvents: 'none' }}
                >
                  <rect
                    width={222}
                    height={46}
                    rx={10}
                    fill="var(--surface)"
                    stroke="var(--line-strong)"
                  />
                  <text x={10} y={19} fontSize={12} fontWeight={600} fill="var(--ink)">
                    {hoveredSale.address.slice(0, 26)}
                  </text>
                  <text
                    x={10}
                    y={36}
                    fontSize={11}
                    fontFamily="var(--font-mono)"
                    fill="var(--ink-2)"
                  >
                    {privacyBlur
                      ? hoveredSale.date
                      : `${hoveredSale.date} · $${(hoveredSale.price / 1_000_000).toFixed(2)}M${hoveredSale.sqft ? ` · ${hoveredSale.sqft}ft²` : ''}`}
                  </text>
                </g>
              )}
            </g>
          </svg>

          {/* Accessible Summary Table */}
          <table className="sr-only">
            <caption>Closed Bellport home sales over time</caption>
            <thead>
              <tr>
                <th>Date</th>
                <th>Address</th>
                <th>Area</th>
                <th>Sale Price</th>
                <th>Sq Ft</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td>{s.date}</td>
                  <td>{s.address}</td>
                  <td>{s.area}</td>
                  <td>${s.price.toLocaleString()}</td>
                  <td>{s.sqft ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
