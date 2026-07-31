import { useMemo, useState } from 'react';
import type { PostmanEnvironmentValue } from '../postman/environment.ts';
import type { KeyChangeKind } from '../git/keyedDiff.ts';
import { computeKeyedValueDiff } from '../git/keyedValueDiff.ts';
import KeyedDiffView from './KeyedDiffView.tsx';
import './EnvironmentPane.css';

type EnvironmentPaneProps = {
  name: string;
  filePath: string;
  values: PostmanEnvironmentValue[];
  compareBaseRef?: string | null;
  baseValues?: PostmanEnvironmentValue[] | null;
  /** Status per current-row index. */
  valueStatusByIndex?: Map<number, KeyChangeKind> | null;
  removedKeys?: Array<{ key: string }> | null;
  onAdd: () => void;
  onChange: (index: number, patch: Pick<PostmanEnvironmentValue, 'key' | 'value'>) => void;
  onToggleEnabled: (index: number, enabled: boolean) => void;
  onRemove: (index: number) => void;
  onRestoreAll?: (() => void) | null;
  onRestoreKey?: ((key: string) => void) | null;
};

function statusClass(kind: KeyChangeKind | undefined): string {
  if (kind === 'added') {
    return 'compare-row-added';
  }
  if (kind === 'modified') {
    return 'compare-row-modified';
  }
  return '';
}

function toRows(values: PostmanEnvironmentValue[]) {
  return values.map((value) => ({
    key: value.key ?? '',
    value: value.value ?? '',
    disabled: value.enabled === false
  }));
}

export default function EnvironmentPane({
  name,
  filePath,
  values,
  compareBaseRef = null,
  baseValues = null,
  valueStatusByIndex = null,
  removedKeys = null,
  onAdd,
  onChange,
  onToggleEnabled,
  onRemove,
  onRestoreAll = null,
  onRestoreKey = null
}: EnvironmentPaneProps) {
  const baseLabel = compareBaseRef ?? 'base';
  const hasCompare =
    Boolean(valueStatusByIndex) &&
    [...(valueStatusByIndex?.values() ?? [])].some((kind) => kind !== 'unchanged');
  const hasRemoved = (removedKeys?.length ?? 0) > 0;
  const canDiff = Boolean(baseValues) && (hasCompare || hasRemoved);
  const [viewMode, setViewMode] = useState<'edit' | 'diff'>('edit');

  const keyedDiff = useMemo(() => {
    if (!baseValues) {
      return null;
    }
    return computeKeyedValueDiff(toRows(values), toRows(baseValues));
  }, [values, baseValues]);

  return (
    <section className="environment-pane">
      <header className="environment-pane-header">
        <div>
          <h2>{name || 'Untitled environment'}</h2>
          <p title={filePath}>{filePath}</p>
        </div>
        <div className="environment-pane-actions">
          {canDiff ? (
            <div className="environment-view-mode" role="group" aria-label="Environment view">
              <button
                type="button"
                className={viewMode === 'edit' ? 'active' : ''}
                onClick={() => setViewMode('edit')}
              >
                Edit
              </button>
              <button
                type="button"
                className={viewMode === 'diff' ? 'active' : ''}
                onClick={() => setViewMode('diff')}
              >
                Diff
              </button>
            </div>
          ) : null}
          {(hasCompare || hasRemoved) && onRestoreAll ? (
            <button type="button" className="compare-restore" onClick={onRestoreAll}>
              Restore all from {baseLabel}
            </button>
          ) : null}
          {viewMode === 'edit' ? (
            <button type="button" onClick={onAdd}>
              Add variable
            </button>
          ) : null}
        </div>
      </header>

      {viewMode === 'diff' && keyedDiff ? (
        <div className="environment-diff">
          <p className="environment-diff-banner" role="status">
            Comparing vs {baseLabel}
            {keyedDiff.hasChanges
              ? ` · ${keyedDiff.rows.filter((row) => row.change !== 'unchanged').length} changed`
              : ' · no changes'}
          </p>
          <KeyedDiffView rows={keyedDiff.rows} onRestoreKey={onRestoreKey} />
        </div>
      ) : values.length === 0 && !hasRemoved ? (
        <p className="environment-empty">No variables in this environment.</p>
      ) : (
        <div className="environment-rows" role="table" aria-label="Environment variables">
          <div className="environment-row environment-row-head" role="row">
            <span role="columnheader" className="environment-col-enabled">
              On
            </span>
            <span role="columnheader">Key</span>
            <span role="columnheader">Value</span>
            <span role="columnheader" className="environment-col-actions">
              <span className="visually-hidden">Actions</span>
            </span>
          </div>
          {values.map((variable, index) => {
            const enabled = variable.enabled !== false;
            const kind = valueStatusByIndex?.get(index);
            return (
              <div
                key={index}
                className={`environment-row ${enabled ? '' : 'disabled'} ${statusClass(kind)}`.trim()}
                role="row"
                title={
                  kind && kind !== 'unchanged'
                    ? `${kind} vs ${baseLabel}`
                    : undefined
                }
              >
                <label className="environment-col-enabled">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) => onToggleEnabled(index, event.target.checked)}
                    aria-label={`Enable ${variable.key || 'variable'}`}
                  />
                </label>
                <input
                  type="text"
                  spellCheck={false}
                  value={variable.key ?? ''}
                  placeholder="key"
                  onChange={(event) => onChange(index, { key: event.target.value })}
                  aria-label="Variable key"
                />
                <input
                  type="text"
                  spellCheck={false}
                  value={variable.value ?? ''}
                  placeholder="value"
                  onChange={(event) => onChange(index, { value: event.target.value })}
                  aria-label="Variable value"
                />
                <span className="environment-col-actions">
                  {kind === 'modified' && variable.key && onRestoreKey ? (
                    <button
                      type="button"
                      className="compare-restore-key"
                      onClick={() => onRestoreKey(variable.key!)}
                      title={`Restore ${variable.key} from ${baseLabel}`}
                    >
                      ↻
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onRemove(index)}
                    aria-label="Remove variable"
                  >
                    ✕
                  </button>
                </span>
              </div>
            );
          })}
          {removedKeys?.map((entry) => (
            <div
              key={`removed:${entry.key}`}
              className="environment-row compare-row-removed"
              role="row"
              title={`Removed vs ${baseLabel}`}
            >
              <span className="environment-col-enabled" />
              <span className="environment-removed-key">{entry.key || '(empty)'}</span>
              <span className="environment-removed-value">removed in current</span>
              <span className="environment-col-actions">
                {entry.key && onRestoreKey ? (
                  <button
                    type="button"
                    className="compare-restore-key"
                    onClick={() => onRestoreKey(entry.key)}
                    title={`Restore ${entry.key} from ${baseLabel}`}
                  >
                    ↻
                  </button>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
