import type { PostmanHeader } from '../postman/types.ts';
import './HeaderTable.css';

type HeaderTableProps = {
  headers: PostmanHeader[];
  onAdd: () => void;
  onChange: (index: number, patch: Pick<PostmanHeader, 'key' | 'value'>) => void;
  onToggleDisabled: (index: number, disabled: boolean) => void;
  onRemove: (index: number) => void;
};

export default function HeaderTable({
  headers,
  onAdd,
  onChange,
  onToggleDisabled,
  onRemove
}: HeaderTableProps) {
  return (
    <section className="header-table">
      <div className="header-table-title">
        <h3>Headers</h3>
        <button type="button" className="header-add" onClick={onAdd}>
          Add header
        </button>
      </div>

      {headers.length === 0 ? (
        <p className="header-empty">No headers. Newman will send none for this request.</p>
      ) : (
        <div className="header-rows" role="table" aria-label="Request headers">
          <div className="header-row header-row-head" role="row">
            <span role="columnheader" className="header-col-enabled">
              On
            </span>
            <span role="columnheader">Key</span>
            <span role="columnheader">Value</span>
            <span role="columnheader" className="header-col-actions">
              <span className="visually-hidden">Actions</span>
            </span>
          </div>

          {headers.map((header, index) => {
            const enabled = !header.disabled;
            return (
              <div
                key={index}
                className={`header-row ${enabled ? '' : 'disabled'}`.trim()}
                role="row"
              >
                <label className="header-col-enabled">
                  <span className="visually-hidden">Enabled</span>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) => onToggleDisabled(index, !event.target.checked)}
                  />
                </label>
                <input
                  type="text"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="Header-Name"
                  value={header.key ?? ''}
                  onChange={(event) => onChange(index, { key: event.target.value })}
                  aria-label={`Header ${index + 1} key`}
                />
                <input
                  type="text"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="value"
                  value={header.value ?? ''}
                  onChange={(event) => onChange(index, { value: event.target.value })}
                  aria-label={`Header ${index + 1} value`}
                />
                <button
                  type="button"
                  className="header-remove"
                  onClick={() => onRemove(index)}
                  aria-label={`Remove header ${index + 1}`}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}

      {headers.some((header) => header.description) && (
        <p className="header-hint">
          Existing <code>description</code> fields are kept on save; this UI does not edit them.
        </p>
      )}
    </section>
  );
}
