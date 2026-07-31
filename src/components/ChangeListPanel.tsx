import type { ChangeListEntry } from '../git/changeList.ts';
import { folderLabelForEntry } from '../git/changeList.ts';
import type { PostmanCollection } from '../postman/types.ts';
import './ChangeListPanel.css';

type ChangeListPanelProps = {
  baseRef: string;
  collection: PostmanCollection;
  entries: ChangeListEntry[];
  activeKey: string | null;
  onSelect: (entry: ChangeListEntry) => void;
  onPrev: () => void;
  onNext: () => void;
};

function ChangeBadge({ kind }: { kind: ChangeListEntry['changeKind'] }) {
  const label = kind === 'added' ? '+' : kind === 'removed' ? '−' : '~';
  return (
    <span className={`change-list-badge change-list-badge-${kind}`} aria-hidden>
      {label}
    </span>
  );
}

export default function ChangeListPanel({
  baseRef,
  collection,
  entries,
  activeKey,
  onSelect,
  onPrev,
  onNext
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
          <span className="sidebar-count" title={`Compared to ${baseRef}`}>
            vs {baseRef}
          </span>
        </div>
        <div className="change-list-actions">
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
