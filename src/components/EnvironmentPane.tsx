import type { PostmanEnvironmentValue } from '../postman/environment.ts';
import './EnvironmentPane.css';

type EnvironmentPaneProps = {
  name: string;
  filePath: string;
  values: PostmanEnvironmentValue[];
  onAdd: () => void;
  onChange: (index: number, patch: Pick<PostmanEnvironmentValue, 'key' | 'value'>) => void;
  onToggleEnabled: (index: number, enabled: boolean) => void;
  onRemove: (index: number) => void;
};

export default function EnvironmentPane({
  name,
  filePath,
  values,
  onAdd,
  onChange,
  onToggleEnabled,
  onRemove
}: EnvironmentPaneProps) {
  return (
    <section className="environment-pane">
      <header className="environment-pane-header">
        <div>
          <h2>{name || 'Untitled environment'}</h2>
          <p title={filePath}>{filePath}</p>
        </div>
        <button type="button" onClick={onAdd}>
          Add variable
        </button>
      </header>

      {values.length === 0 ? (
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
            return (
              <div
                key={index}
                className={`environment-row ${enabled ? '' : 'disabled'}`.trim()}
                role="row"
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
                <button
                  type="button"
                  className="environment-col-actions"
                  onClick={() => onRemove(index)}
                  aria-label="Remove variable"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
