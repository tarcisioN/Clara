import { useEffect, useRef, useState } from 'react';
import type { SaveAsLocation } from '../workspace/pinnedRequest.ts';
import './PromptDialog.css';

export type SaveAsRequest = {
  title?: string;
  defaultName: string;
  locations: SaveAsLocation[];
  defaultParentPath?: string | null;
  confirmLabel?: string;
};

export type SaveAsResult = {
  name: string;
  parentPath: string | null;
};

type SaveAsDialogProps = SaveAsRequest & {
  onConfirm: (result: SaveAsResult) => void;
  onCancel: () => void;
};

function locationValue(parentPath: string | null): string {
  return parentPath ?? '';
}

function parseLocationValue(value: string): string | null {
  return value === '' ? null : value;
}

/** Name + folder destination for Save As / re-home a detached pin. */
export default function SaveAsDialog({
  title = 'Save As',
  defaultName,
  locations,
  defaultParentPath = null,
  confirmLabel = 'Save As',
  onConfirm,
  onCancel
}: SaveAsDialogProps) {
  const [name, setName] = useState(defaultName);
  const [parentValue, setParentValue] = useState(locationValue(defaultParentPath));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && locations.length > 0;

  return (
    <div className="prompt-backdrop" role="presentation" onMouseDown={onCancel}>
      <form
        className="prompt-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) {
            return;
          }
          onConfirm({
            name: trimmed,
            parentPath: parseLocationValue(parentValue)
          });
        }}
      >
        <h2>{title}</h2>
        <label>
          <span>Name</span>
          <input
            ref={inputRef}
            type="text"
            value={name}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          <span>Location</span>
          <select
            value={parentValue}
            aria-label="Save location"
            onChange={(event) => setParentValue(event.target.value)}
          >
            {locations.map((location) => (
              <option
                key={locationValue(location.parentPath) || '__root__'}
                value={locationValue(location.parentPath)}
              >
                {location.label}
              </option>
            ))}
          </select>
        </label>
        <div className="prompt-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!canSubmit}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
