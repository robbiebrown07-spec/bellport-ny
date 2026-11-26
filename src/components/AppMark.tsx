import React from 'react';
import { Shape } from './Shapes';

interface AppMarkProps {
  size?: number;
  className?: string;
}

/**
 * Bellport Watch — Minimalist 2-Tone Architectural Crest:
 * Crisp white geometric shingled gable & chimney over a muted dune-brass
 * shoreline horizon and soft bay ripple inside a hairline maritime frame.
 */
export const AppMark: React.FC<AppMarkProps> = ({ size = 48, className }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className={className}
      style={{ flexShrink: 0 }}
    >
      {/* Subtle hairline architectural frame */}
      <rect
        x="0.75"
        y="0.75"
        width="46.5"
        height="46.5"
        rx="11"
        fill="rgba(255, 255, 255, 0.045)"
        stroke="rgba(255, 255, 255, 0.22)"
        strokeWidth="1.1"
      />

      {/* Historic steep-pitched Bellport gable & chimney */}
      <path
        d="M11.5 23.0L24 12.0L36.5 23.0"
        stroke="#ffffff"
        strokeWidth="1.95"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M29.8 13.0V17.6"
        stroke="#ffffff"
        strokeWidth="1.95"
        strokeLinecap="round"
      />
      <path
        d="M15.2 20.0V30.0H32.8V20.0"
        stroke="#ffffff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Divided-light window */}
      <rect
        x="21.4"
        y="20.8"
        width="5.2"
        height="5.8"
        rx="0.65"
        stroke="rgba(255, 255, 255, 0.92)"
        strokeWidth="1.4"
      />
      <path
        d="M24 20.8V26.6M21.4 23.7H26.6"
        stroke="rgba(255, 255, 255, 0.65)"
        strokeWidth="1.05"
      />

      {/* Muted Dune-Brass Shoreline Horizon */}
      <path
        d="M9.2 34.2C14.1 32.6 19.1 32.6 24.0 34.2C28.8 35.8 33.8 35.8 38.8 34.0"
        stroke="#e2c07d"
        strokeWidth="1.85"
        strokeLinecap="round"
      />

      {/* Soft Bellport Bay Ripple */}
      <path
        d="M13.5 38.2C17.4 37.1 21.1 37.1 24.7 38.2C28.3 39.3 32.0 39.3 35.4 38.1"
        stroke="rgba(165, 198, 228, 0.8)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
};

export const LoadingMark: React.FC = () => (
  <div
    role="status"
    aria-label="Loading"
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      padding: '48px 0',
    }}
  >
    <Shape shape="circle" size={28} color="var(--g-blue)" />
    <Shape shape="half" size={28} color="var(--g-red)" />
    <Shape shape="square" size={28} color="var(--g-yellow)" />
    <Shape shape="quarter" size={28} color="var(--g-green)" />
  </div>
);
