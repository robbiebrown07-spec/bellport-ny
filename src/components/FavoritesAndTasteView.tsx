import React, { useState } from 'react';
import { Check, Copy, Heart, Sparkles } from 'lucide-react';
import type { Listing, PersistedAppState } from '../types';
import {
  evaluateAirbnbViability,
  evaluateGoodDeal,
  synthesizeArchitecturalTaste,
} from '../lib/intelligence';
import { PropertyIllustration } from './PropertyIllustration';

interface FavoritesAndTasteViewProps {
  listings: Listing[];
  aiTasteMemo?: PersistedAppState['aiTasteMemo'];
  onOpenListing: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onUpdateAiTasteMemo: (memo: PersistedAppState['aiTasteMemo']) => void;
}

export const FavoritesAndTasteView: React.FC<FavoritesAndTasteViewProps> = ({
  listings,
  aiTasteMemo,
  onOpenListing,
  onToggleFavorite,
  onUpdateAiTasteMemo,
}) => {
  const favorites = listings.filter((l) => l.isFavorite);
  const taste = synthesizeArchitecturalTaste(listings);
  const [copied, setCopied] = useState(false);
  const [refining, setRefining] = useState(false);
  const [refineNote, setRefineNote] = useState<string | null>(null);

  const favIdsSignature = favorites.map((f) => f.id).join(',');
  const geminiMemoMatchesCurrentFavs =
    aiTasteMemo && aiTasteMemo.basedOnIds.join(',') === favIdsSignature;

  const handleCopyBrief = async () => {
    if (!taste.brokerBrief) return;
    await navigator.clipboard.writeText(taste.brokerBrief);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleRefineWithGemini = async () => {
    setRefining(true);
    setRefineNote(null);
    try {
      const res = await fetch('/api/taste-profile', { method: 'POST' });
      const data = (await res.json()) as {
        memo?: PersistedAppState['aiTasteMemo'];
        usedFallback?: boolean;
        message?: string;
      };
      if (data.memo) {
        onUpdateAiTasteMemo(data.memo);
        setRefineNote('Refined with Gemini 2.5 Flash.');
      } else if (data.message) {
        setRefineNote(data.message);
      }
    } catch {
      setRefineNote('Using built-in architectural DNA synthesis.');
    } finally {
      setRefining(false);
    }
  };

  return (
    <section className="results-band" aria-label="Saved favorites and architectural taste">
      <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
        {/* Architectural Taste Profile Card */}
        <div
          style={{
            padding: 28,
            borderRadius: 'var(--radius)',
            background: 'var(--surface-subtle)',
            border: '1px solid var(--line)',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <span className="eyebrow">Architectural Taste Profile</span>
              <h2 style={{ fontSize: 'var(--fs-h2)', maxWidth: '28ch' }}>{taste.headline}</h2>
            </div>

            {favorites.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={handleRefineWithGemini}
                  disabled={refining}
                >
                  <Sparkles size={14} color="var(--accent)" />
                  <span>{refining ? 'Analyzing...' : 'Refine with Gemini'}</span>
                </button>
                {taste.brokerBrief && (
                  <button type="button" className="icon-btn" onClick={handleCopyBrief}>
                    {copied ? <Check size={14} color="var(--g-green-600)" /> : <Copy size={14} />}
                    <span>{copied ? 'Copied Broker Brief' : 'Copy Broker Brief'}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <p style={{ fontSize: 16, color: 'var(--ink-2)', maxWidth: '75ch', lineHeight: 1.65 }}>
            {geminiMemoMatchesCurrentFavs ? aiTasteMemo.text : taste.narrative}
          </p>

          {refineNote && (
            <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{refineNote}</span>
          )}

          {taste.signatureTraits.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {taste.signatureTraits.map(({ trait, count }) => (
                <span
                  key={trait}
                  className="badge"
                  style={{ background: 'var(--surface)', padding: '5px 12px' }}
                >
                  {trait}
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                    {count}/{favorites.length}
                  </span>
                </span>
              ))}
            </div>
          )}

          {taste.brokerBrief && (
            <div
              style={{
                padding: '14px 16px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                fontSize: 14,
                color: 'var(--ink-2)',
              }}
            >
              <strong style={{ color: 'var(--ink)', display: 'block', marginBottom: 4 }}>
                Ready-to-Send Bellport Broker Brief
              </strong>
              &ldquo;{taste.brokerBrief}&rdquo;
            </div>
          )}
        </div>

        {/* Saved Favorites Grid */}
        <div>
          <h2 style={{ fontSize: 24, marginBottom: 16 }}>
            Saved Favorite Listings ({favorites.length})
          </h2>

          {favorites.length === 0 ? (
            <div className="empty-state">
              <p style={{ color: 'var(--ink-2)' }}>
                Click the heart (♥) button on any listing card to save your favorites here and
                build your architectural taste profile.
              </p>
            </div>
          ) : (
            <div className="listing-grid">
              {favorites.map((item) => {
                const deal = evaluateGoodDeal(item, listings);
                const airbnb = evaluateAirbnbViability(item);

                return (
                  <article key={item.id} className="listing-card">
                    <div
                      className="listing-card__media"
                      onClick={() => onOpenListing(item.id)}
                    >
                      <PropertyIllustration
                        archetype={item.archetype}
                        address={item.address}
                        styleName={item.style}
                        photoUrl={item.photos?.[0] ?? item.photoUrl}
                      />
                      <div className="listing-card__badges">
                        <span className="badge badge--village">
                          Deal {deal.score} · {deal.tier}
                        </span>
                        <button
                          type="button"
                          className="status-dot-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(item.id);
                          }}
                          aria-label={`Remove ${item.address} from favorites`}
                        >
                          <Heart size={14} fill="var(--g-red)" color="var(--g-red)" />
                          <span>Saved</span>
                        </button>
                      </div>
                    </div>

                    <div className="listing-card__body">
                      <div>
                        <span className="listing-card__price priv-val">
                          ${item.price.toLocaleString()}
                        </span>
                        <h3
                          className="listing-card__address"
                          onClick={() => onOpenListing(item.id)}
                        >
                          {item.address}
                        </h3>
                        <div className="listing-card__sub">
                          <span>{item.area}</span>
                          <span>·</span>
                          <span>{item.style}</span>
                        </div>
                      </div>

                      <div className="listing-card__specs">
                        <div>
                          <strong>
                            {item.beds}/{item.baths}
                          </strong>
                          <span>Bd/Ba</span>
                        </div>
                        <div>
                          <strong>{item.sqft.toLocaleString()}</strong>
                          <span>Sq Ft</span>
                        </div>
                        <div>
                          <strong>{item.lotAcres}</strong>
                          <span>Acres</span>
                        </div>
                        <div>
                          <strong className="priv-val">
                            ~${Math.round(airbnb.estAugustGross / 1000)}k
                          </strong>
                          <span>Aug Rent</span>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {/* Unsaved Recommendations Matching Your Architectural DNA */}
        {taste.recommendations.length > 0 && (
          <div>
            <span className="eyebrow">Discovery</span>
            <h2 style={{ fontSize: 22, marginBottom: 6 }}>
              Other Listings Matching Your Architectural DNA
            </h2>
            <p style={{ fontSize: 14, color: 'var(--ink-2)', marginBottom: 18 }}>
              Unsaved homes in your tracker that share rooflines, materials, or outdoor traits with
              your favorites.
            </p>
            <div className="listing-grid">
              {taste.recommendations.map(({ listing, matchPct, sharedTraits }) => (
                <article key={listing.id} className="listing-card">
                  <div className="listing-card__body">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="badge badge--village">{matchPct}% Taste Match</span>
                      <button
                        type="button"
                        className="status-dot-btn"
                        onClick={() => onToggleFavorite(listing.id)}
                      >
                        <Heart size={13} />
                        <span>Save</span>
                      </button>
                    </div>
                    <h3
                      className="listing-card__address"
                      onClick={() => onOpenListing(listing.id)}
                    >
                      {listing.address}
                    </h3>
                    <div className="listing-card__sub">
                      <span className="priv-val">${listing.price.toLocaleString()}</span>
                      <span>·</span>
                      <span>{listing.style}</span>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                      Shares: {sharedTraits.join(', ')}.
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
