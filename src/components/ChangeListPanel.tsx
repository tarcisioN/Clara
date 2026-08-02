import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent
} from 'react';
import type { ChangeListEntry } from '../git/changeList.ts';
import { folderLabelForEntry } from '../git/changeList.ts';
import type { PostmanCollection } from '../postman/types.ts';
import type { GitRevision } from '../../electron/git.ts';
import {
  CHANGES_COLLAPSE_HEIGHT,
  CHANGES_DEFAULT_HEIGHT,
  clampChangesHeight
} from '../workspace/sidebar.ts';
import './ChangeListPanel.css';

type ChangeListPanelProps = {
  baseRef: string;
  defaultBase: string;
  branches: string[];
  recentRevisions: GitRevision[];
  currentBranch: string | null;
  compareSource: 'working' | 'saved';
  collection: PostmanCollection;
  /** Which collection these changes belong to (the active tab's). */
  collectionName: string;
  collectionPath: string;
  entries: ChangeListEntry[];
  activeKey: string | null;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onSelect: (entry: ChangeListEntry) => void;
  onContextMenu?: (event: MouseEvent<HTMLButtonElement>, entry: ChangeListEntry) => void;
  onPrev: () => void;
  onNext: () => void;
  onChangeBase: (baseRef: string) => void;
  onChangeSource: (source: 'working' | 'saved') => void;
  onRefresh: () => void;
};

function matchRecentRevision(
  baseRef: string,
  revisions: GitRevision[]
): GitRevision | null {
  const trimmed = baseRef.trim();
  if (!trimmed) {
    return null;
  }
  return (
    revisions.find(
      (revision) =>
        revision.sha === trimmed ||
        revision.shortSha === trimmed ||
        revision.sha.startsWith(trimmed)
    ) ?? null
  );
}

function ChangeBadge({ kind }: { kind: ChangeListEntry['changeKind'] }) {
  const label =
    kind === 'added' ? '+' : kind === 'removed' ? '−' : kind === 'moved' ? '↕' : '~';
  return (
    <span className={`change-list-badge change-list-badge-${kind}`} aria-hidden>
      {label}
    </span>
  );
}

