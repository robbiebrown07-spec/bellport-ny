import React, { useMemo, useState } from 'react';
import { scaleLinear, scaleTime } from 'd3-scale';
import { ArrowRight, TrendingDown, X } from 'lucide-react';
import type { Listing } from '../types';
import { evaluateGoodDeal, getPriceChangeStats } from '../lib/intelligence';
import { fmtShortDollar, resolveAssetUrl } from '../lib/unifiedCatalog';
import { ValuationBadge } from './ValuationBadge';
import { SalesOverTimeModule } from './SalesOverTimeModule';
import { ScrollReveal } from './ScrollReveal';

interface PriceDropsHistoryViewProps {
  listings: Listing[];
  privacyBlur: boolean;
  onOpenListing: (id: string) => void;
}

const LINE_PALETTE = [
  '#d93025',
  '#e37400',
  '#1e8e3e',
  '#9334e6',
  '#00897b',
  '#c2185b',
  '#5c6bc0',
  '#8d6e63',
  '#0288d1',
  '#7cb342',
  '#f4511e',
  '#546e7a',
];

function fmtNiceDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export const PriceDropsHistoryView: React.FC<PriceDropsHistoryViewProps> = ({
  listings,
  privacyBlur,
  onOpenListing,
}) => {
  const [chartMode, setChartMode] = useState<'pct' | 'dollar'>('pct');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);

  const activeListings = useMemo(
    () => listings.filter((l) => l.marketStatus === 'active'),
    [listings]
  );

  const todayIso = '2026-11-26';
  const todayDate = useMemo(() => new Date(`${todayIso}T12:00:00`), []);

  const seriesData = useMemo(() => {
    return activeListings
      .map((listing, idx) => {
        const stats = getPriceChangeStats(listing);
        const deal = evaluateGoodDeal(listing, listings);
        const rawPts = stats.history.length > 0
          ? stats.history
          : [{ date: listing.listedDate, price: listing.price, event: 'Listed' as const }];

        // Extend step/line cleanly to today so every active listing spans through today on the shared graph
        const pts = [...rawPts];
        if (pts[pts.length - 1].date < todayIso) {
          pts.push({
            date: todayIso,
            price: listing.price,
            event: 'Observed',
          });
        }

        const initP = pts[0]?.price || listing.originalPrice || listing.price;
        const netPct = initP > 0 ? Number((((listing.price - initP) / initP) * 100).toFixed(1)) : 0;
        const netDollar = listing.price - initP;

        const plotted = pts.map((pt) => ({
          dateStr: pt.date,
          dateObj: new Date(`${pt.date}T12:00:00`),
          price: pt.price,
          pct: initP > 0 ? ((pt.price - initP) / initP) * 100 : 0,
          event: pt.event,
        }));

        return {
          listing,
          stats,
          deal,
          initPrice: initP,
          netPct,
          netDollar,
          color: netPct < 0 ? LINE_PALETTE[idx % LINE_PALETTE.length] : '#9aa0a6',
          plotted,
        };
      })
      .sort((a, b) => a.netPct - b.netPct);
  }, [activeListings, listings]);

  const summary = useMemo(() => {
    if (seriesData.length === 0) {
      return {
        avgPct: 0,
        avgDollar: 0,
        reducedCount: 0,
        risenCount: 0,
        steadyCount: 0,
        startDateStr: todayIso,
        spanDays: 0,
      };
    }

    const avgPct = Number(
      (seriesData.reduce((acc, s) => acc + s.netPct, 0) / seriesData.length).toFixed(1)
    );
    const avgDollar = Math.round(
      seriesData.reduce((acc, s) => acc + s.netDollar, 0) / seriesData.length
    );
    const reducedCount = seriesData.filter((s) => s.netDollar < 0).length;
    const risenCount = seriesData.filter((s) => s.netDollar > 0).length;
    const steadyCount = seriesData.length - reducedCount - risenCount;

    let earliest = todayIso;
    for (const s of seriesData) {
      const first = s.plotted[0]?.dateStr ?? s.listing.listedDate;
      if (first && first < earliest) earliest = first;
    }
    const startMs = new Date(`${earliest}T12:00:00`).getTime();
    const spanDays = Math.max(1, Math.round((todayDate.getTime() - startMs) / 86_400_000));

    return {
      avgPct,
      avgDollar,
      reducedCount,
      risenCount,
      steadyCount,
      startDateStr: earliest,
      spanDays,
    };
  }, [seriesData, todayDate]);

  // SVG Chart Scales & Cohort Average Trajectory Line
  const W = 940;
  const H = 360;
  const pad = { top: 24, right: 118, bottom: 38, left: 66 };

  const xDomain = useMemo<[Date, Date]>(() => {
    const start = new Date(`${summary.startDateStr}T12:00:00`);
    if (Number.isNaN(start.getTime()) || start >= todayDate) {
      return [new Date('2026-05-01T12:00:00'), todayDate];
    }
    return [start, todayDate];
  }, [summary.startDateStr, todayDate]);

  const xScale = useMemo(
    () => scaleTime().domain(xDomain).range([pad.left, W - pad.right]),
    [pad.left, pad.right, xDomain]
  );

  const yDomain = useMemo<[number, number]>(() => {
    if (chartMode === 'pct') {
      let minP = -12;
      let maxP = 4;
      for (const s of seriesData) {
        for (const pt of s.plotted) {
          if (pt.pct < minP) minP = pt.pct;
          if (pt.pct > maxP) maxP = pt.pct;
        }
      }
      return [Math.floor(minP - 2), Math.ceil(maxP + 2)];
    }
    let minD = Infinity;
    let maxD = 0;
    for (const s of seriesData) {
      for (const pt of s.plotted) {
        if (pt.price < minD) minD = pt.price;
        if (pt.price > maxD) maxD = pt.price;
      }
    }
    if (!Number.isFinite(minD)) return [500_000, 4_500_000];
    return [Math.max(0, minD * 0.9), maxD * 1.06];
  }, [chartMode, seriesData]);

  const yScale = useMemo(
    () => scaleLinear().domain(yDomain).range([H - pad.bottom, pad.top]).nice(),
    [H, pad.bottom, pad.top, yDomain]
  );

  // Sample 24 evenly spaced dates across xDomain to compute the live Cohort Average Trajectory curve
  const averageCurvePts = useMemo(() => {
    if (seriesData.length === 0) return [];
    const t0 = xDomain[0].getTime();
    const t1 = xDomain[1].getTime();
    const steps = 24;
    const pts: Array<{ dateObj: Date; val: number }> = [];

    for (let i = 0; i <= steps; i++) {
      const t = t0 + ((t1 - t0) * i) / steps;
      const activeAtT: number[] = [];

      for (const s of seriesData) {
        const firstT = s.plotted[0].dateObj.getTime();
        if (t < firstT) continue;
        let curPt = s.plotted[0];
        for (const p of s.plotted) {
          if (p.dateObj.getTime() <= t) curPt = p;
        }
        activeAtT.push(chartMode === 'pct' ? curPt.pct : curPt.price);
      }

      if (activeAtT.length > 0) {
        const avg = activeAtT.reduce((a, b) => a + b, 0) / activeAtT.length;
        pts.push({ dateObj: new Date(t), val: avg });
      }
    }
    return pts;
  }, [chartMode, seriesData, xDomain]);

  const pinnedSeries = pinnedId ? (seriesData.find((s) => s.listing.id === pinnedId) ?? null) : null;
  const hoveredSeries = hoveredId ? (seriesData.find((s) => s.listing.id === hoveredId) ?? null) : null;
  const activeSeries = pinnedSeries ?? hoveredSeries;
  const focusId = pinnedSeries?.listing.id ?? hoveredId;

  return (
    <section className="results-band" aria-label="House prices over time">
      <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <SalesOverTimeModule privacyBlur={privacyBlur} onOpenHome={onOpenListing} />

        {/* Unified Multi-Listing Active Price Trajectory Graph */}
        <ScrollReveal>
          <div
            style={{
              padding: 24,
              borderRadius: 'var(--radius)',
              border: '1px solid var(--line)',
              background: 'var(--surface)',
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
                flexWrap: 'wrap',
                gap: 14,
              }}
            >
              <div>
                <span className="eyebrow" style={{ marginBottom: 4 }}>
                  Active Inventory Price Movement · {fmtNiceDate(summary.startDateStr)} –{' '}
                  {fmtNiceDate(todayIso)} ({summary.spanDays} Days)
                </span>
                <h2 style={{ fontSize: 22, margin: 0 }}>
                  Active Listing Price Trajectories ({seriesData.length} Homes)
                </h2>
                <p style={{ fontSize: 13.5, color: 'var(--ink-2)', margin: '4px 0 0' }}>
                  All {seriesData.length} active Bellport Village listings plotted on one timeline —{' '}
                  <strong>{summary.reducedCount} cut price</strong>,{' '}
                  <strong>{summary.steadyCount} held steady</strong>
                  {summary.risenCount > 0 ? `, ${summary.risenCount} increased` : ''}.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div
                  className="priv-val"
                  style={{
                    padding: '8px 14px',
                    borderRadius: 12,
                    background: summary.avgPct <= 0 ? '#e6f4ea' : '#fce8e6',
                    color: summary.avgPct <= 0 ? '#137333' : '#c5221f',
                    fontSize: 12.5,
                  }}
                >
                  <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase' }}>
                    Average Change ({summary.spanDays}d)
                  </div>
                  <strong style={{ fontSize: 16, fontFamily: 'var(--font-mono)' }}>
                    {summary.avgPct > 0 ? '+' : ''}
                    {summary.avgPct}% ({summary.avgDollar > 0 ? '+' : ''}
                    {fmtShortDollar(summary.avgDollar)})
                  </strong>
                </div>

                <div className="segmented-tabs" role="group" aria-label="Y-axis mode">
                  <button
                    type="button"
                    className={`segmented-tabs__tab ${chartMode === 'pct' ? 'is-active' : ''}`}
                    style={{ fontSize: 12, padding: '5px 11px' }}
                    onClick={() => setChartMode('pct')}
                  >
                    % Change
                  </button>
                  <button
                    type="button"
                    className={`segmented-tabs__tab ${chartMode === 'dollar' ? 'is-active' : ''}`}
                    style={{ fontSize: 12, padding: '5px 11px' }}
                    onClick={() => setChartMode('dollar')}
                  >
                    $ Asking Price
                  </button>
                </div>
              </div>
            </div>

            {/* Unified SVG Chart */}
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <svg
                viewBox={`0 0 ${W} ${H}`}
                style={{ width: '100%', height: 'auto', minWidth: 640, display: 'block' }}
                role="img"
                aria-label="Unified active listing price change chart"
                onClick={() => setPinnedId(null)}
              >
                {/* Horizontal Grid Lines */}
                {yScale.ticks(6).map((tick) => {
                  const y = yScale(tick);
                  const isZero = chartMode === 'pct' && tick === 0;
                  return (
                    <g key={tick}>
                      <line
                        x1={pad.left}
                        x2={W - pad.right}
                        y1={y}
                        y2={y}
                        stroke={isZero ? '#5f6368' : '#e8eaed'}
                        strokeWidth={isZero ? 1.4 : 1}
                        strokeDasharray={isZero ? '4 3' : undefined}
                      />
                      <text
                        x={pad.left - 10}
                        y={y + 4}
                        textAnchor="end"
                        fontSize="11"
                        fill="#5f6368"
                        fontFamily="var(--font-mono)"
                      >
                        {chartMode === 'pct'
                          ? `${tick > 0 ? '+' : ''}${tick}%`
                          : fmtShortDollar(tick)}
                      </text>
                    </g>
                  );
                })}

                {/* X-Axis Date Ticks */}
                {xScale.ticks(6).map((dt, idx) => {
                  const x = xScale(dt);
                  return (
                    <g key={idx}>
                      <line
                        x1={x}
                        x2={x}
                        y1={H - pad.bottom}
                        y2={H - pad.bottom + 5}
                        stroke="#dadce0"
                      />
                      <text
                        x={x}
                        y={H - 12}
                        textAnchor="middle"
                        fontSize="11"
                        fill="#5f6368"
                      >
                        {dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </text>
                    </g>
                  );
                })}

                {/* Individual Listing Trajectories (Click to lock below, then click through to home card!) */}
                {seriesData.map((s) => {
                  const isFoc = focusId === s.listing.id;
                  const dimmed = focusId !== null && !isFoc;
                  const dPath = s.plotted
                    .map((pt, idx) => {
                      const x = xScale(pt.dateObj);
                      const y = yScale(chartMode === 'pct' ? pt.pct : pt.price);
                      return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
                    })
                    .join(' ');
                  const lastPt = s.plotted[s.plotted.length - 1];
                  const lastX = xScale(lastPt.dateObj);
                  const lastY = yScale(chartMode === 'pct' ? lastPt.pct : lastPt.price);

                  return (
                    <g
                      key={s.listing.id}
                      style={{ cursor: 'pointer', opacity: dimmed ? 0.22 : 1 }}
                      onMouseEnter={() => {
                        if (!pinnedSeries) setHoveredId(s.listing.id);
                      }}
                      onMouseLeave={() => {
                        if (!pinnedSeries) setHoveredId(null);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPinnedId(s.listing.id);
                        setHoveredId(s.listing.id);
                      }}
                    >
                      <path
                        d={dPath}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={isFoc ? 3.4 : s.netPct !== 0 ? 2.1 : 1.4}
                      />
                      {s.plotted.map((pt, i) => (
                        <circle
                          key={i}
                          cx={xScale(pt.dateObj)}
                          cy={yScale(chartMode === 'pct' ? pt.pct : pt.price)}
                          r={isFoc ? 4.8 : 2.8}
                          fill={s.color}
                          stroke="#ffffff"
                          strokeWidth={1.2}
                        />
                      ))}
                      {(isFoc || s.netPct < -2) && (
                        <text
                          x={lastX + 6}
                          y={lastY + 3.5}
                          fontSize="10.5"
                          fontWeight={isFoc ? 700 : 500}
                          fill={s.color}
                        >
                          {s.listing.address.replace(/\s+(Rd|Ln|St|Dr|Ave)$/i, '')} (
                          {s.netPct > 0 ? '+' : ''}
                          {s.netPct}%)
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Bold Cohort Average Change Line (#1a73e8) */}
                {averageCurvePts.length >= 2 && (
                  <g pointerEvents="none">
                    <path
                      d={averageCurvePts
                        .map((pt, idx) => {
                          const x = xScale(pt.dateObj);
                          const y = yScale(pt.val);
                          return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
                        })
                        .join(' ')}
                      fill="none"
                      stroke="#1a73e8"
                      strokeWidth={3.2}
                      strokeDasharray="7 4"
                    />
                    {(() => {
                      const end = averageCurvePts[averageCurvePts.length - 1];
                      return (
                        <text
                          x={xScale(end.dateObj) + 6}
                          y={yScale(end.val) - 5}
                          fontSize="11"
                          fontWeight="700"
                          fill="#1a73e8"
                        >
                          Avg ({summary.avgPct > 0 ? '+' : ''}
                          {summary.avgPct}%)
                        </text>
                      );
                    })()}
                  </g>
                )}
              </svg>
            </div>

            {/* Pinned / Active Callout Card Below Chart — Stays Locked on Click! */}
            {activeSeries ? (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 14,
                  background: pinnedSeries ? '#f8fbff' : 'var(--surface-subtle)',
                  border: pinnedSeries ? '1.5px solid var(--accent)' : '1px solid var(--line)',
                  boxShadow: pinnedSeries ? 'var(--shadow-1)' : 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 12,
                  fontSize: 13,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {(activeSeries.listing.photos?.[0] ?? activeSeries.listing.photoUrl) && (
                    <img
                      src={resolveAssetUrl(
                        activeSeries.listing.photos?.[0] ?? activeSeries.listing.photoUrl
                      )}
                      alt={activeSeries.listing.address}
                      onClick={() => onOpenListing(activeSeries.listing.id)}
                      style={{
                        width: 68,
                        height: 46,
                        objectFit: 'cover',
                        borderRadius: 8,
                        border: '1px solid var(--line)',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div>
                    <div>
                      <button
                        type="button"
                        onClick={() => onOpenListing(activeSeries.listing.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          fontSize: 14.5,
                          fontWeight: 700,
                          color: 'var(--accent)',
                          textDecoration: 'underline',
                          textUnderlineOffset: 3,
                          cursor: 'pointer',
                        }}
                      >
                        {activeSeries.listing.address}
                      </button>
                      {' · '}
                      <span style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>
                        {activeSeries.listing.style}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 2 }}>
                      Listed {fmtNiceDate(activeSeries.listing.listedDate)} at $
                      {activeSeries.initPrice.toLocaleString()} → Now{' '}
                      <strong style={{ color: 'var(--ink)' }}>
                        ${activeSeries.listing.price.toLocaleString()}
                      </strong>{' '}
                      (
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          color: activeSeries.color,
                        }}
                      >
                        {activeSeries.netPct > 0 ? '+' : ''}
                        {activeSeries.netPct}%
                      </span>
                      )
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                  <button
                    type="button"
                    className="icon-btn icon-btn--primary"
                    style={{ height: 32, padding: '0 12px', fontSize: 12 }}
                    onClick={() => onOpenListing(activeSeries.listing.id)}
                  >
                    <span>More Info on Home</span>
                    <ArrowRight size={13} />
                  </button>
                  {pinnedSeries && (
                    <button
                      type="button"
                      onClick={() => {
                        setPinnedId(null);
                        setHoveredId(null);
                      }}
                      aria-label="Clear selected listing"
                      className="icon-btn"
                      style={{ width: 30, height: 30, padding: 0, justifyContent: 'center' }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                Click any dot or line on the graph to lock its address below and open full home info.
              </div>
            )}

            {/* Interactive Listing Breakdown Rows */}
            <div className="table-wrap">
              <table className="listings-table">
                <thead>
                  <tr>
                    <th>Listing</th>
                    <th>Listed Date</th>
                    <th>Original Ask</th>
                    <th>Current Ask</th>
                    <th>Change</th>
                    <th>Valuation</th>
                  </tr>
                </thead>
                <tbody>
                  {seriesData.map(({ listing, initPrice, netPct, netDollar, deal, color }) => (
                    <tr
                      key={listing.id}
                      onMouseEnter={() => setHoveredId(listing.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onClick={() => onOpenListing(listing.id)}
                    >
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            width: 9,
                            height: 9,
                            borderRadius: '50%',
                            background: color,
                            marginRight: 8,
                          }}
                        />
                        <strong>{listing.address}</strong>
                        <span style={{ fontSize: 12, color: 'var(--ink-2)', marginLeft: 6 }}>
                          {listing.area}
                        </span>
                      </td>
                      <td>{fmtNiceDate(listing.listedDate)}</td>
                      <td className="num priv-val">${initPrice.toLocaleString()}</td>
                      <td className="num priv-val">
                        <strong>${listing.price.toLocaleString()}</strong>
                      </td>
                      <td className="num priv-val">
                        {netDollar < 0 ? (
                          <span className="badge badge--village" style={{ gap: 4 }}>
                            <TrendingDown size={12} />
                            <span>
                              {netPct}% (-${Math.round(Math.abs(netDollar) / 1000)}k)
                            </span>
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>0% (Steady)</span>
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <ValuationBadge listing={listing} deal={deal} compact />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
};
