import type { MouseEvent } from 'react';
import type { PostmanItem } from '../postman/types.ts';
import {
  childPath,
  isFolder,
  isRequest,
  type ItemPath
} from '../postman/tree.ts';
import {
  pathVisibleWhenChangedOnly,
  removedUnderParent,
  type ChangeKind,
  type RemovedGhost,
  type StructuralDiff
} from '../git/structuralDiff.ts';
import { itemMatchesQuery } from '../workspace/sidebarSearch.ts';
import { encodeItemDrag, ITEM_PATH_MIME } from './dnd.ts';
import { tabKey } from '../workspace/tabs.ts';
import './CollectionTree.css';

export type TreeTarget =
  | { kind: 'folder'; collectionPath: string; path: ItemPath }
  | { kind: 'request'; collectionPath: string; path: ItemPath };

type CollectionTreeProps = {
  collectionPath: string;
  items: PostmanItem[] | undefined;
  expanded: Set<ItemPath>;
  selectedPath: ItemPath | null;
  filterQuery?: string;
  changedOnly?: boolean;
  structuralDiff?: StructuralDiff | null;
  focusedRemovedKey?: string | null;
  onSelectRemoved?: (ghost: RemovedGhost) => void;
  onToggleFolder: (path: ItemPath) => void;
  onSelectFolder: (path: ItemPath, options?: { forceNew?: boolean }) => void;
  onSelectRequest: (path: ItemPath, options?: { forceNew?: boolean }) => void;
  onContextMenu: (event: MouseEvent, target: TreeTarget) => void;
};

type TreeNodeProps = {
  collectionPath: string;
  item: PostmanItem;
  path: ItemPath;
  depth: number;
  expanded: Set<ItemPath>;
  selectedPath: ItemPath | null;
  filterQuery: string;
  changedOnly: boolean;
  structuralDiff: StructuralDiff | null;
  focusedRemovedKey: string | null;
  onSelectRemoved?: (ghost: RemovedGhost) => void;
  onToggleFolder: (path: ItemPath) => void;
  onSelectFolder: (path: ItemPath, options?: { forceNew?: boolean }) => void;
  onSelectRequest: (path: ItemPath, options?: { forceNew?: boolean }) => void;
  onContextMenu: (event: MouseEvent, target: TreeTarget) => void;
};

function openModifiers(event: { metaKey: boolean; ctrlKey: boolean }): {
  forceNew?: boolean;
} {
  return event.metaKey || event.ctrlKey ? { forceNew: true } : {};
}

function ChangeMarker({ kind, count }: { kind: ChangeKind | 'removed'; count?: number }) {
  if (kind === 'unchanged') {
    return null;
  }
  const label =
    kind === 'added' ? 'Added' : kind === 'removed' ? 'Removed' : 'Modified';
  const badge =
    typeof count === 'number' && count > 0 && kind === 'modified' ? String(count) : null;
  return (
    <span
      className={`tree-change tree-change-${kind}`}
      title={badge ? `${label} · ${badge} under` : label}
      aria-label={badge ? `${label}, ${badge} changes under` : label}
    >
      {badge ?? (kind === 'added' ? '+' : kind === 'removed' ? '−' : '~')}
    </span>
  );
}

function RemovedRow({
  ghost,
  depth,
  focused,
  onSelect
}: {
  ghost: RemovedGhost;
  depth: number;
  focused: boolean;
  onSelect?: (ghost: RemovedGhost) => void;
}) {
  return (
    <li className="tree-node tree-node-removed">
      <div
        className={`tree-row ${ghost.kind} removed ${focused ? 'selected' : ''} ${
          onSelect ? 'clickable' : ''
        }`}
        style={{ paddingLeft: 10 + depth * 14 }}
        title={`Removed vs base: ${ghost.name}`}
        data-sidebar-key={ghost.key}
        onClick={onSelect ? () => onSelect(ghost) : undefined}
        role={onSelect ? 'button' : undefined}
        tabIndex={onSelect ? 0 : undefined}
        onKeyDown={
          onSelect
            ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(ghost);
                }
              }
            : undefined
        }
      >
        <span className="tree-chevron spacer" aria-hidden />
        {ghost.kind === 'request' && ghost.method ? (
          <span className={`tree-method method-${ghost.method.toLowerCase()}`}>
            {ghost.method}
          </span>
        ) : (
          <span className="tree-icon" aria-hidden />
        )}
        <span className="tree-label">{ghost.name}</span>
        <ChangeMarker kind="removed" />
      </div>
    </li>
  );
}