function BranchSuggestionBox({
  value,
  branches,
  disabled,
  onChangeBase
}: {
  /** Branch/ref shown in the input. Empty when comparing against a revision SHA. */
  value: string;
  branches: string[];
  disabled?: boolean;
  onChangeBase: (baseRef: string) => void;
}) {
  const listboxId = useId();
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const suggestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...new Set(branches)]
      .filter((branch) => branch !== value || normalized !== value.toLowerCase())
      .filter((branch) => !normalized || branch.toLowerCase().includes(normalized))
      .sort((left, right) => {
        const leftStarts = left.toLowerCase().startsWith(normalized);
        const rightStarts = right.toLowerCase().startsWith(normalized);
        if (leftStarts !== rightStarts) {
          return leftStarts ? -1 : 1;
        }
        return left.localeCompare(right);
      })
      .slice(0, 3);
  }, [branches, query, value]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const choose = (ref: string) => {
    const trimmed = ref.trim();
    if (!trimmed) {
      setQuery(value);
      setOpen(false);
      return;
    }
    setQuery(trimmed);
    setOpen(false);
    if (trimmed !== value) {
      onChangeBase(trimmed);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && suggestions.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1));
    } else if (event.key === 'ArrowUp' && suggestions.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(open && suggestions[activeIndex] ? suggestions[activeIndex] : query);
    } else if (event.key === 'Escape') {
      setQuery(value);
      setOpen(false);
    }
  };

  return (
    <div
      className="change-list-base"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setQuery(value);
          setOpen(false);
        }
      }}
    >
      <span className="visually-hidden">Compare base</span>
      <input
        type="text"
        role="combobox"
        value={query}
        disabled={disabled}
        placeholder="branch"
        aria-label="Compare base branch or ref"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={open && suggestions.length > 0}
        aria-activedescendant={
          open && suggestions[activeIndex]
            ? `${listboxId}-${activeIndex}`
            : undefined
        }
        title="Type a branch, tag, or commit SHA"
        spellCheck={false}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {open && suggestions.length > 0 ? (
        <ul id={listboxId} className="branch-suggestions" role="listbox">
          {suggestions.map((branch, index) => (
            <li
              id={`${listboxId}-${index}`}
              key={branch}
              role="option"
              aria-selected={index === activeIndex}
            >
              <button
                type="button"
                className={index === activeIndex ? 'active' : ''}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(branch)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                {branch}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function ChangeListPanel({
  baseRef,
  defaultBase,
  branches,
  recentRevisions,
  currentBranch,
  compareSource,
  collection,
  collectionName,
  collectionPath,
  entries,
  activeKey,
  expanded,
  onExpandedChange,
  onSelect,
  onContextMenu,
  onPrev,
  onNext,
  onChangeBase,
  onChangeSource,
  onRefresh
}: ChangeListPanelProps) {
  const added = entries.filter((entry) => entry.changeKind === 'added').length;
  const modified = entries.filter((entry) => entry.changeKind === 'modified').length;
  const removed = entries.filter((entry) => entry.changeKind === 'removed').length;
  const moved = entries.filter((entry) => entry.changeKind === 'moved').length;
  const selectedRevision = useMemo(
    () => matchRecentRevision(baseRef, recentRevisions),
    [baseRef, recentRevisions]
  );
  const branchValue = selectedRevision ? '' : baseRef;
  const [height, setHeight] = useState(CHANGES_DEFAULT_HEIGHT);
  const panelRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const wasExpandedRef = useRef(expanded);

  useEffect(() => {
    if (expanded && !wasExpandedRef.current) {
      setHeight(CHANGES_DEFAULT_HEIGHT);
    }
    wasExpandedRef.current = expanded;
  }, [expanded]);

  const maxHeightForParent = () => {
    const sidebar = panelRef.current?.parentElement;
    if (!sidebar) {
      return undefined;
    }
    // Leave room for search, collections header, and environments header.
    return Math.max(CHANGES_DEFAULT_HEIGHT, sidebar.clientHeight - 160);
  };

  const onResizePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!expanded) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = {
      startY: event.clientY,
      startHeight: height
    };
  };

  const onResizePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = resizeRef.current;
    if (!drag) {
      return;
    }
    // Handle sits on the top edge: drag up → taller, drag down → shorter.
    const next = drag.startHeight + (drag.startY - event.clientY);
    if (next <= CHANGES_COLLAPSE_HEIGHT) {
      resizeRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // already released
      }
      onExpandedChange(false);
      return;
    }
    setHeight(clampChangesHeight(next, maxHeightForParent()));
  };

  const onResizePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current) {
      return;
    }
    resizeRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // already released
    }
  };

  const toggleExpanded = () => {
    if (expanded) {
      onExpandedChange(false);
      return;
    }
    setHeight(CHANGES_DEFAULT_HEIGHT);
    onExpandedChange(true);
  };

  let lastGroup: string | null = null;

  return (
    <div
      ref={panelRef}
      className={`sidebar-section sidebar-section-changes ${expanded ? '' : 'is-collapsed'}`.trim()}
      style={expanded ? { height } : undefined}
    >
      <div
        className="change-list-resize"
        role="separator"
        aria-orientation="horizontal"
        aria-valuemin={CHANGES_COLLAPSE_HEIGHT}
        aria-valuemax={maxHeightForParent() ?? 800}
        aria-valuenow={expanded ? height : CHANGES_COLLAPSE_HEIGHT}
        aria-label="Resize changes panel"
        aria-disabled={!expanded}
        tabIndex={expanded ? 0 : -1}
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
        onKeyDown={(event) => {
          if (!expanded) {
            return;
          }
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            const delta = event.key === 'ArrowUp' ? 16 : -16;
            const next = height + delta;
            if (next <= CHANGES_COLLAPSE_HEIGHT) {
              onExpandedChange(false);
              return;
            }
            setHeight(clampChangesHeight(next, maxHeightForParent()));
          }
        }}
      />

      <div className="sidebar-section-title change-list-header">
        <button
          type="button"
          className="sidebar-section-toggle change-list-title"
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse changes' : 'Expand changes'}
          onClick={toggleExpanded}
        >
          <span className="sidebar-chevron" aria-hidden>
            {expanded ? '▾' : '▸'}
          </span>
          <strong>Changes</strong>
          {!expanded ? (
            <span className="sidebar-count" title={`Collection: ${collectionPath}`}>
              {collectionName}
            </span>
          ) : null}
          <span className="sidebar-count" title="Change counts">
            +{added} ~{modified} ↕{moved} −{removed}
          </span>
        </button>
        <div className="change-list-actions">
          <button
            type="button"
            className="change-list-nav"
            aria-label="Refresh compare"
            title="Reload the file from disk and refresh the base from git"
            onClick={onRefresh}
          >
            ↻
          </button>
          <button
            type="button"
            className="change-list-nav"
            aria-label="Previous change"
            title="Previous change (⌥⌘[)"
            disabled={entries.length === 0}
            onClick={onPrev}
          >
            ‹
          </button>
          <button
            type="button"
            className="change-list-nav"
            aria-label="Next change"
            title="Next change (⌥⌘])"
            disabled={entries.length === 0}
            onClick={onNext}
          >
            ›
          </button>
        </div>
      </div>

      {expanded ? (
        <>
          <div className="change-list-scope">
            <span className="change-list-scope-collection" title={collectionPath}>
              {collectionName}
            </span>
            <span className="change-list-scope-branch">
              on{' '}
              <strong title={currentBranch ? 'Current branch' : 'No branch checked out'}>
                {currentBranch ?? 'detached HEAD'}
              </strong>
            </span>
          </div>

          <div className="change-list-controls">
            <BranchSuggestionBox
              value={branchValue}
              branches={branches}
              onChangeBase={onChangeBase}
            />
            <label
              className="change-list-revision"
              title={
                selectedRevision
                  ? `${selectedRevision.shortSha} — ${selectedRevision.subject}`
                  : 'Last 5 commits before HEAD'
              }
            >
              <span className="visually-hidden">Compare revision</span>
              <select
                value={selectedRevision?.sha ?? ''}
                aria-label="Compare recent revision"
                disabled={recentRevisions.length === 0}
                onChange={(event) => {
                  const next = event.target.value;
                  onChangeBase(next || defaultBase);
                }}
              >
                <option value="">rev</option>
                {recentRevisions.map((revision) => (
                  <option
                    key={revision.sha}
                    value={revision.sha}
                    title={revision.subject}
                  >
                    {revision.shortSha}
                  </option>
                ))}
              </select>
            </label>
            <label className="change-list-source">
              <span className="visually-hidden">Compare source</span>
              <select
                value={compareSource}
                aria-label="Compare source"
                title="Working tree includes unsaved edits; Saved uses the last written file"
                onChange={(event) =>
                  onChangeSource(event.target.value === 'saved' ? 'saved' : 'working')
                }
              >
                <option value="working">Working</option>
                <option value="saved">Saved</option>
              </select>
            </label>
          </div>

          <div className="change-list-summary">
            <span className="change-list-stat added">+{added}</span>
            <span className="change-list-stat modified">~{modified}</span>
            <span className="change-list-stat moved">↕{moved}</span>
            <span className="change-list-stat removed">−{removed}</span>
          </div>

          {entries.length === 0 ? (
            <p className="change-list-empty">No changes vs {baseRef}</p>
          ) : (
            <ul className="change-list">
              {entries.map((entry) => {
                const group = folderLabelForEntry(entry, collection);
                const showGroup = group !== null && group !== lastGroup;
                if (group !== null) {
                  lastGroup = group;
                }
                const selected = entry.key === activeKey;
                return (
                  <li key={entry.key}>
                    {showGroup ? <div className="change-list-group">{group}</div> : null}
                    <button
                      type="button"
                      className={`change-list-row ${selected ? 'selected' : ''} ${entry.changeKind}`}
                      onClick={() => onSelect(entry)}
                      onContextMenu={(event) => onContextMenu?.(event, entry)}
                    >
                      <ChangeBadge kind={entry.changeKind} />
                      {entry.nodeKind === 'request' && entry.method ? (
                        <span className={`tree-method method-${entry.method.toLowerCase()}`}>
                          {entry.method}
                        </span>
                      ) : entry.nodeKind === 'variables' ? (
                        <span className="change-list-folder-icon" aria-hidden>
                          {'{}'}
                        </span>
                      ) : (
                        <span className="change-list-folder-icon" aria-hidden>
                          ▸
                        </span>
                      )}
                      <span className="change-list-name" title={entry.name}>
                        {entry.name}
                      </span>
                      {entry.type === 'current' &&
                      entry.changeKind === 'moved' &&
                      entry.fromIndex != null &&
                      entry.toIndex != null ? (
                        <span className="change-list-move-hint">
                          #{entry.fromIndex} → #{entry.toIndex}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}
