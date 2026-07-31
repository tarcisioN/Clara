import type { PostmanCollection, PostmanItem } from '../postman/types.ts';
import {
  childPath,
  isFolder,
  isRequest,
  type ItemPath
} from '../postman/tree.ts';

export type ChangeKind = 'added' | 'removed' | 'modified' | 'unchanged';

export type RemovedGhost = {
  /** Synthetic key for React lists; not a real ItemPath in the current tree. */
  key: string;
  parentPath: ItemPath | null;
  name: string;
  kind: 'folder' | 'request';
  method?: string;
};

export type StructuralDiff = {
  /** Status for nodes that exist in the current tree (by ItemPath). */
  statusByPath: Map<ItemPath, ChangeKind>;
  /** Folders/requests present in base but missing in current (ghost rows). */
  removed: RemovedGhost[];
  /** Changed descendants under each current folder path (excludes self-only meta). */
  descendantChangeCount: Map<ItemPath, number>;
  added: number;
  removedCount: number;
  modified: number;
  /** added + removed + modified (leaf + folder meta). */
  changedCount: number;
};

function stable(value: unknown): string {
  return JSON.stringify(value);
}

function itemKind(item: PostmanItem): 'folder' | 'request' | 'unknown' {
  if (isFolder(item)) {
    return 'folder';
  }
  if (isRequest(item)) {
    return 'request';
  }
  return 'unknown';
}

function matchKey(item: PostmanItem): string {
  const name = item.name?.trim() || '';
  return `${itemKind(item)}:${name}`;
}

function folderMeta(item: PostmanItem): unknown {
  return {
    name: item.name,
    variable: item.variable,
    auth: item.auth,
    event: item.event
  };
}

function requestEqual(a: PostmanItem, b: PostmanItem): boolean {
  return stable(a) === stable(b);
}

/**
 * Pair children by kind+name within a parent. Duplicate names match in order.
 * Index alignment alone is too brittle for typical PR reorders.
 */
function pairChildren(
  current: PostmanItem[],
  base: PostmanItem[]
): Array<{
  current?: PostmanItem;
  base?: PostmanItem;
  currentIndex?: number;
}> {
  const baseUsed = new Set<number>();
  const pairs: Array<{
    current?: PostmanItem;
    base?: PostmanItem;
    currentIndex?: number;
  }> = [];

  current.forEach((node, currentIndex) => {
    const key = matchKey(node);
    let matched = -1;
    for (let i = 0; i < base.length; i += 1) {
      if (baseUsed.has(i)) {
        continue;
      }
      if (matchKey(base[i]) === key) {
        matched = i;
        break;
      }
    }
    if (matched >= 0) {
      baseUsed.add(matched);
      pairs.push({ current: node, base: base[matched], currentIndex });
    } else {
      pairs.push({ current: node, currentIndex });
    }
  });

  base.forEach((node, index) => {
    if (!baseUsed.has(index)) {
      pairs.push({ base: node });
    }
  });

  return pairs;
}

function removedGhost(
  parentPath: ItemPath | null,
  item: PostmanItem,
  sequence: number
): RemovedGhost {
  const kind = isFolder(item) ? 'folder' : 'request';
  const name = item.name?.trim() || (kind === 'folder' ? '(folder)' : '(request)');
  const method =
    kind === 'request'
      ? typeof item.request === 'string'
        ? 'GET'
        : (item.request?.method ?? 'GET').toUpperCase()
      : undefined;
  const parentKey = parentPath ?? 'root';
  return {
    key: `__removed__:${parentKey}:${sequence}:${name}`,
    parentPath,
    name,
    kind,
    method
  };
}

/**
 * Structural diff of collection `item[]` trees for sidebar markers.
 * Matching is by kind+name within each parent; content compared with stable JSON.
 */
