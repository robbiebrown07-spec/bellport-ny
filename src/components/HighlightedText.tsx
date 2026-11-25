import React from 'react';
import { splitHighlightParts } from '../lib/search';

interface HighlightedTextProps {
  text: string;
  query: string;
}

export const HighlightedText: React.FC<HighlightedTextProps> = ({ text, query }) => {
  const segments = splitHighlightParts(text, query);
  return (
    <>
      {segments.map((seg, idx) =>
        seg.matched ? (
          <mark key={idx} className="kw-hit">
            {seg.text}
          </mark>
        ) : (
          <React.Fragment key={idx}>{seg.text}</React.Fragment>
        )
      )}
    </>
  );
};
