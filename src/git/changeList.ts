import type { PostmanCollection, PostmanItem } from '../postman/types.ts';
import {
  childPath,
  isFolder,
  type ItemPath
} from '../postman/tree.ts';
import {
  removedUnderParent,
  type ChangeKind,
  type RemovedGhost,
  type StructuralDiff
} from './structuralDiff.ts';

export type ChangeListEntry =
  | {
      type: 'current';
      key: string;
      path: ItemPath;
      changeKind: Exclude<ChangeKind, 'unchanged'>;
      name: string;
      nodeKind: 'folder' | 'request';
      method?: string;
      parentPath: ItemPath | null;
    }
  | {
      type: 'removed';
      key: string;
      changeKind: 'removed';
      ghost: RemovedGhost;
      parentPath: ItemPath | null;
      name: string;
      nodeKind: 'folder' | 'request';
      method?: string;
    };

function parentOf(path: ItemPath): ItemPath | null {
  const index = path.lastIndexOf('.');
  return index === -1 ? null : path.slice(0, index);
}

function describeItem(item: PostmanItem): {
  name: string;
  nodeKind: 'folder' | 'request';
  method?: string;
} {
  if (isFolder(item)) {
    return {
      name: item.name?.trim() || '(folder)',
      nodeKind: 'folder'
    };
  }
  const method =
    typeof item.request === 'string'
      ? 'GET'
      : (item.request?.method ?? 'GET').toUpperCase();
  return {
    name: item.name?.trim() || '(request)',
    nodeKind: 'request',
    method
  };
}

/**
 * Flatten structural changes in the same DFS order as CollectionTree
 * (current children, then removed ghosts under that parent).
 */
export function flattenStructuralChanges(
  collection: PostmanCollection,
  diff: StructuralDiff
): ChangeListEntry[] {
  const entries: ChangeListEntry[] = [];

  const walk = (items: PostmanItem[] | undefined, parentPath: ItemPath | null) => {
    (items ?? []).forEach((item, index) => {
      const path = childPath(parentPath, index);
      const status = diff.statusByPath.get(path);
      if (status && status !== 'unchanged') {
        const described = describeItem(item);
        entries.push({
          type: 'current',
          key: `current:${path}`,
          path,
          changeKind: status,
          name: described.name,
          nodeKind: described.nodeKind,
          method: described.method,
          parentPath
        });
      }
      if (isFolder(item)) {
        walk(item.item, path);
        for (const ghost of removedUnderParent(diff.removed, path)) {
          entries.push({
            type: 'removed',
            key: ghost.key,
            changeKind: 'removed',
            ghost,
            parentPath: path,
            name: ghost.name,
            nodeKind: ghost.kind,
            method: ghost.method
          });
        }
      }
    });

    for (const ghost of removedUnderParent(diff.removed, parentPath)) {
      // Root-level removals only when parentPath is null (folder walk already
      // emitted ghosts under each folder).
      if (parentPath !== null) {
        continue;
      }
      entries.push({
        type: 'removed',
        key: ghost.key,
        changeKind: 'removed',
        ghost,
        parentPath: null,
        name: ghost.name,
        nodeKind: ghost.kind,
        method: ghost.method
      });
    }
  };

  walk(collection.item, null);
  return entries;
}

export function changeListCounts(entries: ChangeListEntry[]): {
  added: number;
  modified: number;
  removed: number;
} {
  let added = 0;
  let modified = 0;
  let removed = 0;
  for (const entry of entries) {
    if (entry.changeKind === 'added') {
      added += 1;
    } else if (entry.changeKind === 'modified') {
      modified += 1;
    } else {
      removed += 1;
    }
  }
  return { added, modified, removed };
}

export function folderLabelForEntry(
  entry: ChangeListEntry,
  collection: PostmanCollection
): string | null {
  const parentPath = entry.parentPath;
  if (!parentPath) {
    // Root-level changes sit at the top of the list without a group header.
    return null;
  }
  // Resolve folder names along the path for a breadcrumb-ish label.
  const parts = parentPath.split('.');
  const names: string[] = [];
  let items = collection.item ?? [];
  for (const part of parts) {
    const index = Number(part);
    const node = items[index];
    if (!node) {
      break;
    }
    names.push(node.name?.trim() || '(folder)');
    items = Array.isArray(node.item) ? node.item : [];
  }
  return names.length > 0 ? names.join(' / ') : parentPath;
}

export { parentOf };
