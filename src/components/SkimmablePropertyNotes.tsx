import React, { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Listing } from '../types';

interface SkimmablePropertyNotesProps {
  text: string;
  listing?: Listing;
  compact?: boolean;
}

export interface PropertyConcern {
  title: string;
  detail: string;
}

function getPropertyConcerns(listing?: Listing): PropertyConcern[] {
  if (!listing) return [];
  const concerns: PropertyConcern[] = [];
  const addrL = listing.address.toLowerCase();
  const descL = `${listing.description} ${listing.styleSummary ?? ''}`.toLowerCase();
  const lat = listing.latitude ?? 40.756;
  const lon = listing.longitude ?? -72.939;

  // 1. Busy commercial or collector road check
  if (/\b(s\.?\s*country|south\s+country|so\s+country|main\s+st)\b/i.test(addrL)) {
    if (lon >= -72.9418 && lon <= -72.9362) {
      concerns.push({
        title: 'Busy commercial road frontage',
        detail:
          'Sits directly along the Main Street / South Country Road commercial district with steady retail foot traffic and through-commuters.',
      });
    } else {
      concerns.push({
        title: 'Through-road traffic (South Country Rd)',
        detail:
          'Fronts on South Country Road (CR-36), the Village’s primary east-west arterial road, bringing more road noise than side lanes.',
      });
    }
  } else if (/\bstation\s+(?:rd|ct)\b/i.test(addrL)) {
    concerns.push({
      title: 'Busy collector road (Station Rd)',
      detail:
        'Located along Station Road, the main north-south connector linking the commercial district, LIRR station, and Montauk Highway.',
    });
  }

  // 2. High-risk coastal flood zone check
  if (listing.floodZone === 'VE' || lat < 40.7432) {
    concerns.push({
      title: 'High-risk coastal wave flood zone (FEMA VE)',
      detail:
        'Exposed bayfront elevation subject to storm-surge wave action, mandatory flood insurance, and stricter FEMA coastal building rules.',
    });
  } else if (listing.floodZone === 'AE' || lat < 40.7478) {
    concerns.push({
      title: 'High-risk 100-year flood zone (FEMA AE)',
      detail:
        'Low-lying coastal elevation near Bellport Bay or tidal creeks carries elevated storm-surge risk and flood insurance costs.',
    });
  }

  // 3. Northern rail / highway edge check
  if (lat >= 40.7648) {
    concerns.push({
      title: 'Northern Village edge / rail proximity',
      detail:
        'Situated near the northern Village border close to the LIRR Montauk Branch corridor and farther from the Bay.',
    });
  }

  // 4. Tight lot for adding a pool (if no pool currently exists)
  const hasPool =
    listing.features.some((f) => f === 'pool' || f.toLowerCase().includes('pool')) ||
    /\b(gunite|inground\s+pool|in-ground\s+pool|heated\s+pool|swimming\s+pool)\b/.test(descL);
  if (!hasPool && listing.lotAcres > 0 && listing.lotAcres < 0.24) {
    concerns.push({
      title: `Tight ${listing.lotAcres}-acre lot for adding a pool`,
      detail:
        'Smaller parcel dimensions may make Village side/rear pool setbacks challenging without a variance.',
    });
  }

  // 5. Condition / renovation watch-out
  if (/\b(needs\s+some\s+tlc|tlc|fixer|as[-\s]?is|handyman|estate\s+condition)\b/.test(descL)) {
    concerns.push({
      title: 'Renovation CapEx likely needed',
      detail:
        'Remarks signal dated systems or "TLC / as-is" condition — budget for post-closing renovation.',
    });
  }

  return concerns;
}

