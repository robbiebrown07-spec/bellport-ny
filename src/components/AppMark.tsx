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
    {/* Red geometric gable */}
    <path d="M4 12.5 L12.5 4 L21 12.5 Z" fill="var(--g-red)" />
    {/* Yellow coastal sun */}
    <circle cx="22.5" cy="6.5" r="3.2" fill="var(--g-yellow)" />
    {/* Blue architectural block */}
    <rect x="5.5" y="14" width="14" height="6.5" rx="2" fill="var(--g-blue)" />
    {/* Green Bellport Bay shoreline pill */}
    <rect x="3" y="22" width="22" height="3.5" rx="1.75" fill="var(--g-green)" />
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
