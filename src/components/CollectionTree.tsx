import { useState, type DragEvent, type MouseEvent } from 'react';
import type { PostmanItem } from '../postman/types.ts';
import {
  childPath,
  isFolder,
  isRequest,
  type ItemPath
} from '../postman/tree.ts';
import type { MoveTarget } from '../postman/structure.ts';
import {
  pathVisibleWhenChangedOnly,
  removedUnderParent,
  type ChangeKind,
  type RemovedGhost,
  type StructuralDiff
} from '../git/structuralDiff.ts';
import { itemMatchesQuery } from '../workspace/sidebarSearch.ts';
import { decodeItemDrag, encodeItemDrag, ITEM_PATH_MIME } from './dnd.ts';
import { tabKey } from '../workspace/tabs.ts';
import './CollectionTree.css';

export type TreeTarget =
  | { kind: 'folder'; collectionPath: string; path: ItemPath }
  | { kind: 'request'; collectionPath: string; path: ItemPath };

export type TreeDropTarget = {
  collectionPath: string;
  target: MoveTarget;
};

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
  onMoveItem?: (
    fromCollectionPath: string,
    fromPath: ItemPath,
    toCollectionPath: string,
    target: MoveTarget
  ) => void;
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
  dropIndicator: TreeDropTarget | null;
  draggingPath: { collectionPath: string; path: ItemPath } | null;
  onSelectRemoved?: (ghost: RemovedGhost) => void;
  onToggleFolder: (path: ItemPath) => void;
  onSelectFolder: (path: ItemPath, options?: { forceNew?: boolean }) => void;
  onSelectRequest: (path: ItemPath, options?: { forceNew?: boolean }) => void;
  onContextMenu: (event: MouseEvent, target: TreeTarget) => void;
  onDragPath: (payload: { collectionPath: string; path: ItemPath } | null) => void;
  onDropIndicator: (indicator: TreeDropTarget | null) => void;
  onMoveItem?: CollectionTreeProps['onMoveItem'];
};

function openModifiers(event: { metaKey: boolean; ctrlKey: boolean }): {
  forceNew?: boolean;
} {
  return event.metaKey || event.ctrlKey ? { forceNew: true } : {};
}

function hasItemDrag(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes(ITEM_PATH_MIME);
}

