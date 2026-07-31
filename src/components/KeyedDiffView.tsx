import { useMemo, useState } from 'react';
import type { DiffKeyedRow } from '../git/keyedValueDiff.ts';
import { highlightPair, type DiffSegment } from '../git/textDiff.ts';
import './KeyedDiffView.css';

function ChangeMark({ change }: { change: DiffKeyedRow['change'] }) {
  if (change === 'unchanged') {
    return null;
  }
  const label = change === 'added' ? '+' : change === 'removed' ? '−' : '~';
  return <span className={`keyed-diff-mark keyed-diff-mark-${change}`}>{label}</span>;
}

function Segments({
  segments,
  fallback,
  emptyLabel = '(empty)'
}: {
  segments: DiffSegment[];
  fallback: string;
  emptyLabel?: string;
}) {
  if (segments.length === 0) {
    return <>{fallback || emptyLabel}</>;
  }
  return (
    <>
      {segments.map((segment, index) => (
        <span
          key={index}
          className={
            segment.kind === 'equal' ? undefined : `keyed-diff-char keyed-diff-char-${segment.kind}`
          }
        >
          {segment.text}
        </span>
      ))}
    </>
  );
}

function KeyedValue({
  side,
  baseValue,
  currentValue,
  disabled,
  change
}: {
  side: 'base' | 'current';
  baseValue: string;
  currentValue: string;
  disabled: boolean;
  change: DiffKeyedRow['change'];
}) {
  const pair = useMemo(
    () => (change === 'modified' ? highlightPair(baseValue, currentValue) : null),
    [change, baseValue, currentValue]
  );
  const value = side === 'base' ? baseValue : currentValue;
  const segments = pair ? (side === 'base' ? pair.base : pair.current) : null;

  return (
    <div className={`keyed-diff-value keyed-diff-value-${side}`}>
      <span className="keyed-diff-value-label">{side}</span>
      <code>
        {segments ? <Segments segments={segments} fallback={value} /> : value}
        {disabled ? <em> · disabled</em> : null}
      </code>
    </div>
  );
}

type KeyedDiffViewProps = {
  rows: DiffKeyedRow[];
  /** Optional per-key restore (modified / removed). */
  onRestoreKey?: ((key: string) => void) | null;
  className?: string;
};

export default function KeyedDiffView({
  rows,
  onRestoreKey = null,
  className
}: KeyedDiffViewProps) {
  const [showUnchanged, setShowUnchanged] = useState(false);
  const hasUnchanged = rows.some((row) => row.change === 'unchanged');
  const visible = showUnchanged
    ? rows
    : rows.filter((row) => row.change !== 'unchanged');

  return (
    <div className={`keyed-diff-view ${className ?? ''}`.trim()}>
      {hasUnchanged ? (
        <label className="keyed-diff-show-unchanged">
          <input
            type="checkbox"
            checked={showUnchanged}
            onChange={(event) => setShowUnchanged(event.target.checked)}
          />
          Show unchanged
        </label>
      ) : null}

      {visible.length === 0 ? (
        <p className="keyed-diff-empty">
          {rows.length === 0 ? 'No entries' : 'No changes (unchanged rows hidden)'}
        </p>
      ) : (
        <ul className="keyed-diff-list">
          {visible.map((row, index) => (
            <li
              key={`${row.change}:${row.key}:${index}`}
              className={`keyed-diff-row ${row.change}`}
            >
              <ChangeMark change={row.change} />
              <span className="keyed-diff-key">{row.key}</span>
              <div className="keyed-diff-values">
                {row.change !== 'added' ? (
                  <KeyedValue
                    side="base"
                    baseValue={row.baseValue ?? ''}
                    currentValue={row.currentValue ?? ''}
                    disabled={row.baseDisabled}
                    change={row.change}
                  />
                ) : null}
                {row.change !== 'removed' ? (
                  <KeyedValue
                    side="current"
                    baseValue={row.baseValue ?? ''}
                    currentValue={row.currentValue ?? ''}
                    disabled={row.currentDisabled}
                    change={row.change}
                  />
                ) : null}
              </div>
              {onRestoreKey &&
              row.key &&
              (row.change === 'modified' || row.change === 'removed') ? (
                <button
                  type="button"
                  className="keyed-diff-restore"
                  title={`Restore ${row.key}`}
                  onClick={() => onRestoreKey(row.key)}
                >
                  ↻
                </button>
              ) : (
                <span className="keyed-diff-restore-spacer" aria-hidden />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
