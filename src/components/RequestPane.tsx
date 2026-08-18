import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  PostmanHeader,
  PostmanItem,
  PostmanQueryParam,
  PostmanRequest
} from '../postman/types.ts';
import type { PostmanBodyMode, PostmanUrlEncodedParam } from '../postman/body.ts';
import type { EditableAuthType } from '../postman/auth.ts';
import type { ItemPath } from '../postman/tree.ts';
import { getUrlRaw } from '../postman/url.ts';
import { getItemScriptSource } from '../postman/edit.ts';
import { hasScriptContent } from '../postman/scripts.ts';
import { interpolateUrlPreview, splitUrlSegments } from '../postman/urlPreview.ts';
import type { RequestSectionKey, RequestSemanticDiff } from '../git/semanticDiff.ts';
import HeaderTable from './HeaderTable.tsx';
import BodyPane from './BodyPane.tsx';
import AuthPane from './AuthPane.tsx';
import QueryParamsPane, { listVisibleQueryParams } from './QueryParamsPane.tsx';
import ScriptsPane from './ScriptsPane.tsx';
import './RequestPane.css';

const COMMON_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
type RequestSection = 'params' | 'body' | 'headers' | 'auth' | 'prerequest' | 'tests';

type RequestPaneProps = {
  item: PostmanItem;
  request: PostmanRequest;
  path: ItemPath;
  semanticDiff?: RequestSemanticDiff | null;
  compareBaseRef?: string | null;
  onRestoreRequest?: (() => void) | null;
  onRestoreSection?: ((section: RequestSectionKey) => void) | null;
  onSwitchToDiff?: (() => void) | null;
  onRename?: (name: string) => void;
  onChangeMethod: (method: string) => void;
  onChangeUrl: (raw: string) => void;
  onAddQueryParam: () => void;
  onChangeQueryParam: (index: number, patch: Pick<PostmanQueryParam, 'key' | 'value'>) => void;
  onToggleQueryParamDisabled: (index: number, disabled: boolean) => void;
  onRemoveQueryParam: (index: number) => void;
  onAddHeader: () => void;
  onChangeHeader: (index: number, patch: Pick<PostmanHeader, 'key' | 'value'>) => void;
  onToggleHeaderDisabled: (index: number, disabled: boolean) => void;
  onRemoveHeader: (index: number) => void;
  onChangeBodyMode: (mode: PostmanBodyMode) => void;
  onChangeBodyRaw: (raw: string) => void;
  onAddUrlEncoded: () => void;
  onChangeUrlEncoded: (
    index: number,
    patch: Pick<PostmanUrlEncodedParam, 'key' | 'value'>
  ) => void;
  onToggleUrlEncodedDisabled: (index: number, disabled: boolean) => void;
  onRemoveUrlEncoded: (index: number) => void;
  onChangeAuthType: (type: EditableAuthType) => void;
  onChangeBearerToken: (token: string) => void;
  onChangeBasicAuth: (patch: { username?: string; password?: string }) => void;
  onChangeApiKeyAuth: (patch: { key?: string; value?: string; in?: string }) => void;
  onChangePrerequestScript: (source: string) => void;
  onChangeTestScript: (source: string) => void;
  onSend: () => void;
  sending: boolean;
  /** Collection + folder + active env values for display-only {{var}} preview. */
  urlPreviewVariables?: Map<string, string>;
  pinned?: boolean;
  pinnedDetached?: boolean;
  /** Unsaved working copy from Duplicate Tab; Save As puts it in the collection. */
  draft?: boolean;
  onPin?: (() => void) | null;
  onUnpin?: (() => void) | null;
  onSaveAs?: (() => void) | null;
};

