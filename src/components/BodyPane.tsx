import type { PostmanBody, PostmanBodyMode, PostmanUrlEncodedParam } from '../postman/body.ts';
import { resolveRawLanguage } from '../postman/body.ts';
import CodeEditor from './CodeEditor.tsx';
import './BodyPane.css';

const EDITABLE_MODES: Array<{ value: PostmanBodyMode; label: string }> = [
  { value: 'none', label: 'none' },
  { value: 'raw', label: 'raw' },
  { value: 'urlencoded', label: 'x-www-form-urlencoded' }
];

type BodyPaneProps = {
  body: PostmanBody | undefined;
  onChangeMode: (mode: PostmanBodyMode) => void;
  onChangeRaw: (raw: string) => void;
  onAddUrlEncoded: () => void;
  onChangeUrlEncoded: (
    index: number,
    patch: Pick<PostmanUrlEncodedParam, 'key' | 'value'>
  ) => void;
  onToggleUrlEncodedDisabled: (index: number, disabled: boolean) => void;
  onRemoveUrlEncoded: (index: number) => void;
};

function resolveMode(body: PostmanBody | undefined): PostmanBodyMode {
  if (!body?.mode) {
    return 'none';
  }
  if (body.mode === 'raw' || body.mode === 'urlencoded' || body.mode === 'none') {
    return body.mode;
  }
  return body.mode as PostmanBodyMode;
}

export default function BodyPane({
  body,
  onChangeMode,
  onChangeRaw,
  onAddUrlEncoded,
  onChangeUrlEncoded,
  onToggleUrlEncodedDisabled,
  onRemoveUrlEncoded
}: BodyPaneProps) {
  const mode = resolveMode(body);
  const editable = mode === 'none' || mode === 'raw' || mode === 'urlencoded';
  const language =
    typeof body?.options?.raw?.language === 'string' ? body.options.raw.language : undefined;
  const params = body?.urlencoded ?? [];

  return (
    <section className="body-pane">
      <div className="body-pane-title">
        <h3>Body</h3>
        <label className="body-mode">
          <span className="visually-hidden">Body mode</span>
          <select
            value={editable ? mode : mode}
            onChange={(event) => onChangeMode(event.target.value as PostmanBodyMode)}
          >
            {EDITABLE_MODES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
            {!editable && (
              <option value={mode}>
                {mode} (read-only)
              </option>
            )}
          </select>
        </label>
      </div>

      {!editable && (
        <p className="body-hint">
          Mode <code>{mode}</code> is preserved on save. Switch to raw / urlencoded / none to
          edit in Clara; sibling payloads stay intact.
        </p>
      )}

      {mode === 'none' && (
        <p className="body-empty">No body sent. Other mode payloads on the object are kept.</p>
      )}

      {mode === 'raw' && (
        <>
          {language && (
            <p className="body-hint">
              Language <code>{language}</code> in <code>body.options</code> drives highlighting
              and is preserved on save.
            </p>
          )}
          <CodeEditor
            className="body-raw"
            value={body?.raw ?? ''}
            onChange={onChangeRaw}
            language={resolveRawLanguage(body)}
            ariaLabel="Raw body"
            wrap
          />
        </>
      )}

      {mode === 'urlencoded' && (
        <div className="body-urlencoded">
          <div className="body-urlencoded-actions">
            <button type="button" onClick={onAddUrlEncoded}>
              Add param
            </button>
          </div>
          {params.length === 0 ? (
            <p className="body-empty">No urlencoded params.</p>
          ) : (
            <div className="body-rows" role="table" aria-label="Urlencoded body">
              <div className="body-row body-row-head" role="row">
                <span role="columnheader" className="body-col-enabled">
                  On
                </span>
                <span role="columnheader">Key</span>
                <span role="columnheader">Value</span>
                <span role="columnheader" className="body-col-actions">
                  <span className="visually-hidden">Actions</span>
                </span>
              </div>
              {params.map((param, index) => {
                const enabled = !param.disabled;
                return (
                  <div
                    key={index}
                    className={`body-row ${enabled ? '' : 'disabled'}`.trim()}
                    role="row"
                  >
                    <label className="body-col-enabled">
                      <span className="visually-hidden">Enabled</span>
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(event) =>
                          onToggleUrlEncodedDisabled(index, !event.target.checked)
                        }
                      />
                    </label>
                    <input
                      type="text"
                      spellCheck={false}
                      autoComplete="off"
                      placeholder="key"
                      value={param.key ?? ''}
                      onChange={(event) => onChangeUrlEncoded(index, { key: event.target.value })}
                      aria-label={`Urlencoded ${index + 1} key`}
                    />
                    <input
                      type="text"
                      spellCheck={false}
                      autoComplete="off"
                      placeholder="value"
                      value={param.value ?? ''}
                      onChange={(event) =>
                        onChangeUrlEncoded(index, { value: event.target.value })
                      }
                      aria-label={`Urlencoded ${index + 1} value`}
                    />
                    <button
                      type="button"
                      onClick={() => onRemoveUrlEncoded(index)}
                      aria-label={`Remove urlencoded ${index + 1}`}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
