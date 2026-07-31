import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import type { ChangeListEntry } from '../git/changeList.ts';
import { folderLabelForEntry } from '../git/changeList.ts';
import type { PostmanCollection } from '../postman/types.ts';
import './ChangeListPanel.css';

type ChangeListPanelProps = {
  baseRef: string;
  branches: string[];
  currentBranch: string | null;
  compareSource: 'working' | 'saved';
  collection: PostmanCollection;
  entries: ChangeListEntry[];
  activeKey: string | null;
  onSelect: (entry: ChangeListEntry) => void;
  onPrev: () => void;
  onNext: () => void;
  onChangeBase: (baseRef: string) => void;
  onChangeSource: (source: 'working' | 'saved') => void;
  onRefresh: () => void;
};

function ChangeBadge({ kind }: { kind: ChangeListEntry['changeKind'] }) {
  const label = kind === 'added' ? '+' : kind === 'removed' ? '−' : '~';
  return (
    <span className={`change-list-badge change-list-badge-${kind}`} aria-hidden>
      {label}
    </span>
  );
}

function BranchSuggestionBox({
  baseRef,
  branches,
  onChangeBase
}: {
  baseRef: string;
  branches: string[];
  onChangeBase: (baseRef: string) => void;
}) {
  const listboxId = useId();
  const [query, setQuery] = useState(baseRef);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setQuery(baseRef);
  }, [baseRef]);

  const suggestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...new Set(branches)]
      .filter((branch) => branch !== baseRef || normalized !== baseRef.toLowerCase())
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
  }, [baseRef, branches, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const choose = (ref: string) => {
    const trimmed = ref.trim();
    if (!trimmed) {
      setQuery(baseRef);
      setOpen(false);
      return;
    }
    setQuery(trimmed);
    setOpen(false);
    if (trimmed !== baseRef) {
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
      setQuery(baseRef);
      setOpen(false);
    }
  };

  return (
    <div
      className="change-list-base"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setQuery(baseRef);
          setOpen(false);
        }
      }}
    >
      <span className="visually-hidden">Compare base</span>
      <input
        type="text"
        role="combobox"
        value={query}
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
  branches,
  currentBranch,
  compareSource,
  collection,
  entries,
  activeKey,
  onSelect,
  onPrev,
  onNext,
  onChangeBase,
  onChangeSource,
  onRefresh
}: ChangeListPanelProps) {
  const added = entries.filter((entry) => entry.changeKind === 'added').length;
  const modified = entries.filter((entry) => entry.changeKind === 'modified').length;
  const removed = entries.filter((entry) => entry.changeKind === 'removed').length;

  let lastGroup: string | null = null;

  return (
    <div className="sidebar-section sidebar-section-changes">
      <div className="sidebar-section-title change-list-header">
        <div className="change-list-title">
          <strong>Changes</strong>
          {currentBranch ? (
            <span className="sidebar-count" title="Current branch">
              {currentBranch}
            </span>
          ) : null}
        </div>
        <div className="change-list-actions">
          <button
            type="button"
            className="change-list-nav"
            aria-label="Refresh compare"
            title="Refresh base from git"
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

      <div className="change-list-controls">
        <BranchSuggestionBox
          baseRef={baseRef}
          branches={branches}
          onChangeBase={onChangeBase}
        />
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
        <span className="change-list-stat removed">−{removed}</span>
      </div>

      {entries.length === 0 ? (
        <p className="change-list-empty">No changes vs {baseRef}</p>
      ) : (
        <ul className="change-list">
          {entries.map((entry) => {
            const group = folderLabelForEntry(entry, collection);
            const showGroup = group !== lastGroup;
            lastGroup = group;
            const selected = entry.key === activeKey;
            return (
              <li key={entry.key}>
                {showGroup ? <div className="change-list-group">{group}</div> : null}
                <button
                  type="button"
                  className={`change-list-row ${selected ? 'selected' : ''} ${entry.changeKind}`}
                  onClick={() => onSelect(entry)}
                >
                  <ChangeBadge kind={entry.changeKind} />
                  {entry.nodeKind === 'request' && entry.method ? (
                    <span className={`tree-method method-${entry.method.toLowerCase()}`}>
                      {entry.method}
                    </span>
                  ) : (
                    <span className="change-list-folder-icon" aria-hidden>
                      ▸
                    </span>
                  )}
                  <span className="change-list-name">{entry.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