export default function RequestPane({
  item,
  request,
  path,
  semanticDiff = null,
  compareBaseRef = null,
  onRestoreRequest = null,
  onRestoreSection = null,
  onSwitchToDiff = null,
  onRename,
  onChangeMethod,
  onChangeUrl,
  onAddQueryParam,
  onChangeQueryParam,
  onToggleQueryParamDisabled,
  onRemoveQueryParam,
  onAddHeader,
  onChangeHeader,
  onToggleHeaderDisabled,
  onRemoveHeader,
  onChangeBodyMode,
  onChangeBodyRaw,
  onAddUrlEncoded,
  onChangeUrlEncoded,
  onToggleUrlEncodedDisabled,
  onRemoveUrlEncoded,
  onChangeAuthType,
  onChangeBearerToken,
  onChangeBasicAuth,
  onChangeApiKeyAuth,
  onChangePrerequestScript,
  onChangeTestScript,
  onSend,
  sending,
  urlPreviewVariables,
  pinned = false,
  pinnedDetached = false,
  draft = false,
  onPin = null,
  onUnpin = null,
  onSaveAs = null
}: RequestPaneProps) {
  const [activeSection, setActiveSection] = useState<RequestSection>('params');
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(item.name ?? '');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renamingRef = useRef(false);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const urlOverlayRef = useRef<HTMLDivElement>(null);
  const displayName = item.name?.trim() || '(unnamed request)';

  const syncUrlOverlayScroll = useCallback(() => {
    if (urlOverlayRef.current && urlInputRef.current) {
      urlOverlayRef.current.scrollLeft = urlInputRef.current.scrollLeft;
    }
  }, []);

  useEffect(() => {
    if (!renaming) {
      setDraftName(item.name ?? '');
    }
  }, [item.name, renaming]);

  useEffect(() => {
    if (renaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renaming]);

  const startRename = () => {
    setDraftName(item.name ?? '');
    renamingRef.current = true;
    setRenaming(true);
  };

  const commitRename = () => {
    if (!renamingRef.current) {
      return;
    }
    renamingRef.current = false;
    const next = draftName.trim();
    setRenaming(false);
    if (!onRename || !next || next === (item.name ?? '').trim()) {
      setDraftName(item.name ?? '');
      return;
    }
    onRename(next);
  };

  const cancelRename = () => {
    renamingRef.current = false;
    setDraftName(item.name ?? '');
    setRenaming(false);
  };

  const method = (request.method ?? 'GET').toUpperCase();
  const methods = COMMON_METHODS.includes(method)
    ? COMMON_METHODS
    : [method, ...COMMON_METHODS];
  const urlRaw = getUrlRaw(request.url);
  const urlPreview = useMemo(
    () => interpolateUrlPreview(urlRaw, urlPreviewVariables ?? new Map()),
    [urlRaw, urlPreviewVariables]
  );
  const urlSegments = useMemo(
    () => splitUrlSegments(urlRaw, urlPreviewVariables ?? new Map()),
    [urlRaw, urlPreviewVariables]
  );

  useEffect(() => {
    syncUrlOverlayScroll();
  }, [urlRaw, syncUrlOverlayScroll]);
  const headers = request.header ?? [];
  const queryCount = listVisibleQueryParams(request.url).filter(
    (param) => !param.disabled
  ).length;
  const headerCount = headers.filter((header) => !header.disabled).length;
  const hasBody = request.body?.mode && request.body.mode !== 'none';
  const hasAuth = request.auth?.type && request.auth.type !== 'noauth';
  const prerequestSource = getItemScriptSource(item, 'prerequest');
  const testSource = getItemScriptSource(item, 'test');
  const changed = semanticDiff?.active ? semanticDiff.sections : null;
  const baseLabel = compareBaseRef ?? 'base';
  const canRestore = Boolean(onRestoreRequest || onRestoreSection);
  const sections: Array<{
    key: RequestSection;
    label: string;
    count?: number;
    active?: boolean;
    changed?: boolean;
  }> = [
    { key: 'params', label: 'Params', count: queryCount, changed: changed?.params },
    { key: 'body', label: 'Body', active: Boolean(hasBody), changed: changed?.body },
    { key: 'headers', label: 'Headers', count: headerCount, changed: changed?.headers },
    { key: 'auth', label: 'Auth', active: Boolean(hasAuth), changed: changed?.auth },
    {
      key: 'prerequest',
      label: 'Pre-request',
      active: hasScriptContent(prerequestSource),
      changed: changed?.prerequest
    },
    {
      key: 'tests',
      label: 'Tests',
      active: hasScriptContent(testSource),
      changed: changed?.tests
    }
  ];

  const activeSectionChanged = Boolean(changed?.[activeSection]);

  return (
    <div className="request-pane">
      <div className="request-title">
        <div className="request-title-main">
          <div className="request-title-heading">
            {renaming && onRename ? (
              <input
                ref={renameInputRef}
                className="request-title-input"
                type="text"
                value={draftName}
                spellCheck={false}
                autoComplete="off"
                aria-label="Request name"
                onChange={(event) => setDraftName(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitRename();
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelRename();
                  }
                }}
              />
            ) : onRename ? (
              <button
                type="button"
                className="request-title-button"
                title="Click to rename"
                onClick={startRename}
              >
                {displayName}
              </button>
            ) : (
              <h2>{displayName}</h2>
            )}
            {draft ? (
              <span className="request-title-status" role="status">
                (unsaved)
              </span>
            ) : null}
          </div>
          <span className="request-path">{path}</span>
        </div>
        {onSwitchToDiff ? (
          <div className="request-view-mode" role="group" aria-label="Request view">
            <button type="button" className="active" disabled>
              Edit
            </button>
            <button type="button" onClick={onSwitchToDiff}>
              Diff
            </button>
          </div>
        ) : null}
        <div className="request-title-actions">
          {onSaveAs ? (
            <button type="button" className="request-action-button" onClick={onSaveAs}>
              Save As
            </button>
          ) : null}
          {pinned && !draft && onUnpin ? (
            <button
              type="button"
              className="request-action-button is-pinned"
              onClick={onUnpin}
              title="Unpin — tab will follow the collection file again"
            >
              Unpin
            </button>
          ) : null}
          {!pinned && !draft && onPin ? (
            <button
              type="button"
              className="request-action-button"
              onClick={onPin}
              title="Pin — keep this request if the collection file changes"
            >
              Pin
            </button>
          ) : null}
        </div>
      </div>

      {!draft && pinnedDetached ? (
        <div className="compare-banner compare-banner-pinned" role="status">
          <span>Pinned — not in the current collection file</span>
          {onSaveAs ? (
            <button type="button" onClick={onSaveAs}>
              Save As…
            </button>
          ) : null}
        </div>
      ) : null}

      {!draft && pinned && !pinnedDetached ? (
        <div className="compare-banner compare-banner-pinned" role="status">
          Pinned — survives reload and branch switches
        </div>
      ) : null}

      {semanticDiff?.isAdded ? (
        <div className="compare-banner compare-banner-added" role="status">
          New request — not in {baseLabel}
        </div>
      ) : null}

      {semanticDiff?.active && !semanticDiff.isAdded && semanticDiff.hasChanges && canRestore ? (
        <div className="compare-banner compare-banner-changed" role="status">
          <span>Differs from {baseLabel}</span>
          <span className="compare-banner-actions">
            {changed?.method && onRestoreSection ? (
              <button type="button" onClick={() => onRestoreSection('method')}>
                Restore method
              </button>
            ) : null}
            {changed?.url && onRestoreSection ? (
              <button type="button" onClick={() => onRestoreSection('url')}>
                Restore URL
              </button>
            ) : null}
            {onRestoreRequest ? (
              <button type="button" onClick={onRestoreRequest}>
                Restore request
              </button>
            ) : null}
          </span>
        </div>
      ) : null}

      <div className="request-url-block">
        <div className="request-line">
          <label className="visually-hidden" htmlFor="request-method">
            Method
          </label>
          <select
            id="request-method"
            className={`method-select method-${method.toLowerCase()} ${
              changed?.method ? 'compare-changed' : ''
            }`}
            value={method}
            onChange={(event) => onChangeMethod(event.target.value)}
            title={changed?.method ? `Method differs from ${baseLabel}` : undefined}
          >
            {methods.map((candidate) => (
              <option key={candidate} value={candidate}>
                {candidate}
              </option>
            ))}
          </select>

          <label className="visually-hidden" htmlFor="request-url">
            URL
          </label>
          <div className="url-field">
            <input
              id="request-url"
              ref={urlInputRef}
              className={`url-input ${changed?.url ? 'compare-changed' : ''}`}
              type="text"
              spellCheck={false}
              autoComplete="off"
              placeholder="https://example.com/path"
              value={urlRaw}
              onChange={(event) => onChangeUrl(event.target.value)}
              onScroll={syncUrlOverlayScroll}
              title={changed?.url ? `URL differs from ${baseLabel}` : undefined}
            />
            <div className="url-overlay" ref={urlOverlayRef} aria-hidden="true">
              {urlSegments.map((segment, index) =>
                segment.key == null ? (
                  <span key={index}>{segment.text}</span>
                ) : (
                  <span
                    key={index}
                    className={`url-token${segment.value == null ? ' url-token-unresolved' : ''}`}
                    title={
                      segment.value == null
                        ? `${segment.key} is not defined in the collection, folders, or active environment`
                        : `${segment.key} = ${segment.value || '(empty)'}`
                    }
                    onMouseDown={(event) => {
                      event.preventDefault();
                      urlInputRef.current?.focus();
                    }}
                  >
                    {segment.text}
                  </span>
                )
              )}
            </div>
          </div>
          <button
            type="button"
            className="send-button"
            disabled={sending}
            title="⌘/Ctrl+Enter — runs current (including unsaved) edits via Newman"
            onClick={onSend}
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
        {urlPreview.hasTokens ? (
          <div
            className={`url-preview${
              urlPreview.unresolved.length > 0 ? ' url-preview-unresolved' : ''
            }`}
            title={
              urlPreview.unresolved.length > 0
                ? `Unresolved: ${urlPreview.unresolved.join(', ')}`
                : 'Resolved from collection, folder, and active environment variables'
            }
          >
            <span className="url-preview-label">Preview</span>
            <code className="url-preview-value">{urlPreview.preview}</code>
          </div>
        ) : null}
      </div>

      <div className="request-section-tabs" role="tablist" aria-label="Request settings">
        {sections.map((section) => (
          <button
            key={section.key}
            type="button"
            role="tab"
            aria-selected={activeSection === section.key}
            className={activeSection === section.key ? 'active' : ''}
            onClick={() => setActiveSection(section.key)}
          >
            {section.label}
            {section.count ? <span className="tab-count">{section.count}</span> : null}
            {section.active ? (
              <span className="tab-dot" title={`${section.label} has content`} />
            ) : null}
            {section.changed ? (
              <span
                className="tab-change"
                title={`${section.label} differs from ${baseLabel}`}
              >
                ~
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {activeSectionChanged && onRestoreSection ? (
        <div className="compare-section-restore">
          <button type="button" onClick={() => onRestoreSection(activeSection)}>
            Restore {sections.find((section) => section.key === activeSection)?.label} from{' '}
            {baseLabel}
          </button>
        </div>
      ) : null}

      <div className="request-section-content">
        {activeSection === 'params' && (
          <QueryParamsPane
            url={request.url}
            onAdd={onAddQueryParam}
            onChange={onChangeQueryParam}
            onToggleDisabled={onToggleQueryParamDisabled}
            onRemove={onRemoveQueryParam}
          />
        )}

        {activeSection === 'auth' && (
          <AuthPane
            auth={request.auth}
            onChangeType={onChangeAuthType}
            onChangeBearerToken={onChangeBearerToken}
            onChangeBasic={onChangeBasicAuth}
            onChangeApiKey={onChangeApiKeyAuth}
          />
        )}

        {activeSection === 'headers' && (
          <HeaderTable
            headers={headers}
            onAdd={onAddHeader}
            onChange={onChangeHeader}
            onToggleDisabled={onToggleHeaderDisabled}
            onRemove={onRemoveHeader}
          />
        )}

        {activeSection === 'body' && (
          <BodyPane
            body={request.body}
            onChangeMode={onChangeBodyMode}
            onChangeRaw={onChangeBodyRaw}
            onAddUrlEncoded={onAddUrlEncoded}
            onChangeUrlEncoded={onChangeUrlEncoded}
            onToggleUrlEncodedDisabled={onToggleUrlEncodedDisabled}
            onRemoveUrlEncoded={onRemoveUrlEncoded}
          />
        )}

        {activeSection === 'prerequest' && (
          <ScriptsPane
            listen="prerequest"
            source={prerequestSource}
            onChange={onChangePrerequestScript}
          />
        )}

        {activeSection === 'tests' && (
          <ScriptsPane
            listen="test"
            source={testSource}
            onChange={onChangeTestScript}
          />
        )}
      </div>
    </div>
  );
}
