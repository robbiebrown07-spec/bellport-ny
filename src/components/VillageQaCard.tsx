import React, { useEffect, useState } from 'react';
import { ExternalLink, KeyRound, Loader2, Send, Sparkles, X } from 'lucide-react';
import {
  askBellportGemini,
  type LiveGeminiResult,
  type QaChatTurn,
  type QaHomeLink,
  type VillageQaAnswer,
  type VillageQaContextValue,
} from '../lib/villageQa';

interface VillageQaCardProps {
  query: string;
  immediateTrigger: number;
  answer: VillageQaAnswer;
  qaCtx: VillageQaContextValue;
  onClear: () => void;
}

function renderInlineFormatting(line: string): React.ReactNode[] {
  const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={i}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.92em',
            padding: '1px 5px',
            borderRadius: 5,
            background: 'var(--surface-subtle)',
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function renderGeminiMarkdown(markdown: string): React.ReactNode {
  const lines = markdown.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let bulletBuffer: string[] = [];

  const flushBullets = (keyPrefix: string) => {
    if (bulletBuffer.length === 0) return;
    blocks.push(
      <ul
        key={`${keyPrefix}-ul`}
        style={{
          margin: '4px 0',
          paddingLeft: 19,
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
        }}
      >
        {bulletBuffer.map((item, idx) => (
          <li key={idx}>{renderInlineFormatting(item)}</li>
        ))}
      </ul>
    );
    bulletBuffer = [];
  };

  lines.forEach((rawLine, idx) => {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      flushBullets(`b-${idx}`);
      return;
    }
    const bulletMatch = trimmed.match(/^(?:[-*•]|\d+\.)\s+(.*)$/);
    if (bulletMatch) {
      bulletBuffer.push(bulletMatch[1]);
      return;
    }
    flushBullets(`b-${idx}`);
    const headingMatch = trimmed.match(/^#{1,4}\s+(.*)$/);
    if (headingMatch) {
      blocks.push(
        <div
          key={`h-${idx}`}
          style={{
            fontWeight: 700,
            fontSize: 14,
            color: '#0f2537',
            marginTop: blocks.length > 0 ? 6 : 0,
          }}
        >
          {renderInlineFormatting(headingMatch[1])}
        </div>
      );
      return;
    }
    blocks.push(
      <p key={`p-${idx}`} style={{ margin: 0 }}>
        {renderInlineFormatting(trimmed)}
      </p>
    );
  });

  flushBullets('final');
  return blocks;
}

interface QueryRunState {
  keySig: string;
  query: string;
  loading: boolean;
  streamingText?: string;
  result: LiveGeminiResult | null;
}

export const VillageQaCard: React.FC<VillageQaCardProps> = ({
  query,
  immediateTrigger,
  answer,
  qaCtx,
  onClear,
}) => {
  const trimmedQuery = query.trim();
  const activeKey = (qaCtx.geminiApiKey ?? '').trim();
  const keySig = activeKey ? activeKey.slice(-6) : 'nokey';

  const [runState, setRunState] = useState<QueryRunState | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [editingKey, setEditingKey] = useState(false);

  // Follow-up conversation thread anchored to the current initial query
  const [threadState, setThreadState] = useState<{
    rootQuery: string;
    turns: QaChatTurn[];
    loadingFollowUp: boolean;
  }>({ rootQuery: trimmedQuery, turns: [], loadingFollowUp: false });
  const [followUpInput, setFollowUpInput] = useState('');

  const effectiveTurns = threadState.rootQuery === trimmedQuery ? threadState.turns : [];
  const isFollowUpLoading =
    threadState.rootQuery === trimmedQuery && threadState.loadingFollowUp;

  useEffect(() => {
    if (!trimmedQuery) return;
    let active = true;
    const controller = new AbortController();
    const delayMs = immediateTrigger > 0 ? 0 : 280;

    const timer = window.setTimeout(() => {
      setRunState({ keySig, query: trimmedQuery, loading: true, streamingText: '', result: null });
      void askBellportGemini({
        question: trimmedQuery,
        contextBriefing: answer.groundingDigest,
        catalog: qaCtx.catalog,
        geminiApiKey: activeKey,
        signal: controller.signal,
        onStreamText: (partialText) => {
          if (!active || controller.signal.aborted) return;
          setRunState({
            keySig,
            query: trimmedQuery,
            loading: true,
            streamingText: partialText,
            result: null,
          });
        },
      }).then((res) => {
        if (!active || controller.signal.aborted) return;
        setRunState({
          keySig,
          query: trimmedQuery,
          loading: false,
          streamingText: res.text ?? '',
          result: res,
        });
      });
    }, delayMs);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [activeKey, answer.groundingDigest, immediateTrigger, keySig, qaCtx.catalog, trimmedQuery]);

  const isCurrentRun = runState?.query === trimmedQuery && runState?.keySig === keySig;
  const isLoadingPrimary = !isCurrentRun || runState.loading;
  const streamingPrimaryText = isCurrentRun ? (runState.streamingText ?? '') : '';
  const primaryResult = isCurrentRun ? runState.result : null;
  const livePrimaryText =
    primaryResult?.status === 'ok' && primaryResult.text
      ? primaryResult.text
      : isLoadingPrimary && streamingPrimaryText
        ? streamingPrimaryText
        : '';
  const hasGeminiContent = Boolean(livePrimaryText) || primaryResult?.status === 'ok';

  const handleSaveKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = keyDraft.trim();
    if (!clean || !qaCtx.onSaveGeminiKey) return;
    qaCtx.onSaveGeminiKey(clean);
    setKeyDraft('');
    setEditingKey(false);
  };

  const handleFollowUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextQ = followUpInput.trim();
    if (!nextQ || isFollowUpLoading || !primaryResult?.text) return;

    const baseHistory: QaChatTurn[] =
      effectiveTurns.length > 0
        ? effectiveTurns
        : [
            { role: 'user', text: trimmedQuery },
            {
              role: 'model',
              text: primaryResult.text,
              webSources: primaryResult.webSources,
              mentionedHomes: primaryResult.mentionedHomes,
              usedWebSearch: primaryResult.usedWebSearch,
            },
          ];

    const optimisticTurns: QaChatTurn[] = [...baseHistory, { role: 'user', text: nextQ }];
    setFollowUpInput('');
    setThreadState({
      rootQuery: trimmedQuery,
      turns: optimisticTurns,
      loadingFollowUp: true,
    });

    const reply = await askBellportGemini({
      question: nextQ,
      history: baseHistory,
      contextBriefing: answer.groundingDigest,
      catalog: qaCtx.catalog,
      geminiApiKey: activeKey,
      onStreamText: (partialText) => {
        setThreadState({
          rootQuery: trimmedQuery,
          turns: [...optimisticTurns, { role: 'model', text: partialText }],
          loadingFollowUp: true,
        });
      },
    });

    const replyTurn: QaChatTurn = {
      role: 'model',
      text:
        reply.status === 'ok' && reply.text
          ? reply.text
          : reply.errorMessage ?? 'Could not fetch a follow-up response.',
      webSources: reply.webSources,
      mentionedHomes: reply.mentionedHomes,
      usedWebSearch: reply.usedWebSearch,
    };

    setThreadState({
      rootQuery: trimmedQuery,
      turns: [...optimisticTurns, replyTurn],
      loadingFollowUp: false,
    });
  };

  // Combine mentioned homes from Gemini + local fallback homeLinks (deduplicated)
  const combinedHomeLinks: QaHomeLink[] = [];
  const seenPids = new Set<string>();
  const latestModelMentions =
    effectiveTurns.length > 0
      ? effectiveTurns
          .filter((t) => t.role === 'model')
          .flatMap((t) => t.mentionedHomes ?? [])
      : primaryResult?.mentionedHomes ?? [];

  for (const hl of [...latestModelMentions, ...answer.homeLinks]) {
    if (!hl.parcelId || seenPids.has(hl.parcelId)) continue;
    seenPids.add(hl.parcelId);
    combinedHomeLinks.push(hl);
    if (combinedHomeLinks.length >= 6) break;
  }

  const showKeyPrompt =
    editingKey || (!isLoadingPrimary && primaryResult?.status === 'needs_key');

  const badgeLabel =
    primaryResult?.status === 'ok'
      ? primaryResult.usedWebSearch
        ? 'Gemini 3.8 Flash · Live Web + Bellport Context'
        : 'Gemini 3.8 Flash · Bellport Advisor'
      : isLoadingPrimary && livePrimaryText
        ? 'Streaming Gemini 3.8 Flash…'
        : isLoadingPrimary && activeKey
          ? 'Asking Gemini 3.8 Flash…'
          : 'Bellport Village Intelligence';

  return (
    <div
      role="region"
      aria-label="Gemini Advisor answer"
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
      {/* Top Eyebrow + Headline + Close */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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
              <span>{badgeLabel}</span>
            </span>
            {activeKey && !editingKey && (
              <button
                type="button"
                onClick={() => setEditingKey(true)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--ink-2)',
                  fontSize: 11,
                  padding: 0,
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                API key settings
              </button>
            )}
          </div>

          {(!answer.isOffDatabase || !hasGeminiContent) && (
            <div
              style={{
                fontSize: 15.5,
                fontWeight: 600,
                lineHeight: 1.4,
                color: '#0f2537',
              }}
            >
              {answer.headline}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClear}
          aria-label="Close Gemini answer"
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

      {/* Brief Pre-Token Indicator (~0.4s before first word streams onto screen) */}
      {isLoadingPrimary && activeKey && !livePrimaryText && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '12px 14px',
            borderRadius: 12,
            background: '#ffffff',
            border: '1px solid var(--line)',
            fontSize: 13.5,
            color: 'var(--ink-2)',
          }}
        >
          <Loader2 size={16} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
          <span>Thinking with Gemini 3.8 Flash…</span>
        </div>
      )}

      {/* 1-Time Inline Gemini Key Setup (when no key is stored on device yet) */}
      {showKeyPrompt && qaCtx.onSaveGeminiKey && (
        <form
          onSubmit={handleSaveKeySubmit}
          style={{
            padding: '12px 14px',
            borderRadius: 14,
            background: '#ffffff',
            border: '1px solid rgba(26, 115, 232, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <strong
              style={{
                fontSize: 13,
                color: '#0f2537',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <KeyRound size={14} color="var(--accent)" />
              <span>
                {activeKey
                  ? 'Update Your Gemini API Key'
                  : 'Connect Live Gemini (1-time setup for open-ended questions)'}
              </span>
            </strong>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--accent)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>Get free key at Google AI Studio</span>
              <ExternalLink size={12} />
            </a>
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.45 }}>
            Paste your Gemini API key once to power <strong>Gemini 3.8 Flash</strong> semantic search
            &amp; open-ended reasoning (taxes, ARB historic rules, pool &amp; renovation costs,
            commute, comparisons). Stored privately on this device only.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder="Paste full Gemini key (AQ.… or AIza…)"
              autoComplete="off"
              style={{
                flex: '1 1 210px',
                height: 38,
                padding: '0 12px',
                borderRadius: 10,
                border: '1px solid var(--line-strong)',
                fontSize: 16,
                fontFamily: 'var(--font-mono)',
                background: '#ffffff',
                color: '#202124',
              }}
            />
            <button
              type="submit"
              className="icon-btn icon-btn--primary"
              disabled={!keyDraft.trim()}
              style={{ height: 38, fontWeight: 600 }}
            >
              <span>Connect &amp; Ask Gemini</span>
            </button>
            {editingKey && (
              <button
                type="button"
                className="icon-btn"
                onClick={() => setEditingKey(false)}
                style={{ height: 38 }}
              >
                <span>Cancel</span>
              </button>
            )}
          </div>
        </form>
      )}

      {/* Error State (e.g., invalid key or transient network error) */}
      {!isLoadingPrimary && primaryResult?.status === 'error' && (
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            background: '#fce8e6',
            border: '1px solid rgba(217, 48, 37, 0.25)',
            color: '#a50e0e',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <span>{primaryResult.errorMessage}</span>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setEditingKey(true)}
            style={{ background: '#ffffff' }}
          >
            <span>Check API Key</span>
          </button>
        </div>
      )}

      {/* Live Gemini Primary Answer (streams live word-by-word as tokens arrive) */}
      {Boolean(livePrimaryText) && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 9,
            fontSize: 13.8,
            lineHeight: 1.58,
            color: 'var(--ink)',
            background: '#ffffff',
            padding: '14px 16px',
            borderRadius: 14,
            border: '1px solid var(--line)',
          }}
        >
          {renderGeminiMarkdown(livePrimaryText)}

          {primaryResult?.webSources && primaryResult.webSources.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
                paddingTop: 8,
                marginTop: 2,
                borderTop: '1px dashed var(--line)',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)' }}>
                Grounded web sources:
              </span>
              {primaryResult.webSources.map((src) => (
                <a
                  key={src.uri}
                  href={src.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 11.5,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: 'var(--surface-subtle)',
                    border: '1px solid var(--line)',
                    color: 'var(--accent)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    textDecoration: 'none',
                  }}
                >
                  <span>{src.title.slice(0, 38)}</span>
                  <ExternalLink size={10} />
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Multi-Turn Follow-Up Thread */}
      {effectiveTurns.length > 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {effectiveTurns.slice(2).map((turn, idx) => (
            <div
              key={idx}
              style={{
                padding: turn.role === 'user' ? '8px 12px' : '12px 15px',
                borderRadius: 12,
                background: turn.role === 'user' ? '#e8f0fe' : '#ffffff',
                border: '1px solid var(--line)',
                fontSize: 13.5,
                lineHeight: 1.55,
                color: '#0f2537',
                alignSelf: turn.role === 'user' ? 'flex-end' : 'stretch',
                maxWidth: turn.role === 'user' ? '88%' : '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: 7,
              }}
            >
              {turn.role === 'user' ? (
                <strong>{turn.text}</strong>
              ) : (
                renderGeminiMarkdown(turn.text)
              )}
              {turn.webSources && turn.webSources.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 4 }}>
                  {turn.webSources.map((src) => (
                    <a
                      key={src.uri}
                      href={src.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 11,
                        color: 'var(--accent)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                    >
                      <span>{src.title.slice(0, 34)}</span>
                      <ExternalLink size={10} />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {isFollowUpLoading && effectiveTurns[effectiveTurns.length - 1]?.role === 'user' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12.5,
            color: 'var(--ink-2)',
            padding: '4px 2px',
          }}
        >
          <Loader2 size={14} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
          <span>Thinking through follow-up…</span>
        </div>
      )}

      {/* Local Village KPI Tiles (shown for dataset-backed questions or alongside Gemini) */}
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
            Search context:
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

      {/* Local Bullets (hidden once Live Gemini begins answering an open-ended off-DB question) */}
      {(!answer.isOffDatabase || !hasGeminiContent) && answer.bullets.length > 0 && (
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
      )}

      {/* Clickable Mentioned / Matching Village Homes */}
      {combinedHomeLinks.length > 0 && (
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
            Inspect homes:
          </span>
          {combinedHomeLinks.map((hl) => (
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

      {/* Multi-turn Follow-Up Bar (shown whenever Live Gemini has answered) */}
      {!isLoadingPrimary && primaryResult?.status === 'ok' && (
        <form
          onSubmit={(e) => void handleFollowUpSubmit(e)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            paddingTop: 4,
          }}
        >
          <input
            type="text"
            value={followUpInput}
            onChange={(e) => setFollowUpInput(e.target.value)}
            placeholder="Ask Gemini a follow-up question…"
            style={{
              flex: 1,
              minWidth: 0,
              height: 36,
              padding: '0 12px',
              borderRadius: 999,
              border: '1px solid var(--line-strong)',
              background: '#ffffff',
              color: '#202124',
              fontSize: 16,
            }}
          />
          <button
            type="submit"
            className="icon-btn icon-btn--primary"
            disabled={!followUpInput.trim() || isFollowUpLoading}
            style={{ height: 36, borderRadius: 999, padding: '0 14px', fontWeight: 600 }}
          >
            <Send size={13} />
            <span>Ask</span>
          </button>
        </form>
      )}
    </div>
  );
};
