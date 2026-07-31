import type { PostmanQueryParam, PostmanUrl } from '../postman/types.ts';
import { isUrlObject } from '../postman/url.ts';
import './QueryParamsPane.css';

type QueryParamsPaneProps = {
  url: PostmanUrl | undefined;
  onPromoteToObject: () => void;
  onAdd: () => void;
  onChange: (index: number, patch: Pick<PostmanQueryParam, 'key' | 'value'>) => void;
  onToggleDisabled: (index: number, disabled: boolean) => void;
  onRemove: (index: number) => void;
};

export default function QueryParamsPane({
  url,
  onPromoteToObject,
  onAdd,
  onChange,
  onToggleDisabled,
  onRemove
}: QueryParamsPaneProps) {
  const asObject = isUrlObject(url);
  const params = asObject ? (url.query ?? []) : [];

  return (
    <section className="query-pane">
      <div className="query-pane-title">
        <h3>Query params</h3>
        {asObject && (
          <button type="button" onClick={onAdd}>
            Add param
          </button>
        )}
      </div>

      {!asObject && (
        <div className="query-promote">
          <p>
            URL is stored as a <code>string</code>. The query table needs a URL{' '}
            <code>object</code> (<code>raw</code> + members). You can still edit the query in the
            URL field above.
          </p>
          <button type="button" className="primary" onClick={onPromoteToObject}>
            Convert URL to object
          </button>
        </div>
      )}

      {asObject && params.length === 0 && (
        <p className="query-empty">No query params. Disabled params stay in <code>query[]</code> but are omitted from <code>raw</code>.</p>
      )}

      {asObject && params.length > 0 && (
        <div className="query-rows" role="table" aria-label="Query params">
          <div className="query-row query-row-head" role="row">
            <span role="columnheader" className="query-col-enabled">
              On
            </span>
            <span role="columnheader">Key</span>
            <span role="columnheader">Value</span>
            <span role="columnheader" className="query-col-actions">
              <span className="visually-hidden">Actions</span>
            </span>
          </div>
          {params.map((param, index) => {
            const enabled = !param.disabled;
            return (
              <div
                key={index}
                className={`query-row ${enabled ? '' : 'disabled'}`.trim()}
                role="row"
              >
                <label className="query-col-enabled">
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
                  placeholder="key"
                  value={param.key ?? ''}
                  onChange={(event) => onChange(index, { key: event.target.value })}
                  aria-label={`Query ${index + 1} key`}
                />
                <input
                  type="text"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="value"
                  value={param.value ?? ''}
                  onChange={(event) => onChange(index, { value: event.target.value })}
                  aria-label={`Query ${index + 1} value`}
                />
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  aria-label={`Remove query ${index + 1}`}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
