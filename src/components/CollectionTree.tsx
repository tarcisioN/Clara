import type { MouseEvent } from 'react';
import type { PostmanItem } from '../postman/types.ts';
import {
  childPath,
  isFolder,
  isRequest,
  type ItemPath
} from '../postman/tree.ts';
import { encodeItemDrag, ITEM_PATH_MIME } from './dnd.ts';
import './CollectionTree.css';

export type TreeTarget =
  | { kind: 'folder'; collectionPath: string; path: ItemPath }
  | { kind: 'request'; collectionPath: string; path: ItemPath };

type CollectionTreeProps = {
  collectionPath: string;
  items: PostmanItem[] | undefined;
  expanded: Set<ItemPath>;
  selectedPath: ItemPath | null;
  onToggleFolder: (path: ItemPath) => void;
  onSelectFolder: (path: ItemPath) => void;
  onSelectRequest: (path: ItemPath) => void;
  onContextMenu: (event: MouseEvent, target: TreeTarget) => void;
};

type TreeNodeProps = {
  collectionPath: string;
  item: PostmanItem;
  path: ItemPath;
  depth: number;
  expanded: Set<ItemPath>;
  selectedPath: ItemPath | null;
  onToggleFolder: (path: ItemPath) => void;
  onSelectFolder: (path: ItemPath) => void;
  onSelectRequest: (path: ItemPath) => void;
  onContextMenu: (event: MouseEvent, target: TreeTarget) => void;
};

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
  onToggleFolder,
  onSelectFolder,
  onSelectRequest,
  onContextMenu
}: TreeNodeProps) {
  const folder = isFolder(item);
  const request = isRequest(item);
  const name = item.name?.trim() || (folder ? '(folder)' : '(request)');
  const isExpanded = expanded.has(path);
  const isSelected = selectedPath === path;

  if (folder) {
    return (
      <li className="tree-node">
        <div
          className={`tree-row folder ${isExpanded ? 'expanded' : ''} ${
            isSelected ? 'selected' : ''
          }`}
          style={{ paddingLeft: 10 + depth * 14 }}
          onContextMenu={(event) => {
            event.preventDefault();
            onContextMenu(event, { kind: 'folder', collectionPath, path });
          }}
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
            onClick={() => onSelectFolder(path)}
            aria-current={isSelected ? 'true' : undefined}
          >
            <span className="tree-icon" aria-hidden />
            <span className="tree-label">{name}</span>
          </button>
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
                onToggleFolder={onToggleFolder}
                onSelectFolder={onSelectFolder}
                onSelectRequest={onSelectRequest}
                onContextMenu={onContextMenu}
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
        className={`tree-row request ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: 10 + depth * 14 }}
        onContextMenu={(event) => {
          event.preventDefault();
          onContextMenu(event, { kind: 'request', collectionPath, path });
        }}
      >
        <button
          type="button"
          className="tree-request-select"
          onClick={() => onSelectRequest(path)}
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
  onToggleFolder,
  onSelectFolder,
  onSelectRequest,
  onContextMenu
}: CollectionTreeProps) {
  if (!items || items.length === 0) {
    return <p className="tree-empty">Collection has no items.</p>;
  }

  return (
    <ul className="tree-root">
      {items.map((item, index) => (
        <TreeNode
          key={childPath(null, index)}
          collectionPath={collectionPath}
          item={item}
          path={childPath(null, index)}
          depth={0}
          expanded={expanded}
          selectedPath={selectedPath}
          onToggleFolder={onToggleFolder}
          onSelectFolder={onSelectFolder}
          onSelectRequest={onSelectRequest}
          onContextMenu={onContextMenu}
        />
      ))}
    </ul>
  );
}
