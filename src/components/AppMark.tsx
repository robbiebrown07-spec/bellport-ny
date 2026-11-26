import React from 'react';
import { Shape } from './Shapes';

interface AppMarkProps {
  size?: number;
}

/**
 * Bellport Watch — Minimalist 2-Tone Architectural Crest:
 * Crisp white geometric shingled gable & chimney over a muted dune-brass
 * shoreline horizon and soft bay ripple inside a hairline maritime frame.
 */
export const AppMark: React.FC<AppMarkProps> = ({ size = 38 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 38 38"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {/* Subtle hairline architectural frame */}
      <rect
        x="0.75"
        y="0.75"
        width="36.5"
        height="36.5"
        rx="8.5"
        fill="rgba(255, 255, 255, 0.04)"
        stroke="rgba(255, 255, 255, 0.2)"
        strokeWidth="1"
      />

      {/* Historic steep-pitched Bellport gable & chimney */}
      <path
        d="M9.5 18.4L19 9.8L28.5 18.4"
        stroke="#ffffff"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M23.6 10.6V14.1"
        stroke="#ffffff"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M12.3 16.0V23.8H25.7V16.0"
        stroke="#ffffff"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Divided-light window */}
      <rect
        x="17.1"
        y="16.9"
        width="3.8"
        height="4.3"
        rx="0.5"
        stroke="rgba(255, 255, 255, 0.9)"
        strokeWidth="1.25"
      />

      {/* Muted Dune-Brass Shoreline Horizon */}
      <path
        d="M7.5 27.1C11.4 25.8 15.3 25.8 19.0 27.1C22.7 28.4 26.6 28.4 30.5 27.0"
        stroke="#e2c07d"
        strokeWidth="1.65"
        strokeLinecap="round"
      />

      {/* Soft Bellport Bay Ripple */}
      <path
        d="M10.8 30.3C13.9 29.4 16.8 29.4 19.6 30.3C22.4 31.2 25.3 31.2 28.0 30.2"
        stroke="rgba(165, 198, 228, 0.78)"
        strokeWidth="1.35"
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
