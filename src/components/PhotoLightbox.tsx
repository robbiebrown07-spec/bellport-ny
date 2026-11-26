import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface PhotoLightboxProps {
  photos: string[];
  initialIndex?: number;
  address: string;
  onClose: () => void;
}

export const PhotoLightbox: React.FC<PhotoLightboxProps> = ({
  photos,
  initialIndex = 0,
  address,
  onClose,
}) => {
  const [idx, setIdx] = useState(initialIndex);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowLeft' && photos.length > 1) {
        e.preventDefault();
        e.stopPropagation();
        setIdx((p) => (p - 1 + photos.length) % photos.length);
      } else if (e.key === 'ArrowRight' && photos.length > 1) {
        e.preventDefault();
        e.stopPropagation();
        setIdx((p) => (p + 1) % photos.length);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, photos.length]);

  if (typeof document === 'undefined' || photos.length === 0) return null;

  const safeIdx = ((idx % photos.length) + photos.length) % photos.length;
  const activeUrl = photos[safeIdx];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Full-screen photo of ${address}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2500,
        background: 'rgba(8, 16, 24, 0.94)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
        paddingLeft: 16,
        paddingRight: 16,
      }}
    >
      {/* Top Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          color: '#ffffff',
          zIndex: 2,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 15,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {address}
          </div>
          {photos.length > 1 && (
            <div style={{ fontSize: 12, color: 'rgba(226, 236, 246, 0.76)' }}>
              Photo {safeIdx + 1} of {photos.length}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close full-screen photo"
          style={{
            width: 42,
            height: 42,
            borderRadius: '50%',
            border: '1px solid rgba(255, 255, 255, 0.24)',
            background: 'rgba(255, 255, 255, 0.12)',
            color: '#ffffff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Main Full-Screen Image Stage */}
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        style={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 0,
          margin: '12px 0',
        }}
      >
        <img
          src={activeUrl}
          alt={`${address} — photo ${safeIdx + 1}`}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
            borderRadius: 10,
            boxShadow: '0 16px 48px rgba(0, 0, 0, 0.5)',
            userSelect: 'none',
          }}
        />

        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIdx((p) => (p - 1 + photos.length) % photos.length);
              }}
              aria-label="Previous photo"
              style={{
                position: 'absolute',
                left: 6,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 44,
                height: 44,
                borderRadius: '50%',
                border: '1px solid rgba(255, 255, 255, 0.24)',
                background: 'rgba(15, 37, 55, 0.72)',
                color: '#ffffff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChevronLeft size={22} />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIdx((p) => (p + 1) % photos.length);
              }}
              aria-label="Next photo"
              style={{
                position: 'absolute',
                right: 6,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 44,
                height: 44,
                borderRadius: '50%',
                border: '1px solid rgba(255, 255, 255, 0.24)',
                background: 'rgba(15, 37, 55, 0.72)',
                color: '#ffffff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChevronRight size={22} />
            </button>
          </>
        )}
      </div>

      {/* Bottom Thumbnail Strip */}
      {photos.length > 1 ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 8,
            overflowX: 'auto',
            paddingBottom: 2,
          }}
        >
          {photos.map((thumb, i) => (
            <button
              key={thumb}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`Jump to photo ${i + 1}`}
              style={{
                padding: 0,
                width: 58,
                height: 40,
                flexShrink: 0,
                borderRadius: 7,
                overflow: 'hidden',
                border:
                  i === safeIdx
                    ? '2px solid #ffffff'
                    : '1px solid rgba(255, 255, 255, 0.25)',
                opacity: i === safeIdx ? 1 : 0.55,
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
      ) : (
        <div />
      )}
    </div>,
    document.body
  );
};