const KEYWORD_REGEX = new RegExp(
  '(' +
    [
      '\\b\\d+(?:\\.\\d+)?[-\\s]?acres?\\b',
      '\\b[\\d,]{3,5}\\s*(?:sq\\.?\\s*ft\\.?|square\\s+feet|ft²)\\b',
      '\\b(?:heated\\s+gunite\\s+pool|gunite\\s+pool|in-ground\\s+pool|inground\\s+pool|saltwater\\s+pool|heated\\s+pool|swimming\\s+pool|room\\s+for\\s+(?:a\\s+)?pool|space\\s+for\\s+(?:a\\s+)?pool|pool\\s+house)\\b',
      '\\b(?:cedar[-\\s]?shingled?|shingle[-\\s]?style|clapboard|dutch\\s+gambrel|gambrel|greek\\s+revival|colonial|cape\\s+cod|victorian|modern\\s+barn|farmhouse|mid-century)\\b',
      '\\b(?:carriage\\s+(?:house|barn)|guest\\s+(?:cottage|house|quarters|suite)|detached\\s+(?:studio|garage|barn)|separate\\s+living\\s+quarters)\\b',
      '\\b(?:chef[’\']?s\\s+kitchen|primary\\s+suite|first-floor\\s+primary|wood-burning\\s+fireplaces?|fireplaces?|screened\\s+porch|wrap-?around\\s+porch|sunroom|full\\s+basement|finished\\s+basement|wide-plank|hardwood\\s+floors|central\\s+air|renovated|turnkey|new\\s+construction)\\b',
      '\\b(?:waterfront|bayfront|private\\s+dock|bulkhead|bellport\\s+bay|great\\s+south\\s+bay|ho-hum\\s+beach|village\\s+marina|bellport\\s+country\\s+club|south\\s+of\\s+(?:south\\s+country|main)|below\\s+south\\s+country|bellport\\s+lane|browns\\s+lane|privet\\s+hedges?|flood\\s+zone\\s+x)\\b',
    ].join('|') +
    ')',
  'gi'
);

function splitIntoReadableBullets(raw: string): string[] {
  const cleaned = (raw || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  const protectedText = cleaned
    .replace(/\b(St|Rd|Ln|Dr|Ave|Ct|Pl|Mr|Mrs|Ms|Approx|Est|Ft|Ac|Sq|No)\./gi, '$1__DOT__')
    .replace(/\b([NSWE])\./g, '$1__DOT__');

  const rawSentences = protectedText
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
    .map((s) => s.replace(/__DOT__/g, '.').trim())
    .filter(Boolean);

  if (rawSentences.length <= 1) {
    const semi = cleaned
      .split(/\s*[;•]\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (semi.length > 1) return semi;
    return [cleaned];
  }

  const bullets: string[] = [];
  let buf = '';
  for (const sent of rawSentences) {
    if (!buf) {
      buf = sent;
    } else if (buf.length < 75 && buf.length + sent.length < 185) {
      buf = `${buf} ${sent}`;
    } else {
      bullets.push(buf);
      buf = sent;
    }
  }
  if (buf) bullets.push(buf);
  return bullets;
}

function renderBoldedKeywords(sentence: string): React.ReactNode[] {
  const parts = sentence.split(KEYWORD_REGEX);
  return parts.map((part, idx) => {
    if (!part) return null;
    if (idx % 2 === 1) {
      return (
        <strong key={idx} style={{ color: 'var(--ink)', fontWeight: 600 }}>
          {part}
        </strong>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export const SkimmablePropertyNotes: React.FC<SkimmablePropertyNotesProps> = ({
  text,
  listing,
  compact = false,
}) => {
  const bullets = useMemo(() => splitIntoReadableBullets(text), [text]);
  const concerns = useMemo(() => getPropertyConcerns(listing), [listing]);

  if (bullets.length === 0 && concerns.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 8 : 12 }}>
      {bullets.length === 1 && bullets[0].length < 150 ? (
        <p
          style={{
            fontSize: compact ? 12.5 : 14,
            lineHeight: 1.58,
            color: 'var(--ink-2)',
            margin: 0,
          }}
        >
          {renderBoldedKeywords(bullets[0])}
        </p>
      ) : bullets.length > 0 ? (
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: compact ? 6 : 8,
            fontSize: compact ? 12.5 : 14,
            lineHeight: 1.56,
            color: 'var(--ink-2)',
          }}
        >
          {bullets.map((b, i) => (
            <li key={i}>{renderBoldedKeywords(b)}</li>
          ))}
        </ul>
      ) : null}

      {concerns.length > 0 && (
        <div
          style={{
            padding: compact ? '9px 11px' : '12px 14px',
            borderRadius: 12,
            background: '#fef7e0',
            border: '1px solid rgba(251, 188, 4, 0.45)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11.5,
              fontWeight: 700,
              color: '#b06000',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
            }}
          >
            <AlertTriangle size={13} />
            <span>Potential Concerns to Note</span>
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 17,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              fontSize: compact ? 12 : 13,
              lineHeight: 1.48,
              color: '#3c4043',
            }}
          >
            {concerns.map((c) => (
              <li key={c.title}>
                <strong style={{ color: '#202124' }}>{c.title}:</strong> {c.detail}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