function MoreButton({
  label,
  onOpen
}: {
  label: string;
  onOpen: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      className="tree-more"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpen(event);
      }}
    >
      ···
    </button>
  );
}

function TreeNode({
  collectionPath,
  item,
  path,
  depth,
  expanded,
  selectedPath,
  filterQuery,
  changedOnly,
  structuralDiff,
  focusedRemovedKey,
  onSelectRemoved,
  onToggleFolder,
  onSelectFolder,
  onSelectRequest,
  onContextMenu
}: TreeNodeProps) {
  if (filterQuery && !itemMatchesQuery(item, filterQuery)) {
    return null;
  }

  if (
    changedOnly &&
    structuralDiff &&
    !pathVisibleWhenChangedOnly(
      path,
      structuralDiff.statusByPath,
      structuralDiff.descendantChangeCount
    )
  ) {
    return null;
  }

  const folder = isFolder(item);
  const request = isRequest(item);
  const name = item.name?.trim() || (folder ? '(folder)' : '(request)');
  const isExpanded = expanded.has(path);
  const isSelected = selectedPath === path;
  const changeKind = structuralDiff?.statusByPath.get(path) ?? 'unchanged';
  const nestedCount = structuralDiff?.descendantChangeCount.get(path) ?? 0;

  if (folder) {
    const ghosts = structuralDiff
      ? removedUnderParent(structuralDiff.removed, path)
      : [];
    return (
      <li className="tree-node">
        <div
          className={`tree-row folder ${isExpanded ? 'expanded' : ''} ${
            isSelected ? 'selected' : ''
          } ${changeKind !== 'unchanged' ? `change-${changeKind}` : ''}`}
          style={{ paddingLeft: 10 + depth * 14 }}
          onContextMenu={(event) => {
            event.preventDefault();
            onContextMenu(event, { kind: 'folder', collectionPath, path });
          }}
          data-sidebar-key={tabKey({ kind: 'folder', collectionPath, path })}
        >
          <button
            type="button"
            className="tree-chevron-button"
            aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
            aria-expanded={isExpanded}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFolder(path);
            }}
          >
            <span className="tree-chevron" aria-hidden>
              {isExpanded ? '▾' : '▸'}
            </span>
          </button>
          <button
            type="button"
            className="tree-folder-select"
            onClick={(event) => onSelectFolder(path, openModifiers(event))}
            aria-current={isSelected ? 'true' : undefined}
          >
            <span className="tree-icon" aria-hidden />
            <span className="tree-label">{name}</span>
          </button>
          <ChangeMarker
            kind={changeKind}
            count={nestedCount > 0 ? nestedCount : undefined}
          />
          <MoreButton
            label={`Folder actions for ${name}`}
            onOpen={(event) =>
              onContextMenu(event, { kind: 'folder', collectionPath, path })
            }
          />
        </div>
        {isExpanded && (
          <ul className="tree-children">
            {(item.item ?? []).map((child, index) => (
              <TreeNode
                key={childPath(path, index)}
                collectionPath={collectionPath}
                item={child}
                path={childPath(path, index)}
                depth={depth + 1}
                expanded={expanded}
                selectedPath={selectedPath}
                filterQuery={filterQuery}
                changedOnly={changedOnly}
                structuralDiff={structuralDiff}
                focusedRemovedKey={focusedRemovedKey}
                onSelectRemoved={onSelectRemoved}
                onToggleFolder={onToggleFolder}
                onSelectFolder={onSelectFolder}
                onSelectRequest={onSelectRequest}
                onContextMenu={onContextMenu}
              />
            ))}
            {ghosts.map((ghost) => (
              <RemovedRow
                key={ghost.key}
                ghost={ghost}
                depth={depth + 1}
                focused={focusedRemovedKey === ghost.key}
                onSelect={onSelectRemoved}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  if (!request) {
    return null;
  }

  const method =
    typeof item.request === 'string'
      ? 'GET'
      : (item.request?.method ?? 'GET').toUpperCase();

  return (
    <li className="tree-node">
      <div
        className={`tree-row request ${isSelected ? 'selected' : ''} ${
          changeKind !== 'unchanged' ? `change-${changeKind}` : ''
        }`}
        style={{ paddingLeft: 10 + depth * 14 }}
        onContextMenu={(event) => {
          event.preventDefault();
          onContextMenu(event, { kind: 'request', collectionPath, path });
        }}
        data-sidebar-key={tabKey({ kind: 'request', collectionPath, path })}
      >
        <button
          type="button"
          className="tree-request-select"
          onClick={(event) => onSelectRequest(path, openModifiers(event))}
          aria-current={isSelected ? 'true' : undefined}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData(
              ITEM_PATH_MIME,
              encodeItemDrag({ collectionPath, path })
            );
            event.dataTransfer.setData('text/plain', name);
            event.dataTransfer.effectAllowed = 'copy';
          }}
        >
          <span className="tree-chevron spacer" aria-hidden />
          <span className={`tree-method method-${method.toLowerCase()}`}>{method}</span>
          <span className="tree-label">{name}</span>
        </button>
        <ChangeMarker kind={changeKind} />
        <MoreButton
          label={`Request actions for ${name}`}
          onOpen={(event) =>
            onContextMenu(event, { kind: 'request', collectionPath, path })
          }
        />
      </div>
    </li>
  );
}

export default function CollectionTree({
  collectionPath,
  items,
  expanded,
  selectedPath,
  filterQuery = '',
  changedOnly = false,
  structuralDiff = null,
  focusedRemovedKey = null,
  onSelectRemoved,
  onToggleFolder,
  onSelectFolder,
  onSelectRequest,
  onContextMenu
}: CollectionTreeProps) {
  if (!items || items.length === 0) {
    const rootGhosts = structuralDiff
      ? removedUnderParent(structuralDiff.removed, null)
      : [];
    if (rootGhosts.length === 0) {
      return <p className="tree-empty">Collection has no items.</p>;
    }
  }

  const visible = filterQuery
    ? (items ?? []).some((item) => itemMatchesQuery(item, filterQuery))
    : true;

  if (filterQuery && !visible && !(structuralDiff && changedOnly)) {
    return null;
  }

  const rootGhosts = structuralDiff
    ? removedUnderParent(structuralDiff.removed, null)
    : [];

  return (
    <ul className="tree-root">
      {(items ?? []).map((item, index) => (
        <TreeNode
          key={childPath(null, index)}
          collectionPath={collectionPath}
          item={item}
          path={childPath(null, index)}
          depth={0}
          expanded={expanded}
          selectedPath={selectedPath}
          filterQuery={filterQuery}
          changedOnly={changedOnly}
          structuralDiff={structuralDiff}
          focusedRemovedKey={focusedRemovedKey}
          onSelectRemoved={onSelectRemoved}
          onToggleFolder={onToggleFolder}
          onSelectFolder={onSelectFolder}
          onSelectRequest={onSelectRequest}
          onContextMenu={onContextMenu}
        />
      ))}
      {rootGhosts.map((ghost) => (
        <RemovedRow
          key={ghost.key}
          ghost={ghost}
          depth={0}
          focused={focusedRemovedKey === ghost.key}
          onSelect={onSelectRemoved}
        />
      ))}
    </ul>
  );
}
