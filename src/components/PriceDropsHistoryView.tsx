import React from 'react';
import { TrendingDown } from 'lucide-react';
import type { Listing } from '../types';
import { evaluateGoodDeal, getPriceChangeStats } from '../lib/intelligence';
import { PriceHistoryChart } from './PriceHistoryChart';

interface PriceDropsHistoryViewProps {
  listings: Listing[];
  privacyBlur: boolean;
  onOpenListing: (id: string) => void;
}

export const PriceDropsHistoryView: React.FC<PriceDropsHistoryViewProps> = ({
  listings,
  privacyBlur,
  onOpenListing,
}) => {
  const withStats = listings
    .map((listing) => ({
      listing,
      stats: getPriceChangeStats(listing),
      deal: evaluateGoodDeal(listing, listings),
    }))
    .sort((a, b) => b.stats.totalDropDollar - a.stats.totalDropDollar);

  const reducedCount = withStats.filter((x) => x.stats.totalDropDollar > 0).length;

  return (
    <section className="results-band" aria-label="House prices over time">
      <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div>
          <span className="eyebrow">Longitudinal Price Tracking</span>
          <h2 style={{ fontSize: 'var(--fs-h2)', marginBottom: 6 }}>
            Bellport asking prices & reductions over time.
          </h2>
          <p style={{ fontSize: 15, color: 'var(--ink-2)', maxWidth: '68ch' }}>
            {reducedCount} tracked {reducedCount === 1 ? 'property has' : 'properties have'}{' '}
            trimmed asking prices since initial launch. Every daily sync appends new price changes
            automatically.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))',
            gap: 20,
          }}
        >
          {withStats.map(({ listing, stats, deal }) => (
            <div
              key={listing.id}
              style={{
                padding: 20,
                borderRadius: 'var(--radius)',
                border: '1px solid var(--line)',
                background: 'var(--surface)',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <h3
                    className="listing-card__address"
                    onClick={() => onOpenListing(listing.id)}
                  >
                    {listing.address}
                  </h3>
                  <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                    {listing.area} · {listing.daysOnMarket}d on market · Deal {deal.score} ({deal.tier})
                  </div>
                </div>

                {stats.totalDropDollar > 0 ? (
                  <span className="badge badge--village priv-val">
                    <TrendingDown size={13} />
                    <span>
                      -{stats.totalDropPct}% (${Math.round(stats.totalDropDollar / 1000)}k)
                    </span>
                  </span>
                ) : (
                  <span className="badge">Steady Ask</span>
                )}
              </div>

              <PriceHistoryChart listing={listing} privacyBlur={privacyBlur} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
