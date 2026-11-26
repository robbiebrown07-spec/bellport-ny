import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from 'lucide-react';

interface PhotoLightboxProps {
  photos: string[];
  initialIndex?: number;
  address: string;
  onClose: () => void;
}

/**
 * Upgrades small MLS thumbnail URLs (e.g. Zillow `-p_f.jpg` 192px or Realtor `od.jpg`)
 * to full-HD high-resolution WebP/JPEG variants when expanding full screen,
 * with automatic fallback to the original URL if a CDN variant is unavailable.
 */
function upgradePhotoToHighRes(url: string): string {
  if (!url) return url;
  // Zillow CDN: `-p_c.jpg`, `-p_d.jpg`, `-p_e.jpg`, `-p_f.jpg`, `-cc_ft_384.webp`, `-cc_ft_576.webp`, `-cc_ft_768.webp`
  if (/photos\.zillowstatic\.com\/fp\//i.test(url)) {
    return url.replace(
      /-(?:p_[a-z]|cc_ft_\d+|uncropped_scaled_within_\d+_\d+)\.(?:jpg|jpeg|webp|png)$/i,
      '-uncropped_scaled_within_1536_1152.webp'
    );
  }
  // Realtor / rdcpix CDN: `...od.jpg` -> `...od-w1280_h960_x2.webp`
  if (/ap\.rdcpix\.com\//i.test(url) && /od\.(?:jpg|jpeg|webp)$/i.test(url)) {
    return url.replace(/od\.(?:jpg|jpeg|webp)$/i, 'od-w1280_h960_x2.webp');
  }
  return url;
}

export const PhotoLightbox: React.FC<PhotoLightboxProps> = ({
  photos,
  initialIndex = 0,
  address,
  onClose,
}) => {
  const [idx, setIdx] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const [failedHighRes, setFailedHighRes] = useState<Record<string, boolean>>({});
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTapRef = useRef<number>(0);

  const goPrev = () => {
    setZoomed(false);
    setIdx((p) => (p - 1 + photos.length) % photos.length);
  };

  const goNext = () => {
    setZoomed(false);
    setIdx((p) => (p + 1) % photos.length);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowLeft' && photos.length > 1) {
        e.preventDefault();
        e.stopPropagation();
        setZoomed(false);
        setIdx((p) => (p - 1 + photos.length) % photos.length);
      } else if (e.key === 'ArrowRight' && photos.length > 1) {
        e.preventDefault();
        e.stopPropagation();
        setZoomed(false);
        setIdx((p) => (p + 1) % photos.length);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, photos.length]);

  if (typeof document === 'undefined' || photos.length === 0) return null;

  const safeIdx = ((idx % photos.length) + photos.length) % photos.length;
  const rawUrl = photos[safeIdx];
  const highResUrl = upgradePhotoToHighRes(rawUrl);
  const displayUrl = failedHighRes[rawUrl] ? rawUrl : highResUrl;

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
        background: 'rgba(6, 12, 18, 0.97)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
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
          padding: '0 14px',
          zIndex: 3,
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
            <div style={{ fontSize: 12, color: 'rgba(226, 236, 246, 0.78)' }}>
              Photo {safeIdx + 1} of {photos.length} · Swipe or double-tap to zoom
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setZoomed((z) => !z)}
            aria-label={zoomed ? 'Zoom out photo' : 'Zoom in photo'}
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: '1px solid rgba(255, 255, 255, 0.24)',
              background: zoomed ? 'rgba(26, 115, 232, 0.75)' : 'rgba(255, 255, 255, 0.12)',
              color: '#ffffff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {zoomed ? <ZoomOut size={18} /> : <ZoomIn size={18} />}
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close full-screen photo"
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              border: '1px solid rgba(255, 255, 255, 0.24)',
              background: 'rgba(255, 255, 255, 0.14)',
              color: '#ffffff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Main Edge-to-Edge Full-Screen Image Stage */}
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        onTouchStart={(e) => {
          if (e.touches.length === 1) {
            touchStartRef.current = {
              x: e.touches[0].clientX,
              y: e.touches[0].clientY,
              time: Date.now(),
            };
          }
        }}
        onTouchEnd={(e) => {
          const start = touchStartRef.current;
          touchStartRef.current = null;
          if (!start || e.changedTouches.length === 0) return;
          const dx = e.changedTouches[0].clientX - start.x;
          const dy = e.changedTouches[0].clientY - start.y;
          const dt = Date.now() - start.time;

          // Swipe left/right between photos when not zoomed
          if (!zoomed && photos.length > 1 && Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.3) {
            if (dx < 0) goNext();
            else goPrev();
            return;
          }

          // Double-tap to toggle 2x zoom
          if (Math.abs(dx) < 14 && Math.abs(dy) < 14 && dt < 280) {
            const now = Date.now();
            if (now - lastTapRef.current < 320) {
              setZoomed((z) => !z);
              lastTapRef.current = 0;
            } else {
              lastTapRef.current = now;
            }
          }
        }}
        style={{
          position: 'relative',
          flex: 1,
          width: '100vw',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 0,
          margin: '8px 0',
          overflow: zoomed ? 'auto' : 'hidden',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <img
          key={displayUrl}
          src={displayUrl}
          alt={`${address} — photo ${safeIdx + 1}`}
          onError={() => {
            if (!failedHighRes[rawUrl] && highResUrl !== rawUrl) {
              setFailedHighRes((prev) => ({ ...prev, [rawUrl]: true }));
            }
          }}
          onDoubleClick={() => setZoomed((z) => !z)}
          style={
            zoomed
              ? {
                  width: '190vw',
                  maxWidth: 'none',
                  height: 'auto',
                  objectFit: 'contain',
                  userSelect: 'none',
                  cursor: 'zoom-out',
                }
              : {
                  width: '100vw',
                  height: '100%',
                  maxWidth: '100vw',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  userSelect: 'none',
                  cursor: 'zoom-in',
                }
          }
        />

        {photos.length > 1 && !zoomed && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goPrev();
              }}
              aria-label="Previous photo"
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 42,
                height: 42,
                borderRadius: '50%',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                background: 'rgba(15, 37, 55, 0.66)',
                color: '#ffffff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2,
              }}
            >
              <ChevronLeft size={22} />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goNext();
              }}
              aria-label="Next photo"
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 42,
                height: 42,
                borderRadius: '50%',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                background: 'rgba(15, 37, 55, 0.66)',
                color: '#ffffff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2,
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
            justifyContent: 'flex-start',
            gap: 8,
            overflowX: 'auto',
            padding: '0 14px 2px',
          }}
        >
          {photos.map((thumb, i) => (
            <button
              key={`${thumb}-${i}`}
              type="button"
              onClick={() => {
                setZoomed(false);
                setIdx(i);
              }}
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
