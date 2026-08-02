import { useEffect, useRef, type PointerEvent } from 'react';
import './TerminalPane.css';

export type TerminalEntry = {
  id: string;
  at: number;
  label: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  ok: boolean;
};

type TerminalPaneProps = {
  entries: TerminalEntry[];
  height: number;
  onResizePointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onResizePointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onResizePointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onClear: () => void;
  onClose: () => void;
};

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function entryBody(entry: TerminalEntry): string {
  const parts: string[] = [];
  if (entry.command.trim()) {
    parts.push(`$ ${entry.command.trim()}`);
  }
  if (entry.stdout.trim()) {
    parts.push(entry.stdout.trimEnd());
  }
  if (entry.stderr.trim()) {
    parts.push(entry.stderr.trimEnd());
  }
  if (parts.length === 0) {
    return '(no output)';
  }
  return parts.join('\n');
}

export default function TerminalPane({
  entries,
  height,
  onResizePointerDown,
  onResizePointerMove,
  onResizePointerUp,
  onClear,
  onClose
}: TerminalPaneProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    scroller.scrollTop = scroller.scrollHeight;
  }, [entries]);

  return (
    <section className="terminal-pane" style={{ height }} aria-label="Terminal">
      <div
        className="terminal-resize"
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize terminal"
      />
      <header className="terminal-header">
        <strong>Terminal</strong>
        <span className="terminal-header-meta">
          {entries.length === 0
            ? 'Newman CLI output'
            : `${entries.length} run${entries.length === 1 ? '' : 's'}`}
        </span>
        <div className="terminal-header-actions">
          <button
            type="button"
            className="terminal-header-button"
            disabled={entries.length === 0}
            onClick={onClear}
            title="Clear terminal"
          >
            Clear
          </button>
          <button
            type="button"
            className="terminal-header-button"
            onClick={onClose}
            title="Hide terminal"
            aria-label="Hide terminal"
          >
            ✕
          </button>
        </div>
      </header>
      <div className="terminal-body" ref={scrollerRef}>
        {entries.length === 0 ? (
          <p className="terminal-empty">
            Run a request, folder, or collection — Newman CLI output appears here.
          </p>
        ) : (
          entries.map((entry) => (
            <article
              key={entry.id}
              className={`terminal-entry ${entry.ok ? 'ok' : 'failed'}`}
            >
              <header className="terminal-entry-header">
                <span className="terminal-entry-time">{formatTime(entry.at)}</span>
                <span className="terminal-entry-label">{entry.label}</span>
                <span className="terminal-entry-code">
                  exit {entry.exitCode ?? '—'}
                </span>
              </header>
              <pre className="terminal-entry-body">{entryBody(entry)}</pre>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
