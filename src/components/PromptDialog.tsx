import { useEffect, useRef, useState } from 'react';
import './PromptDialog.css';

export type PromptRequest = {
  title: string;
  label?: string;
  defaultValue?: string;
  confirmLabel?: string;
  placeholder?: string;
};

type PromptDialogProps = PromptRequest & {
  onConfirm: (value: string) => void;
  onCancel: () => void;
};

/** Electron does not implement window.prompt(), so text input needs an in-app dialog. */
export default function PromptDialog({
  title,
  label,
  defaultValue = '',
  confirmLabel = 'OK',
  placeholder,
  onConfirm,
  onCancel
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
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

  const trimmed = value.trim();

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
          if (trimmed) {
            onConfirm(trimmed);
          }
        }}
      >
        <h2>{title}</h2>
        <label>
          {label ? <span>{label}</span> : null}
          <input
            ref={inputRef}
            type="text"
            value={value}
            spellCheck={false}
            autoComplete="off"
            placeholder={placeholder}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <div className="prompt-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!trimmed}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
