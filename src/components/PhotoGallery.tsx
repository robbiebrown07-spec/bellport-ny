import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ArchetypeIllustration } from '../types';
import { PropertyIllustration } from './PropertyIllustration';

interface PhotoGalleryProps {
  photos?: string[];
  photoUrl?: string;
  archetype: ArchetypeIllustration;
  address: string;
  styleName: string;
}

export const PhotoGallery: React.FC<PhotoGalleryProps> = ({
  photos,
  photoUrl,
  archetype,
  address,
  styleName,
}) => {
  const allUrls = React.useMemo(() => {
    const list = photos && photos.length > 0 ? photos : photoUrl ? [photoUrl] : [];
    return Array.from(new Set(list.filter(Boolean)));
  }, [photos, photoUrl]);

  const [index, setIndex] = useState(0);
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});

  const validPhotos = allUrls.filter((u) => !failedUrls[u]);

  if (validPhotos.length === 0) {
    return (
      <div
        style={{
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
          border: '1px solid var(--line)',
          aspectRatio: '16 / 10',
        }}
      >
        <PropertyIllustration archetype={archetype} address={address} styleName={styleName} />
      </div>
    );
  }

  const safeIdx = index % validPhotos.length;
  const activeUrl = validPhotos[safeIdx];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        style={{
          position: 'relative',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
          border: '1px solid var(--line)',
          aspectRatio: '16 / 10',
          background: 'var(--surface-subtle)',
        }}
      >
        <img
          src={activeUrl}
          alt={`${address} — photo ${safeIdx + 1} of ${validPhotos.length}`}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={() =>
            setFailedUrls((prev) => ({
              ...prev,
              [activeUrl]: true,
            }))
          }
        />

        {validPhotos.length > 1 && (
          <>
            <button
              type="button"
              onClick={() =>
                setIndex((prev) => (prev - 1 + validPhotos.length) % validPhotos.length)
              }
              aria-label="Previous photo"
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 38,
                height: 38,
                borderRadius: '50%',
                border: '1px solid var(--line)',
                background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChevronLeft size={18} />
            </button>

            <button
              type="button"
              onClick={() => setIndex((prev) => (prev + 1) % validPhotos.length)}
              aria-label="Next photo"
              style={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 38,
                height: 38,
                borderRadius: '50%',
                border: '1px solid var(--line)',
                background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChevronRight size={18} />
            </button>

            <span
              className="badge"
              style={{
                position: 'absolute',
                right: 12,
                bottom: 12,
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
              }}
            >
              {safeIdx + 1} / {validPhotos.length}
            </span>
          </>
        )}
      </div>

      {validPhotos.length > 1 && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            paddingBottom: 4,
          }}
        >
          {validPhotos.slice(0, 12).map((thumb, idx) => (
            <button
              key={thumb}
              type="button"
              onClick={() => setIndex(idx)}
              aria-label={`View photo ${idx + 1}`}
              style={{
                padding: 0,
                width: 64,
                height: 44,
                flexShrink: 0,
                borderRadius: 8,
                overflow: 'hidden',
                border: idx === safeIdx ? '2px solid var(--accent)' : '1px solid var(--line)',
                opacity: idx === safeIdx ? 1 : 0.72,
              }}
            >
              <img
                src={thumb}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
