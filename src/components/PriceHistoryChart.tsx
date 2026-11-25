import React, { useState } from 'react';
import { scaleLinear, scalePoint } from 'd3-scale';
import { extent } from 'd3-array';
import { Plus } from 'lucide-react';
import type { Listing, PricePoint } from '../types';
import { getPriceChangeStats } from '../lib/intelligence';

interface PriceHistoryChartProps {
  listing: Listing;
  privacyBlur: boolean;
  onAddPricePoint?: (nextPoint: PricePoint, newCurrentPrice: number) => void;
}

export const PriceHistoryChart: React.FC<PriceHistoryChartProps> = ({
  listing,
  privacyBlur,
  onAddPricePoint,
}) => {
  const { history, initialPrice, currentPrice, totalDropDollar, totalDropPct } =
    getPriceChangeStats(listing);

  const [newPriceStr, setNewPriceStr] = useState('');
  const [newDateStr, setNewDateStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [showAdd, setShowAdd] = useState(false);

  const w = 520;
  const h = 165;
  const margin = { top: 20, right: 28, bottom: 32, left: 68 };
  const innerW = w - margin.left - margin.right;
  const innerH = h - margin.top - margin.bottom;

  const [minP, maxP] = extent(history, (d) => d.price) as [number, number];
  const pad = minP === maxP ? minP * 0.06 : (maxP - minP) * 0.25;

  const yScale = scaleLinear()
    .domain([Math.max(0, minP - pad), maxP + pad])
    .range([innerH, 0]);

  const labels = history.map((d, idx) => `${d.date}#${idx}`);
  const xScale = scalePoint<string>().domain(labels).range([0, innerW]).padding(0.2);

  const polylinePoints = history
    .map((pt, idx) => `${xScale(labels[idx]) ?? 0},${yScale(pt.price)}`)
    .join(' ');

  const handleLogPoint = (e: React.FormEvent) => {
    e.preventDefault();
    const p = Number(newPriceStr.replace(/[^0-9.]/g, ''));
    if (!p || !onAddPricePoint) return;
    const prev = history[history.length - 1]?.price ?? listing.price;
    const event: PricePoint['event'] =
      p < prev ? 'Price Cut' : p > prev ? 'Price Increase' : 'Observed';
    onAddPricePoint({ date: newDateStr, price: p, event }, p);
    setNewPriceStr('');
    setShowAdd(false);
  };

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--line)',
        background: 'var(--surface-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <strong style={{ fontSize: 15 }}>Price Trajectory Over Time</strong>
          <div style={{ fontSize: 12, color: 'var(--ink-2)' }} className="priv-val">
            {totalDropDollar > 0
              ? `Down $${totalDropDollar.toLocaleString()} (-${totalDropPct}%) from $${initialPrice.toLocaleString()} initial ask`
              : `Unchanged since $${currentPrice.toLocaleString()} initial listing`}
          </div>
        </div>

        {onAddPricePoint && (
          <button
            type="button"
            className="icon-btn"
            style={{ minHeight: 32, fontSize: 12 }}
            onClick={() => setShowAdd((v) => !v)}
          >
            <Plus size={13} />
            <span>Log Price Change</span>
          </button>
        )}
      </div>

      {history.length >= 2 && (
        <svg
          viewBox={`0 0 ${w} ${h}`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          role="img"
          aria-label={`Price history chart for ${listing.address}`}
        >
          <g transform={`translate(${margin.left},${margin.top})`}>
            {yScale.ticks(3).map((t) => (
              <g key={t} transform={`translate(0,${yScale(t)})`}>
                <line x1={0} x2={innerW} stroke="var(--line)" strokeDasharray="3 3" />
                <text
                  x={-10}
                  dy="0.32em"
                  textAnchor="end"
                  fontSize={11}
                  fontFamily="var(--font-mono)"
                  fill="var(--ink-2)"
                  className="priv-val"
                >
                  {privacyBlur ? '$•••' : `$${(t / 1_000_000).toFixed(2)}M`}
                </text>
              </g>
            ))}

            <polyline
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2.5}
              points={polylinePoints}
            />

            {history.map((pt, idx) => {
              const cx = xScale(labels[idx]) ?? 0;
              const cy = yScale(pt.price);
              const dotColor =
                pt.event === 'Price Cut'
                  ? 'var(--g-green)'
                  : pt.event === 'Price Increase'
                    ? 'var(--g-red)'
                    : 'var(--g-blue)';

              return (
                <g key={labels[idx]} transform={`translate(${cx},${cy})`}>
                  <circle r={5} fill={dotColor} stroke="var(--surface)" strokeWidth={2} />
                  <text
                    y={innerH - cy + 20}
                    textAnchor="middle"
                    fontSize={10}
                    fontFamily="var(--font-mono)"
                    fill="var(--ink-2)"
                  >
                    {pt.date.slice(5)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      )}

      {/* Chronological event ledger (doubles as accessible table) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {history.map((pt, idx) => (
          <div
            key={`${pt.date}-${idx}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 13,
              padding: '4px 0',
              borderTop: idx > 0 ? '1px solid var(--line)' : undefined,
            }}
          >
            <span style={{ color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              {pt.date} · {pt.event}
            </span>
            <strong className="priv-val" style={{ fontFamily: 'var(--font-mono)' }}>
              ${pt.price.toLocaleString()}
            </strong>
          </div>
        ))}
      </div>

      {showAdd && (
        <form onSubmit={handleLogPoint} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 6 }}>
          <input
            type="date"
            className="input"
            value={newDateStr}
            onChange={(e) => setNewDateStr(e.target.value)}
            style={{ width: 145 }}
          />
          <input
            type="text"
            required
            className="input"
            placeholder="New price ($)"
            value={newPriceStr}
            onChange={(e) => setNewPriceStr(e.target.value)}
            style={{ flex: 1, minWidth: 130 }}
          />
          <button type="submit" className="icon-btn icon-btn--primary">
            Save
          </button>
        </form>
      )}
    </div>
  );
};
