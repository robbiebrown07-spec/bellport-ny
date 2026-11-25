import React, { useState } from 'react';
import { scaleLinear, scaleSqrt } from 'd3-scale';
import { extent } from 'd3-array';
import type { Listing, UserTrackStatus } from '../types';

interface PriceSpaceChartProps {
  listings: Listing[];
  privacyBlur: boolean;
  onSelectListing: (id: string) => void;
}

const STATUS_COLOR: Record<UserTrackStatus, string> = {
  shortlist: 'var(--g-green)',
  watching: 'var(--g-yellow-600)',
  pass: 'var(--g-red)',
  unreviewed: 'var(--g-blue)',
};

export const PriceSpaceChart: React.FC<PriceSpaceChartProps> = ({
  listings,
  privacyBlur,
  onSelectListing,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const plotted = listings.filter((d) => d.sqft > 0);
  if (plotted.length < 2) {
    return null;
  }

  const width = 920;
  const height = 340;
  const margin = { top: 24, right: 32, bottom: 44, left: 74 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const [minSqft, maxSqft] = extent(plotted, (d) => d.sqft) as [number, number];
  const [minPrice, maxPrice] = extent(plotted, (d) => d.price) as [number, number];
  const [minAcres, maxAcres] = extent(plotted, (d) => d.lotAcres) as [number, number];

  const xScale = scaleLinear()
    .domain([Math.max(700, minSqft * 0.9), maxSqft * 1.06])
    .range([0, innerW])
    .nice();

  const yScale = scaleLinear()
    .domain([Math.max(300000, minPrice * 0.85), maxPrice * 1.08])
    .range([innerH, 0])
    .nice();

  const rScale = scaleSqrt()
    .domain([Math.min(0.2, minAcres), Math.max(1.2, maxAcres)])
    .range([6, 15]);

  const xTicks = xScale.ticks(6);
  const yTicks = yScale.ticks(5);
  const hovered = plotted.find((l) => l.id === hoveredId) ?? null;

  return (
    <section className="chart-band" aria-labelledby="chart-price-space-heading">
      <div className="container">
        <div className="chart-band__header">
          <span className="eyebrow">Valuation vs. Footprint</span>
          <h2 id="chart-price-space-heading" className="chart-band__title">
            Interior space against asking price across matching properties.
          </h2>
          <p className="chart-band__lede">
            Historic lanes south of Main Street command a steep premium per square foot, while
            East Village lanes like Circuit Road deliver larger footprints and pool-ready acreage
            for less.
          </p>
        </div>

        <div className="chart-band__card">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            style={{ width: '100%', height: 'auto', minWidth: 560, display: 'block' }}
            role="img"
            aria-label="Scatterplot comparing interior square footage and asking price across Bellport Village listings"
          >
            <g transform={`translate(${margin.left},${margin.top})`}>
              {/* Horizontal gridlines */}
              {yTicks.map((t) => (
                <g key={`y-${t}`} transform={`translate(0,${yScale(t)})`}>
                  <line x1={0} x2={innerW} stroke="var(--line)" strokeDasharray="3 3" />
                  <text
                    x={-12}
                    dy="0.32em"
                    textAnchor="end"
                    fill="var(--ink-2)"
                    fontSize={12}
                    fontFamily="var(--font-mono)"
                    className="priv-val"
                  >
                    {privacyBlur ? '$•••' : `$${(t / 1_000_000).toFixed(2).replace(/\.00$/, '')}M`}
                  </text>
                </g>
              ))}

              {/* Vertical axis ticks */}
              {xTicks.map((t) => (
                <g key={`x-${t}`} transform={`translate(${xScale(t)},${innerH})`}>
                  <line y1={0} y2={6} stroke="var(--line-strong)" />
                  <text
                    y={22}
                    textAnchor="middle"
                    fill="var(--ink-2)"
                    fontSize={12}
                    fontFamily="var(--font-mono)"
                  >
                    {t.toLocaleString()} ft²
                  </text>
                </g>
              ))}

              <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke="var(--line-strong)" />

              {/* Listing marks */}
              {plotted.map((item) => {
                const cx = xScale(item.sqft);
                const cy = yScale(item.price);
                const r = rScale(item.lotAcres);
                const isHovered = item.id === hoveredId;

                return (
                  <g
                    key={item.id}
                    transform={`translate(${cx},${cy})`}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredId(item.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => onSelectListing(item.id)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open ${item.address}: ${item.sqft.toLocaleString()} sq ft, $${item.price.toLocaleString()}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectListing(item.id);
                      }
                    }}
                  >
                    <circle
                      r={isHovered ? r + 3 : r}
                      fill={STATUS_COLOR[item.userStatus]}
                      fillOpacity={item.inVillage ? 0.85 : 0.35}
                      stroke={isHovered ? 'var(--ink)' : 'var(--surface)'}
                      strokeWidth={isHovered ? 2.5 : 1.5}
                      strokeDasharray={item.inVillage ? undefined : '3 2'}
                    />
                  </g>
                );
              })}

              {/* Hover readout inside SVG */}
              {hovered && (
                <g
                  transform={`translate(${Math.min(innerW - 235, Math.max(8, xScale(hovered.sqft) + 12))},${Math.max(12, yScale(hovered.price) - 36)})`}
                  style={{ pointerEvents: 'none' }}
                >
                  <rect
                    width={228}
                    height={54}
                    rx={10}
                    fill="var(--surface)"
                    stroke="var(--line-strong)"
                  />
                  <text x={12} y={22} fontSize={13} fontWeight={600} fill="var(--ink)">
                    {hovered.address.slice(0, 28)}
                  </text>
                  <text
                    x={12}
                    y={41}
                    fontSize={12}
                    fontFamily="var(--font-mono)"
                    fill="var(--ink-2)"
                  >
                    {privacyBlur
                      ? 'Price blurred'
                      : `$${(hovered.price / 1_000_000).toFixed(2)}M · $${Math.round(hovered.price / hovered.sqft)}/ft² · ${hovered.lotAcres}ac`}
                  </text>
                </g>
              )}
            </g>
          </svg>

          {/* Visually-hidden accessible summary table per Blueprint Section 3.5 */}
          <table className="sr-only">
            <caption>Bellport Village listings by square footage, lot size, and asking price</caption>
            <thead>
              <tr>
                <th>Address</th>
                <th>Micro-Area</th>
                <th>Price</th>
                <th>Square Feet</th>
                <th>Lot Acres</th>
                <th>Tracking Status</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((item) => (
                <tr key={item.id}>
                  <td>{item.address}</td>
                  <td>{item.area}</td>
                  <td>${item.price.toLocaleString()}</td>
                  <td>{item.sqft.toLocaleString()}</td>
                  <td>{item.lotAcres}</td>
                  <td>{item.userStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="chart-band__caption">
            Circle radius reflects lot acreage, solid fills denote homes inside the Incorporated
            Village of Bellport, and colors indicate your shortlist status (click any circle to
            inspect the property).
          </p>
        </div>
      </div>
    </section>
  );
};