/** Vertical place for a row: folders expose a middle "into" band. */
function rowDropRelation(
  event: DragEvent<HTMLElement>,
  folder: boolean
): MoveTarget['relation'] {
  const rect = event.currentTarget.getBoundingClientRect();
  const y = event.clientY - rect.top;
  const ratio = rect.height > 0 ? y / rect.height : 0.5;
  if (folder) {
    if (ratio < 0.25) {
      return 'before';
    }
    if (ratio > 0.75) {
      return 'after';
    }
    return 'into';
  }
  return ratio < 0.5 ? 'before' : 'after';
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

function dropClass(
  dropIndicator: TreeDropTarget | null,
  collectionPath: string,
  path: ItemPath
): string {
  if (!dropIndicator || dropIndicator.collectionPath !== collectionPath) {
    return '';
  }
  const { target } = dropIndicator;
  if (target.relation === 'into') {
    return target.path === path ? 'drop-into' : '';
  }
  if (target.path !== path) {
    return '';
  }
  return target.relation === 'before' ? 'drop-before' : 'drop-after';
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
  dropIndicator,
  draggingPath,
  onSelectRemoved,
  onToggleFolder,
  onSelectFolder,
  onSelectRequest,
  onContextMenu,
  onDragPath,
  onDropIndicator,
  onMoveItem
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
  const treeChangeKind: ChangeKind =
    changeKind === 'unchanged' && nestedCount > 0 ? 'modified' : changeKind;
  const isDragSource =
    draggingPath?.collectionPath === collectionPath && draggingPath.path === path;

  const acceptDrop = (event: DragEvent<HTMLElement>) => {
    if (!onMoveItem || !hasItemDrag(event)) {
      return false;
    }
    if (
      draggingPath &&
      draggingPath.collectionPath === collectionPath &&
      (draggingPath.path === path || path.startsWith(`${draggingPath.path}.`))
    ) {
      // Never highlight self / own descendants as a drop target.
      return false;
    }
    return true;
  };

  const onRowDragOver = (event: DragEvent<HTMLElement>) => {
    if (!acceptDrop(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    const relation = rowDropRelation(event, folder);
    const target: MoveTarget =
      relation === 'into' ? { relation: 'into', path } : { relation, path };
    onDropIndicator({ collectionPath, target });
  };

  const onRowDrop = (event: DragEvent<HTMLElement>) => {
    if (!onMoveItem || !hasItemDrag(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const payload = decodeItemDrag(event.dataTransfer.getData(ITEM_PATH_MIME));
    onDropIndicator(null);
    onDragPath(null);
    if (!payload) {
      return;
    }
    const relation = rowDropRelation(event, folder);
    const target: MoveTarget =
      relation === 'into' ? { relation: 'into', path } : { relation, path };
    onMoveItem(payload.collectionPath, payload.path, collectionPath, target);
  };

  const sharedNodeProps = {
    collectionPath,
    depth: depth + 1,
    expanded,
    selectedPath,
    filterQuery,
    changedOnly,
    structuralDiff,
    focusedRemovedKey,
    dropIndicator,
    draggingPath,
    onSelectRemoved,
    onToggleFolder,
    onSelectFolder,
    onSelectRequest,
    onContextMenu,
    onDragPath,
    onDropIndicator,
    onMoveItem
  };

  if (folder) {
    const ghosts = structuralDiff
      ? removedUnderParent(structuralDiff.removed, path)
      : [];
    return (
      <li className="tree-node">
        <div
          className={`tree-row folder ${isExpanded ? 'expanded' : ''} ${
            isSelected ? 'selected' : ''
          } ${treeChangeKind !== 'unchanged' ? `change-${treeChangeKind}` : ''} ${
            isDragSource ? 'dragging' : ''
          } ${dropClass(dropIndicator, collectionPath, path)}`.trim()}
          style={{ paddingLeft: 10 + depth * 14 }}
          onContextMenu={(event) => {
            event.preventDefault();
            onContextMenu(event, { kind: 'folder', collectionPath, path });
          }}
          onDragOver={onRowDragOver}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
              return;
            }
            onDropIndicator(null);
          }}
          onDrop={onRowDrop}
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
            kind={treeChangeKind}
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
                {...sharedNodeProps}
                item={child}
                path={childPath(path, index)}
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
        } ${isDragSource ? 'dragging' : ''} ${dropClass(
          dropIndicator,
          collectionPath,
          path
        )}`.trim()}
        style={{ paddingLeft: 10 + depth * 14 }}
        onContextMenu={(event) => {
          event.preventDefault();
          onContextMenu(event, { kind: 'request', collectionPath, path });
        }}
        onDragOver={onRowDragOver}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
            return;
          }
          onDropIndicator(null);
        }}
        onDrop={onRowDrop}
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
            event.dataTransfer.effectAllowed = onMoveItem ? 'copyMove' : 'copy';
            onDragPath({ collectionPath, path });
          }}
          onDragEnd={() => {
            onDragPath(null);
            onDropIndicator(null);
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
  onContextMenu,
  onMoveItem
}: CollectionTreeProps) {
  const [dropIndicator, setDropIndicator] = useState<TreeDropTarget | null>(null);
  const [draggingPath, setDraggingPath] = useState<{
    collectionPath: string;
    path: ItemPath;
  } | null>(null);

  if (!items || items.length === 0) {
    const rootGhosts = structuralDiff
      ? removedUnderParent(structuralDiff.removed, null)
      : [];
    if (rootGhosts.length === 0 && !onMoveItem) {
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

  const rootDropInto =
    dropIndicator?.collectionPath === collectionPath &&
    dropIndicator.target.relation === 'into' &&
    dropIndicator.target.path === null;

  return (
    <ul
      className={`tree-root ${rootDropInto ? 'drop-into-root' : ''}`.trim()}
      onDragOver={(event) => {
        if (!onMoveItem || !hasItemDrag(event)) {
          return;
        }
        // Empty / below-list drop: nest at collection root.
        if ((items ?? []).length > 0 && event.target !== event.currentTarget) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setDropIndicator({
          collectionPath,
          target: { relation: 'into', path: null }
        });
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return;
        }
        setDropIndicator(null);
      }}
      onDrop={(event) => {
        if (!onMoveItem || !hasItemDrag(event)) {
          return;
        }
        if ((items ?? []).length > 0 && event.target !== event.currentTarget) {
          return;
        }
        event.preventDefault();
        const payload = decodeItemDrag(event.dataTransfer.getData(ITEM_PATH_MIME));
        setDropIndicator(null);
        setDraggingPath(null);
        if (!payload) {
          return;
        }
        onMoveItem(payload.collectionPath, payload.path, collectionPath, {
          relation: 'into',
          path: null
        });
      }}
    >
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
          dropIndicator={dropIndicator}
          draggingPath={draggingPath}
          onSelectRemoved={onSelectRemoved}
          onToggleFolder={onToggleFolder}
          onSelectFolder={onSelectFolder}
          onSelectRequest={onSelectRequest}
          onContextMenu={onContextMenu}
          onDragPath={setDraggingPath}
          onDropIndicator={setDropIndicator}
          onMoveItem={onMoveItem}
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
      {(!items || items.length === 0) && rootGhosts.length === 0 ? (
        <p className="tree-empty">Drop requests here</p>
      ) : null}
    </ul>
  );
}
