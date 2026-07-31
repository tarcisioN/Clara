import type { PostmanItem } from '../postman/types.ts';
import {
  childPath,
  isFolder,
  isRequest,
  type ItemPath
} from '../postman/tree.ts';
import { ITEM_PATH_MIME } from './dnd.ts';
import './CollectionTree.css';

type CollectionTreeProps = {
  items: PostmanItem[] | undefined;
  expanded: Set<ItemPath>;
  selectedPath: ItemPath | null;
  onToggleFolder: (path: ItemPath) => void;
  onSelectRequest: (path: ItemPath) => void;
};

type TreeNodeProps = {
  item: PostmanItem;
  path: ItemPath;
  depth: number;
  expanded: Set<ItemPath>;
  selectedPath: ItemPath | null;
  onToggleFolder: (path: ItemPath) => void;
  onSelectRequest: (path: ItemPath) => void;
};

function TreeNode({
  item,
  path,
  depth,
  expanded,
  selectedPath,
  onToggleFolder,
  onSelectRequest
}: TreeNodeProps) {
  const folder = isFolder(item);
  const request = isRequest(item);
  const name = item.name?.trim() || (folder ? '(folder)' : '(request)');
  const isExpanded = expanded.has(path);
  const isSelected = selectedPath === path;

  if (folder) {
    return (
      <li className="tree-node">
        <button
          type="button"
          className={`tree-row folder ${isExpanded ? 'expanded' : ''}`}
          style={{ paddingLeft: 10 + depth * 14 }}
          onClick={() => onToggleFolder(path)}
          aria-expanded={isExpanded}
        >
          <span className="tree-chevron" aria-hidden>
            {isExpanded ? '▾' : '▸'}
          </span>
          <span className="tree-icon" aria-hidden />
          <span className="tree-label">{name}</span>
        </button>
        {isExpanded && (
          <ul className="tree-children">
            {(item.item ?? []).map((child, index) => (
              <TreeNode
                key={childPath(path, index)}
                item={child}
                path={childPath(path, index)}
                depth={depth + 1}
                expanded={expanded}
                selectedPath={selectedPath}
                onToggleFolder={onToggleFolder}
                onSelectRequest={onSelectRequest}
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
      <button
        type="button"
        className={`tree-row request ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: 10 + depth * 14 }}
        onClick={() => onSelectRequest(path)}
        aria-current={isSelected ? 'true' : undefined}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(ITEM_PATH_MIME, path);
          event.dataTransfer.setData('text/plain', name);
          event.dataTransfer.effectAllowed = 'copy';
        }}
      >
        <span className="tree-chevron spacer" aria-hidden />
        <span className={`tree-method method-${method.toLowerCase()}`}>{method}</span>
        <span className="tree-label">{name}</span>
      </button>
    </li>
  );
}

export default function CollectionTree({
  items,
  expanded,
  selectedPath,
  onToggleFolder,
  onSelectRequest
}: CollectionTreeProps) {
  if (!items || items.length === 0) {
    return <p className="tree-empty">Collection has no items.</p>;
  }

  return (
    <ul className="tree-root">
      {items.map((item, index) => (
        <TreeNode
          key={childPath(null, index)}
          item={item}
          path={childPath(null, index)}
          depth={0}
          expanded={expanded}
          selectedPath={selectedPath}
          onToggleFolder={onToggleFolder}
          onSelectRequest={onSelectRequest}
        />
      ))}
    </ul>
  );
}
