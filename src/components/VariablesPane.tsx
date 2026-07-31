import type { PostmanVariable } from '../postman/variables.ts';
import './VariablesPane.css';

type VariablesPaneProps = {
  scopeLabel: string;
  variables: PostmanVariable[];
  onAdd: () => void;
  onChange: (index: number, patch: Pick<PostmanVariable, 'key' | 'value'>) => void;
  onToggleDisabled: (index: number, disabled: boolean) => void;
  onRemove: (index: number) => void;
};

export default function VariablesPane({
  scopeLabel,
  variables,
  onAdd,
  onChange,
  onToggleDisabled,
  onRemove
}: VariablesPaneProps) {
  return (
    <section className="variables-pane">
      <div className="variables-pane-title">
        <div>
          <h3>Variables</h3>
          <p>Defined on this {scopeLabel} and inherited by nested requests.</p>
        </div>
        <button type="button" onClick={onAdd}>
          Add variable
        </button>
      </div>

      {variables.length === 0 ? (
        <p className="variables-empty">No variables on this {scopeLabel}.</p>
      ) : (
        <div className="variables-rows" role="table" aria-label={`${scopeLabel} variables`}>
          <div className="variables-row variables-row-head" role="row">
            <span role="columnheader" className="variables-col-enabled">
              On
            </span>
            <span role="columnheader">Key</span>
            <span role="columnheader">Value</span>
            <span role="columnheader" className="variables-col-actions">
              <span className="visually-hidden">Actions</span>
            </span>
          </div>
          {variables.map((variable, index) => {
            const enabled = !variable.disabled;
            return (
              <div
                key={index}
                className={`variables-row ${enabled ? '' : 'disabled'}`.trim()}
                role="row"
              >
                <label className="variables-col-enabled">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) => onToggleDisabled(index, !event.target.checked)}
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
                  className="variables-col-actions"
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
