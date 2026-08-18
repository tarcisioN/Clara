import type { PostmanQueryParam, PostmanUrl } from '../postman/types.ts';
import { getUrlRaw, isUrlObject, parseUrlString } from '../postman/url.ts';
import './QueryParamsPane.css';

type QueryParamsPaneProps = {
  url: PostmanUrl | undefined;
  onAdd: () => void;
  onChange: (index: number, patch: Pick<PostmanQueryParam, 'key' | 'value'>) => void;
  onToggleDisabled: (index: number, disabled: boolean) => void;
  onRemove: (index: number) => void;
};

/** Params shown in the table — from `query[]` when present, otherwise parsed from raw. */
export function listVisibleQueryParams(url: PostmanUrl | undefined): PostmanQueryParam[] {
  if (isUrlObject(url)) {
    return url.query ?? [];
  }
  return parseUrlString(getUrlRaw(url)).query;
}

export default function QueryParamsPane({
  url,
  onAdd,
  onChange,
  onToggleDisabled,
  onRemove
}: QueryParamsPaneProps) {
  const params = listVisibleQueryParams(url);

  return (
    <section className="query-pane">
      <div className="query-pane-title">
        <h3>Query params</h3>
        <button type="button" onClick={onAdd}>
          Add param
        </button>
      </div>

      {params.length === 0 && (
        <p className="query-empty">
          No query params. Disabled params stay in <code>query[]</code> but are omitted from{' '}
          <code>raw</code>.
        </p>
      )}

      {params.length > 0 && (
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
