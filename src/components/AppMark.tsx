import React from 'react';
import { Shape } from './Shapes';

interface AppMarkProps {
  size?: number;
}

export const AppMark: React.FC<AppMarkProps> = ({ size = 28 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 28 28"
    fill="none"
    aria-hidden="true"
    style={{ flexShrink: 0 }}
  >
    {/* Single-color Red (#ea4335) beach house (pitched roof + cottage body + window cutout) */}
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M9.5 4.2L2.2 10.6H4.2V19.2H14.8V10.6H16.8L9.5 4.2ZM7.7 11.8H11.3V15.2H7.7V11.8Z"
      fill="#ea4335"
    />
    {/* Warm Yellow (#fbbc04) sandy beach curving beneath the house */}
    <path
      d="M1.8 20.6C5.6 18.8 11.4 18.9 16.4 21.4C13.6 23.3 6.2 23.6 1.8 22.4V20.6Z"
      fill="#fbbc04"
    />
    {/* Crisp Blue (#4285f4) ocean waves rolling beside the sand */}
    <path
      d="M15.2 17.6C17.1 16.2 19.2 16.2 21.0 17.6C22.6 18.8 24.4 18.8 26.2 17.5"
      stroke="#4285f4"
      strokeWidth="2.3"
      strokeLinecap="round"
    />
    <path
      d="M14.0 22.2C16.2 20.7 18.6 20.7 20.6 22.2C22.5 23.5 24.5 23.5 26.4 22.0"
      stroke="#4285f4"
      strokeWidth="2.3"
      strokeLinecap="round"
    />
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
