import React from 'react';
import { Shape } from './Shapes';

interface AppMarkProps {
  size?: number;
}

/**
 * Bellport Watch Medallion Icon (Crisp White Circle):
 * Left-to-right: Green (#34a853) Tree + Red (#ea4335) House on Green (#34a853) Grass,
 * then Yellow (#fbbc04) Sand strictly BETWEEN the house and the water,
 * then Blue (#4285f4) Ocean Waves on the right.
 */
export const AppMark: React.FC<AppMarkProps> = ({ size = 44 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 46 46"
      fill="none"
      aria-hidden="true"
      style={{
        flexShrink: 0,
        filter: 'drop-shadow(0 2px 6px rgba(10, 35, 75, 0.22))',
      }}
    >
      <defs>
        <clipPath id="bellport-watch-medallion">
          <circle cx="23" cy="23" r="21.5" />
        </clipPath>
      </defs>

      {/* Pure White Circular Medallion */}
      <circle cx="23" cy="23" r="22" fill="#ffffff" />

      <g clipPath="url(#bellport-watch-medallion)">
        {/* Green (#34a853) Shade Tree on the left */}
        <circle cx="8.6" cy="19.0" r="4.1" fill="#34a853" />
        <circle cx="6.8" cy="21.5" r="2.9" fill="#34a853" />
        <circle cx="10.5" cy="21.5" r="2.9" fill="#34a853" />
        <rect x="7.7" y="23.0" width="1.8" height="5.6" rx="0.5" fill="#34a853" />

        {/* Single-color Red (#ea4335) Beach House beside the tree */}
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M19.0 11.2L12.2 17.5H14.0V28.2H24.0V17.5H25.8L19.0 11.2ZM17.3 18.8H20.7V22.2H17.3V18.8Z"
          fill="#ea4335"
        />

        {/* Green (#34a853) Grass Lawn underneath the tree & house */}
        <path
          d="M0.5 28.0H25.0V34.5H0.5V28.0Z"
          fill="#34a853"
        />

        {/* Yellow (#fbbc04) Sand Beach strictly BETWEEN the house/grass and the blue water */}
        <path
          d="M24.8 28.0C27.8 28.0 30.8 28.9 33.4 30.8L33.4 35.5H24.8V28.0Z"
          fill="#fbbc04"
        />

        {/* Blue (#4285f4) Ocean Waves & Bay Water on the right */}
        <path
          d="M32.4 26.8C34.2 25.3 36.3 25.3 38.1 26.8C39.9 28.1 42.0 28.1 43.8 26.6C44.6 26.0 45.4 25.8 46.2 26.0"
          stroke="#4285f4"
          strokeWidth="2.35"
          strokeLinecap="round"
        />
        <path
          d="M31.6 31.4C33.5 29.9 35.6 29.9 37.5 31.4C39.3 32.7 41.4 32.7 43.3 31.2C44.2 30.5 45.1 30.3 46.0 30.6"
          stroke="#4285f4"
          strokeWidth="2.35"
          strokeLinecap="round"
        />
        {/* Deep Blue Ocean Base Curve in the lower medallion arc */}
        <path
          d="M0.5 34.2C9.5 33.2 19.5 33.8 28.5 34.8C35.0 35.5 41.0 34.8 46.0 33.8V46.0H0.5V34.2Z"
          fill="#4285f4"
        />
      </g>
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
