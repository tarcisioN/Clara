import type { EditableAuthType, PostmanAuth } from '../postman/auth.ts';
import { getAuthAttributeValue, resolveEditableAuthType } from '../postman/auth.ts';
import './AuthPane.css';

const EDITABLE_TYPES: Array<{ value: EditableAuthType; label: string }> = [
  { value: 'inherit', label: 'Inherit auth' },
  { value: 'noauth', label: 'No auth' },
  { value: 'bearer', label: 'Bearer token' },
  { value: 'basic', label: 'Basic auth' },
  { value: 'apikey', label: 'API key' }
];

type AuthPaneProps = {
  auth: PostmanAuth | null | undefined;
  onChangeType: (type: EditableAuthType) => void;
  onChangeBearerToken: (token: string) => void;
  onChangeBasic: (patch: { username?: string; password?: string }) => void;
  onChangeApiKey: (patch: { key?: string; value?: string; in?: string }) => void;
};

export default function AuthPane({
  auth,
  onChangeType,
  onChangeBearerToken,
  onChangeBasic,
  onChangeApiKey
}: AuthPaneProps) {
  const resolved = resolveEditableAuthType(auth);
  const editable = EDITABLE_TYPES.some((option) => option.value === resolved);

  return (
    <section className="auth-pane">
      <div className="auth-pane-title">
        <h3>Auth</h3>
        <label className="auth-type">
          <span className="visually-hidden">Auth type</span>
          <select
            value={resolved}
            onChange={(event) => onChangeType(event.target.value as EditableAuthType)}
          >
            {EDITABLE_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
            {!editable && <option value={resolved}>{resolved} (read-only)</option>}
          </select>
        </label>
      </div>

      {resolved === 'inherit' && (
        <p className="auth-hint">
          No <code>request.auth</code> — inherits folder/collection auth when present.
        </p>
      )}

      {resolved === 'noauth' && (
        <p className="auth-hint">
          Explicit <code>type: noauth</code>. Folder/collection auth is not applied.
        </p>
      )}

      {!editable && (
        <p className="auth-hint">
          Auth type <code>{resolved}</code> is preserved on save. Switch to an editable type to
          change credentials; sibling auth arrays stay intact.
        </p>
      )}

      {resolved === 'bearer' && (
        <label className="auth-field">
          <span>Token</span>
          <input
            type="text"
            spellCheck={false}
            autoComplete="off"
            value={getAuthAttributeValue(auth?.bearer, 'token')}
            onChange={(event) => onChangeBearerToken(event.target.value)}
          />
        </label>
      )}

      {resolved === 'basic' && (
        <div className="auth-fields">
          <label className="auth-field">
            <span>Username</span>
            <input
              type="text"
              spellCheck={false}
              autoComplete="off"
              value={getAuthAttributeValue(auth?.basic, 'username')}
              onChange={(event) => onChangeBasic({ username: event.target.value })}
            />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="off"
              value={getAuthAttributeValue(auth?.basic, 'password')}
              onChange={(event) => onChangeBasic({ password: event.target.value })}
            />
          </label>
        </div>
      )}

      {resolved === 'apikey' && (
        <div className="auth-fields">
          <label className="auth-field">
            <span>Key</span>
            <input
              type="text"
              spellCheck={false}
              autoComplete="off"
              placeholder="X-Api-Key"
              value={getAuthAttributeValue(auth?.apikey, 'key')}
              onChange={(event) => onChangeApiKey({ key: event.target.value })}
            />
          </label>
          <label className="auth-field">
            <span>Value</span>
            <input
              type="text"
              spellCheck={false}
              autoComplete="off"
              value={getAuthAttributeValue(auth?.apikey, 'value')}
              onChange={(event) => onChangeApiKey({ value: event.target.value })}
            />
          </label>
          <label className="auth-field">
            <span>Add to</span>
            <select
              value={getAuthAttributeValue(auth?.apikey, 'in') || 'header'}
              onChange={(event) => onChangeApiKey({ in: event.target.value })}
            >
              <option value="header">Header</option>
              <option value="query">Query params</option>
            </select>
          </label>
        </div>
      )}
    </section>
  );
}
