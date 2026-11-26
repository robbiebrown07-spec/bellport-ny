import React, { useState } from 'react';
import { Maximize2 } from 'lucide-react';
import type { ArchetypeIllustration } from '../types';
import { PhotoLightbox } from './PhotoLightbox';

interface PropertyIllustrationProps {
  archetype: ArchetypeIllustration;
  address: string;
  styleName: string;
  photoUrl?: string;
  photos?: string[];
}

export const PropertyIllustration: React.FC<PropertyIllustrationProps> = ({
  archetype,
  address,
  styleName,
  photoUrl,
  photos,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (photoUrl && !imgFailed) {
    const gallery =
      photos && photos.length > 0 ? Array.from(new Set(photos.filter(Boolean))) : [photoUrl];
    return (
      <>
        <img
          src={photoUrl}
          alt={`${address} — ${styleName} in Bellport Village, NY`}
          loading="lazy"
          onError={() => setImgFailed(true)}
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setLightboxOpen(true);
          }}
          title="Expand photo full screen"
          aria-label={`Expand ${address} photo full screen`}
          style={{
            position: 'absolute',
            right: 10,
            bottom: 10,
            zIndex: 4,
            width: 30,
            height: 30,
            borderRadius: 999,
            border: '1px solid rgba(255, 255, 255, 0.36)',
            background: 'rgba(15, 37, 55, 0.72)',
            color: '#ffffff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          }}
        >
          <Maximize2 size={13} />
        </button>
        {lightboxOpen && (
          <PhotoLightbox
            photos={gallery}
            initialIndex={0}
            address={address}
            onClose={() => setLightboxOpen(false)}
          />
        )}
      </>
    );
  }

  return (
    <svg
      viewBox="0 0 400 250"
      role="img"
      aria-label={`Architectural elevation of ${address} (${styleName})`}
      preserveAspectRatio="xMidYMid slice"
    >
      {archetype === 'colonial' && (
        <>
          <rect width="400" height="250" fill="#eef4fb" />
          <circle cx="332" cy="52" r="22" fill="#fef0b8" />
          {/* Mature Bellport Lane Elm canopies */}
          <circle cx="58" cy="115" r="56" fill="#cde5d3" />
          <circle cx="352" cy="122" r="48" fill="#d7ecdc" />
          <rect x="53" y="148" width="9" height="58" fill="#7a6f64" />
          <rect x="348" y="152" width="8" height="54" fill="#7a6f64" />
          {/* Lawn & privet hedge */}
          <rect x="0" y="198" width="400" height="52" fill="#dbeee0" />
          {/* 1890s White Clapboard Colonial */}
          <polygon points="105,106 200,56 295,106" fill="#5f6368" />
          <rect x="160" y="45" width="12" height="24" fill="#d93025" />
          <rect x="116" y="106" width="168" height="92" fill="#ffffff" stroke="#dadce0" strokeWidth="1.5" />
          {/* Windows & black shutters */}
          {[134, 191, 248].map((x) => (
            <g key={x}>
              <rect x={x - 5} y="120" width="5" height="24" fill="#3c4043" />
              <rect x={x} y="120" width="18" height="24" fill="#e8f0fe" stroke="#5f6368" strokeWidth="1" />
              <rect x={x + 18} y="120" width="5" height="24" fill="#3c4043" />
            </g>
          ))}
          {[134, 248].map((x) => (
            <g key={`b-${x}`}>
              <rect x={x - 5} y="158" width="5" height="26" fill="#3c4043" />
              <rect x={x} y="158" width="18" height="26" fill="#e8f0fe" stroke="#5f6368" strokeWidth="1" />
              <rect x={x + 18} y="158" width="5" height="26" fill="#3c4043" />
            </g>
          ))}
          {/* Center entry portico */}
          <polygon points="182,152 200,141 218,152" fill="#f1f3f4" stroke="#dadce0" />
          <rect x="191" y="156" width="18" height="42" fill="#1a73e8" rx="2" />
          {/* Privet hedge */}
          <rect x="24" y="188" width="76" height="16" rx="8" fill="#34a853" />
          <rect x="300" y="188" width="76" height="16" rx="8" fill="#34a853" />
        </>
      )}

      {archetype === 'shingle-pool' && (
        <>
          <rect width="400" height="250" fill="#edf6f2" />
          <circle cx="72" cy="48" r="20" fill="#fde293" />
          {/* Tall Country Club privet backdrop */}
          <rect x="0" y="158" width="400" height="40" fill="#b7dfbe" />
          <rect x="0" y="190" width="400" height="60" fill="#e8eaed" />
          {/* Cedar-shingle house */}
          <polygon points="78,108 175,58 272,108" fill="#80868b" />
          <polygon points="245,124 302,94 348,124" fill="#9aa0a6" />
          <rect x="92" y="108" width="166" height="82" fill="#d2c6b8" stroke="#b5a795" />
          <rect x="254" y="124" width="82" height="66" fill="#dfd5c9" stroke="#b5a795" />
          {/* Sunroom & French doors */}
          {[112, 152, 192].map((x) => (
            <rect key={x} x={x} y="146" width="24" height="44" fill="#e8f0fe" stroke="#ffffff" strokeWidth="2" />
          ))}
          {[116, 162, 208].map((x) => (
            <rect key={`u-${x}`} x={x} y="118" width="16" height="18" fill="#e8f0fe" stroke="#ffffff" strokeWidth="1.5" />
          ))}
          {/* Heated Gunite Pool */}
          <polygon points="108,204 298,204 322,236 84,236" fill="#4285f4" stroke="#ffffff" strokeWidth="4" />
          <line x1="100" y1="216" x2="306" y2="216" stroke="#8ab4f8" strokeWidth="1.5" />
        </>
      )}

      {archetype === 'bayfront' && (
        <>
          <rect width="400" height="175" fill="#e8f0fe" />
          <circle cx="318" cy="64" r="26" fill="#fbbc04" opacity="0.78" />
          {/* Bellport Bay water */}
          <rect x="0" y="175" width="400" height="75" fill="#1a73e8" />
          <path d="M0 192 Q100 185 200 192 T400 192" fill="none" stroke="#8ab4f8" strokeWidth="2" />
          {/* Distant Fire Island / Ho-Hum dune */}
          <path d="M235 175 Q310 164 400 175 Z" fill="#f6e3ba" />
          {/* Sailboat */}
          <polygon points="338,142 338,169 354,169" fill="#ffffff" />
          <line x1="336" y1="170" x2="356" y2="170" stroke="#ea4335" strokeWidth="3" />
          {/* Elevated Waterfront Shingle House */}
          <rect x="0" y="160" width="250" height="22" fill="#ceead6" />
          <polygon points="48,98 135,50 222,98" fill="#5f6368" />
          <rect x="62" y="98" width="146" height="66" fill="#cbbba8" />
          {[80, 118, 156].map((x) => (
            <rect key={x} x={x} y="112" width="24" height="26" fill="#fef7e0" stroke="#ffffff" strokeWidth="2" />
          ))}
          {/* Private timber dock */}
          <rect x="148" y="164" width="22" height="58" fill="#c5a882" />
          <line x1="148" y1="164" x2="148" y2="222" stroke="#8d6e4c" strokeWidth="3" />
          <line x1="170" y1="164" x2="170" y2="222" stroke="#8d6e4c" strokeWidth="3" />
        </>
      )}

      {archetype === 'modern-barn' && (
        <>
          <rect width="400" height="250" fill="#f1f5f2" />
          {/* Wooded East Lanes oaks */}
          <circle cx="72" cy="118" r="54" fill="#ceead6" />
          <circle cx="336" cy="112" r="58" fill="#a8dab5" opacity="0.65" />
          <rect x="0" y="196" width="400" height="54" fill="#dce8df" />
          {/* Standing seam pitched modern barn */}
          <polygon points="96,122 184,52 272,122" fill="#202124" />
          <rect x="108" y="122" width="152" height="76" fill="#c99b6b" />
          {/* Double-height steel casement glazing */}
          <polygon points="154,122 184,78 214,122" fill="#e8f0fe" stroke="#202124" strokeWidth="3" />
          <rect x="144" y="128" width="80" height="70" fill="#e8f0fe" stroke="#202124" strokeWidth="3" />
          <line x1="184" y1="78" x2="184" y2="198" stroke="#202124" strokeWidth="2.5" />
          <line x1="144" y1="162" x2="224" y2="162" stroke="#202124" strokeWidth="2.5" />
          {/* Mahogany deck */}
          <rect x="96" y="196" width="184" height="8" fill="#8c5832" />
        </>
      )}

      {archetype === 'victorian' && (
        <>
          <rect width="400" height="250" fill="#f6f3ee" />
          <circle cx="64" cy="126" r="46" fill="#ceead6" />
          <rect x="0" y="198" width="400" height="52" fill="#d7ecdc" />
          {/* Dutch Gambrel main house + guest cottage */}
          <polygon points="74,116 106,72 194,72 226,116" fill="#5f6368" />
          <polygon points="106,72 150,48 194,72" fill="#5f6368" />
          <rect x="84" y="116" width="132" height="82" fill="#d6c7b2" />
          {/* Wrap-around porch */}
          <rect x="72" y="152" width="156" height="6" fill="#ffffff" />
          {[80, 115, 150, 185, 220].map((x) => (
            <rect key={x} x={x} y="158" width="4" height="40" fill="#ffffff" />
          ))}
          {[104, 144, 180].map((x) => (
            <rect key={`vw-${x}`} x={x} y="88" width="16" height="22" fill="#fef7e0" stroke="#ffffff" strokeWidth="1.5" />
          ))}
          {/* Separate Guest Cottage */}
          <polygon points="262,144 306,114 350,144" fill="#5f6368" />
          <rect x="270" y="144" width="72" height="54" fill="#e2d6c5" />
          <rect x="296" y="162" width="18" height="36" fill="#34a853" rx="2" />
        </>
      )}

      {archetype === 'cottage' && (
        <>
          <rect width="400" height="250" fill="#f4f7fb" />
          <circle cx="328" cy="58" r="19" fill="#fde293" />
          <circle cx="76" cy="134" r="44" fill="#ceead6" />
          <circle cx="328" cy="140" r="40" fill="#ceead6" />
          <rect x="0" y="198" width="400" height="52" fill="#dbeee0" />
          {/* Village Cottage */}
          <polygon points="108,128 200,74 292,128" fill="#80868b" />
          <rect x="122" y="128" width="156" height="70" fill="#ffffff" stroke="#dadce0" />
          <rect x="190" y="154" width="20" height="44" fill="#ea4335" rx="2" />
          <rect x="140" y="146" width="28" height="26" fill="#e8f0fe" stroke="#5f6368" />
          <rect x="232" y="146" width="28" height="26" fill="#e8f0fe" stroke="#5f6368" />
          {/* Hydrangea bushes */}
          <circle cx="136" cy="194" r="11" fill="#8ab4f8" />
          <circle cx="154" cy="196" r="9" fill="#aecbfa" />
          <circle cx="248" cy="195" r="11" fill="#8ab4f8" />
        </>
      )}
    </svg>
  );
};
