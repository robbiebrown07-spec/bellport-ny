import React, { useRef } from 'react';

interface EditableTextProps {
  id: string;
  fallback: string;
  overrides: Record<string, string>;
  editMode: boolean;
  onSave: (id: string, value: string | null) => void;
  as?: 'span' | 'p';
  className?: string;
}

export const EditableText: React.FC<EditableTextProps> = ({
  id,
  fallback,
  overrides,
  editMode,
  onSave,
  as: Tag = 'span',
  className = '',
}) => {
  const ref = useRef<HTMLElement | null>(null);
  const current = overrides[id] ?? fallback;
  const hasOverride = Object.prototype.hasOwnProperty.call(overrides, id);

  const commit = () => {
    if (!ref.current) return;
    const text = ref.current.innerText.trim();
    if (!text || text === fallback) {
      onSave(id, null);
    } else {
      onSave(id, text);
    }
  };

  return (
    <span className={`editable-block ${editMode ? 'is-editing-enabled' : ''} ${className}`}>
      <Tag
        ref={(node: HTMLElement | null) => {
          ref.current = node;
        }}
        contentEditable={editMode}
        suppressContentEditableWarning
        onBlur={editMode ? commit : undefined}
        onKeyDown={
          editMode
            ? (e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  ref.current?.blur();
                }
              }
            : undefined
        }
      >
        {current}
      </Tag>
      {editMode && hasOverride && (
        <button
          type="button"
          className="editable-block__reset"
          onClick={() => onSave(id, null)}
          title="Reset to default copy"
        >
          Reset
        </button>
      )}
    </span>
  );
};
