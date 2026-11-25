import React from 'react';
import { Shape } from './Shapes';

interface AppMarkProps {
  size?: number;
}

export const AppMark: React.FC<AppMarkProps> = ({ size = 26 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 28 28"
    aria-hidden="true"
    style={{ flexShrink: 0 }}
  >
    {/* Red gable roof */}
    <path d="M14 3 L24 12 L4 12 Z" fill="var(--g-red)" />
    {/* Blue clapboard facade */}
    <rect x="6" y="12" width="16" height="10" rx="2.5" fill="var(--g-blue)" />
    {/* Yellow coastal sun */}
    <circle cx="22" cy="6.5" r="3" fill="var(--g-yellow)" />
    {/* Green Bellport Bay shoreline arc */}
    <path d="M3 23.5 A14 8 0 0 1 25 23.5 L25 26 L3 26 Z" fill="var(--g-green)" />
  </svg>
);

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
