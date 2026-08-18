import { pairChildren } from '../git/structuralDiff.ts';
import { insertItem, deleteItem, parentPathOf } from '../postman/structure.ts';
import { childPath, getItemByPath, isFolder, parseItemPath, type ItemPath } from '../postman/tree.ts';
import type { PostmanCollection, PostmanItem } from '../postman/types.ts';

function cloneItem<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Map a working-tree path onto the same item in the last-saved tree, pairing
 * siblings by kind+name so pending inserts/moves do not shift the match.
 * Returns null when the item is not in the saved file (added or renamed since).
 */
export function resolveSavedPath(
  current: PostmanItem[] | undefined,
  saved: PostmanItem[] | undefined,
  path: ItemPath
): ItemPath | null {
  const indexes = parseItemPath(path);
  if (indexes.length === 0) {
    return null;
  }

  let currentLevel = current ?? [];
  let savedLevel = saved ?? [];
  let resolved: ItemPath | null = null;

  for (const index of indexes) {
    const node = currentLevel[index];
    if (!node) {
      return null;
    }
    const pair = pairChildren(currentLevel, savedLevel).find(
      (candidate) => candidate.currentIndex === index
    );
    if (!pair?.base || pair.baseIndex == null) {
      return null;
    }
    resolved = childPath(resolved, pair.baseIndex);
    currentLevel = node.item ?? [];
    savedLevel = pair.base.item ?? [];
  }

  return resolved;
}

/**
 * The last-saved collection with the item at `path` (a working-tree path)
 * removed, so a delete can reach the file without flushing unrelated edits.
 * Returns null when the item is not in the saved file — nothing to write.
 */
export function deleteFromSavedCollection(
  current: PostmanCollection,
  saved: PostmanCollection,
  path: ItemPath
): PostmanCollection | null {
  const savedPath = resolveSavedPath(current.item, saved.item, path);
  if (savedPath == null) {
    return null;
  }
  return deleteItem(saved, savedPath);
}

/**
 * Write only the working item at `path` into the last-saved tree so ⌘S can
 * flush one tab without saving sibling edits.
 *
 * - Existing request → replace the paired saved request.
 * - Existing folder → replace folder meta/vars; keep saved children (so nested
 *   unsaved request edits stay pending).
 * - New item → insert under the paired saved parent (or collection root).
 *
 * Returns null when the item (or its parent, for inserts) cannot be placed.
 */
export function writeItemToSavedCollection(
  current: PostmanCollection,
  saved: PostmanCollection,
  path: ItemPath
): PostmanCollection | null {
  const working = getItemByPath(current.item, path);
  if (!working) {
    return null;
  }

  const savedPath = resolveSavedPath(current.item, saved.item, path);
  if (savedPath != null) {
    return {
      ...saved,
      item: updateSavedItem(saved.item, savedPath, (previous) => {
        if (isFolder(working) && isFolder(previous)) {
          const next = cloneItem(working);
          next.item = previous.item;
          return next;
        }
        return cloneItem(working);
      })
    };
  }

  const parent = parentPathOf(path);
  const toInsert = cloneItem(working);
  if (parent == null) {
    return insertItem(saved, null, toInsert).collection;
  }

  const savedParent = resolveSavedPath(current.item, saved.item, parent);
  if (savedParent == null) {
    return null;
  }
  return insertItem(saved, savedParent, toInsert).collection;
}

/** Copy collection-level fields from working into saved; leave `item[]` alone. */
export function writeCollectionMetaToSaved(
  current: PostmanCollection,
  saved: PostmanCollection
): PostmanCollection {
  return {
    ...cloneItem(current),
    item: saved.item
  };
}

function updateSavedItem(
  items: PostmanItem[] | undefined,
  path: ItemPath,
  updater: (item: PostmanItem) => PostmanItem
): PostmanItem[] {
  const indexes = parseItemPath(path);
  if (indexes.length === 0) {
    throw new Error('Cannot update the collection root as an item');
  }

  const walk = (nodes: PostmanItem[], depth: number): PostmanItem[] => {
    const index = indexes[depth];
    if (index == null || index >= nodes.length) {
      throw new Error(`Item path out of range: ${path}`);
    }
    const next = nodes.slice();
    const node = nodes[index];
    if (depth === indexes.length - 1) {
      next[index] = updater(node);
      return next;
    }
    if (!Array.isArray(node.item)) {
      throw new Error(`Item path traverses a request: ${path}`);
    }
    next[index] = { ...node, item: walk(node.item, depth + 1) };
    return next;
  };

  return walk(items ?? [], 0);
}
