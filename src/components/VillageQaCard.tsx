import React, { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import {
  fetchLiveGeminiEnhancement,
  type VillageQaAnswer,
  type VillageQaContextValue,
} from '../lib/villageQa';

interface VillageQaCardProps {
  query: string;
  answer: VillageQaAnswer;
  qaCtx: VillageQaContextValue;
  onClear: () => void;
}

export const VillageQaCard: React.FC<VillageQaCardProps> = ({
  query,
  answer,
  qaCtx,
  onClear,
}) => {
  const [aiResult, setAiResult] = useState<{ query: string; text: string } | null>(null);
  const aiNote = aiResult?.query === query && qaCtx.geminiApiKey?.trim() ? aiResult.text : null;

  useEffect(() => {
    let active = true;
    if (!qaCtx.geminiApiKey?.trim()) return;
    const timer = window.setTimeout(() => {
      void fetchLiveGeminiEnhancement(query, answer.groundingDigest, qaCtx.geminiApiKey).then(
        (txt) => {
          if (active && txt) setAiResult({ query, text: txt });
        }
      );
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [answer.groundingDigest, qaCtx.geminiApiKey, query]);

  return (
    <div
      role="region"
      aria-label="Gemini Village Intelligence answer"
      style={{
        padding: '16px 18px',
        borderRadius: 18,
        background: 'linear-gradient(180deg, #f6f9fe 0%, #ffffff 100%)',
        border: '1px solid rgba(26, 115, 232, 0.28)',
        boxShadow: '0 6px 20px rgba(15, 37, 55, 0.06)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--accent)',
            }}
          >
            <Sparkles size={13} />
            <span>Bellport Village Intelligence</span>
          </span>
          <div
            style={{
              fontSize: 15.5,
              fontWeight: 600,
              lineHeight: 1.4,
              color: 'var(--ink)',
            }}
          >
            {answer.headline}
          </div>
        </div>

        <button
          type="button"
          onClick={onClear}
          aria-label="Clear question"
          style={{
            border: '1px solid var(--line)',
            background: '#ffffff',
            borderRadius: 999,
            width: 28,
            height: 28,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--ink-2)',
            flexShrink: 0,
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* 4-KPI Stat Tiles */}
      {answer.stats.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 8,
          }}
        >
          {answer.stats.map((st) => (
            <div
              key={st.label}
              style={{
                padding: '9px 11px',
                borderRadius: 12,
                background: '#ffffff',
                border: '1px solid var(--line)',
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--ink-2)', fontWeight: 500 }}>
                {st.label}
              </div>
              <div
                style={{
                  fontSize: 16.5,
                  fontWeight: 700,
                  color: '#0f2537',
                  marginTop: 2,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {st.value}
              </div>
              {st.sub && (
                <div style={{ fontSize: 11, color: 'var(--ink-2)', marginTop: 1 }}>{st.sub}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Active Search Parameters Evaluated */}
      {answer.parameterPills.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-2)' }}>
            Parameters evaluated:
          </span>
          {answer.parameterPills.map((p) => (
            <span
              key={p}
              style={{
                fontSize: 11.5,
                padding: '2px 9px',
                borderRadius: 999,
                background: '#e8f0fe',
                color: '#174ea6',
                fontWeight: 500,
              }}
            >
              {p}
            </span>
          ))}
        </div>
      )}

      {/* Optional Live Gemini Synthesis Note */}
      {aiNote && (
        <p
          style={{
            fontSize: 13.5,
            lineHeight: 1.55,
            color: 'var(--ink)',
            background: '#ffffff',
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid var(--line)',
            margin: 0,
          }}
        >
          {aiNote}
        </p>
      )}

      {/* Grounded Bullet Breakdown */}
      <ul
        style={{
          margin: 0,
          paddingLeft: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
          fontSize: 13,
          lineHeight: 1.5,
          color: 'var(--ink-2)',
        }}
      >
        {answer.bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>

      {/* Clickable Matching Home Pills */}
      {answer.homeLinks.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
            paddingTop: 4,
            borderTop: '1px dashed var(--line)',
          }}
        >
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-2)' }}>
            Inspect matching homes:
          </span>
          {answer.homeLinks.map((hl) => (
            <button
              key={`${hl.parcelId}-${hl.badge}`}
              type="button"
              onClick={() => qaCtx.onOpenHome(hl.parcelId)}
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                border: '1px solid var(--line-strong)',
                background: '#ffffff',
                color: 'var(--ink)',
                fontSize: 12,
                fontWeight: 500,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <strong>{hl.address}</strong>
              <span style={{ color: 'var(--accent)', fontSize: 11 }}>{hl.badge} →</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
