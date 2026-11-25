import React from 'react';

export type PrimitiveShape = 'circle' | 'half' | 'quarter' | 'pill' | 'square';

interface ShapeProps {
  shape: PrimitiveShape;
  size?: number;
  color?: string;
  className?: string;
}

export const Shape: React.FC<ShapeProps> = ({
  shape,
  size = 28,
  color = 'var(--g-blue)',
  className,
}) => {
  if (shape === 'pill') {
    const w = Math.round(size * 1.8);
    return (
      <svg width={w} height={size} viewBox={`0 0 ${w} ${size}`} className={className} aria-hidden="true">
        <rect width={w} height={size} rx={size / 2} fill={color} />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 28 28" className={className} aria-hidden="true">
      {shape === 'circle' && <circle cx="14" cy="14" r="13" fill={color} />}
      {shape === 'square' && <rect x="1" y="1" width="26" height="26" rx="5.6" fill={color} />}
      {shape === 'half' && <path d="M2 20 A12 12 0 0 1 26 20 Z" fill={color} />}
      {shape === 'quarter' && <path d="M3 25 L3 3 A22 22 0 0 1 25 25 Z" fill={color} />}
    </svg>
  );
};