export function computeStructuralDiff(
  current: PostmanCollection,
  base: PostmanCollection
): StructuralDiff {
  const statusByPath = new Map<ItemPath, ChangeKind>();
  const removed: RemovedGhost[] = [];
  const descendantChangeCount = new Map<ItemPath, number>();
  let added = 0;
  let removedCount = 0;
  let modified = 0;
  let removedSeq = 0;

  const parentOf = (path: ItemPath): ItemPath | null => {
    const index = path.lastIndexOf('.');
    return index === -1 ? null : path.slice(0, index);
  };

  /** Increment change badges on the folder that contains `containerPath` and its ancestors. */
  const bumpContainingFolders = (containerPath: ItemPath | null, delta: number) => {
    if (!containerPath || delta <= 0) {
      return;
    }
    let path: string | null = containerPath;
    while (path) {
      descendantChangeCount.set(path, (descendantChangeCount.get(path) ?? 0) + delta);
      path = parentOf(path);
    }
  };

  const markNewSubtree = (item: PostmanItem, path: ItemPath) => {
    if (isFolder(item)) {
      statusByPath.set(path, 'added');
      added += 1;
      bumpContainingFolders(parentOf(path), 1);
      (item.item ?? []).forEach((child, index) => {
        markNewSubtree(child, childPath(path, index));
      });
      return;
    }
    if (isRequest(item)) {
      statusByPath.set(path, 'added');
      added += 1;
      bumpContainingFolders(parentOf(path), 1);
    }
  };

  const countSubtreeNodes = (item: PostmanItem): number => {
    if (isRequest(item)) {
      return 1;
    }
    if (isFolder(item)) {
      return 1 + (item.item ?? []).reduce((sum, child) => sum + countSubtreeNodes(child), 0);
    }
    return 0;
  };

  const markRemovedNode = (item: PostmanItem, parentPath: ItemPath | null) => {
    removed.push(removedGhost(parentPath, item, removedSeq));
    removedSeq += 1;
    const weight = countSubtreeNodes(item);
    removedCount += weight;
    bumpContainingFolders(parentPath, weight);
  };

  const walk = (
    currentItems: PostmanItem[] | undefined,
    baseItems: PostmanItem[] | undefined,
    parentPath: ItemPath | null
  ) => {
    const pairs = pairChildren(currentItems ?? [], baseItems ?? []);

    for (const pair of pairs) {
      if (pair.current && pair.currentIndex !== undefined && !pair.base) {
        markNewSubtree(pair.current, childPath(parentPath, pair.currentIndex));
        continue;
      }

      if (pair.base && !pair.current) {
        markRemovedNode(pair.base, parentPath);
        continue;
      }

      if (!pair.current || pair.currentIndex === undefined || !pair.base) {
        continue;
      }

      const path = childPath(parentPath, pair.currentIndex);
      const node = pair.current;
      const original = pair.base;

      if (isFolder(node) && isFolder(original)) {
        const metaChanged = stable(folderMeta(node)) !== stable(folderMeta(original));
        walk(node.item, original.item, path);
        const nested = descendantChangeCount.get(path) ?? 0;
        if (metaChanged) {
          statusByPath.set(path, 'modified');
          modified += 1;
          bumpContainingFolders(parentOf(path), 1);
        } else if (nested > 0) {
          // Folder shell unchanged, but children changed — still "has changes".
          statusByPath.set(path, 'modified');
        } else {
          statusByPath.set(path, 'unchanged');
        }
        continue;
      }

      if (isRequest(node) && isRequest(original)) {
        if (requestEqual(node, original)) {
          statusByPath.set(path, 'unchanged');
        } else {
          statusByPath.set(path, 'modified');
          modified += 1;
          bumpContainingFolders(parentOf(path), 1);
        }
        continue;
      }

      // Kind mismatch at the matched name — treat as replace (modified current).
      statusByPath.set(path, 'modified');
      modified += 1;
      bumpContainingFolders(parentOf(path), 1);
      if (isFolder(node)) {
        walk(node.item, isFolder(original) ? original.item : [], path);
      }
    }
  };

  walk(current.item, base.item, null);

  return {
    statusByPath,
    removed,
    descendantChangeCount,
    added,
    removedCount,
    modified,
    changedCount: added + removedCount + modified
  };
}

/** True if this node or any descendant should stay visible under Changed only. */
export function pathVisibleWhenChangedOnly(
  path: ItemPath,
  statusByPath: Map<ItemPath, ChangeKind>,
  descendantChangeCount: Map<ItemPath, number>
): boolean {
  const status = statusByPath.get(path);
  if (status && status !== 'unchanged') {
    return true;
  }
  return (descendantChangeCount.get(path) ?? 0) > 0;
}

/** Folder paths that contain at least one change (for auto-expand). */
export function collectChangedFolderPaths(
  items: PostmanItem[] | undefined,
  statusByPath: Map<ItemPath, ChangeKind>,
  descendantChangeCount: Map<ItemPath, number>,
  parent: ItemPath | null = null
): Set<ItemPath> {
  const result = new Set<ItemPath>();
  (items ?? []).forEach((item, index) => {
    const path = childPath(parent, index);
    if (!isFolder(item)) {
      return;
    }
    if (pathVisibleWhenChangedOnly(path, statusByPath, descendantChangeCount)) {
      result.add(path);
      for (const nested of collectChangedFolderPaths(
        item.item,
        statusByPath,
        descendantChangeCount,
        path
      )) {
        result.add(nested);
      }
    }
  });
  return result;
}

export function removedUnderParent(
  removed: RemovedGhost[],
  parentPath: ItemPath | null
): RemovedGhost[] {
  return removed.filter((ghost) => ghost.parentPath === parentPath);
}
