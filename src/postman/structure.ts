import type { PostmanCollection, PostmanItem } from './types.ts';
import {
  childPath,
  getItemByPath,
  parseItemPath,
  updateItemByPath,
  type ItemPath
} from './tree.ts';

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function copyName(name: string | undefined, fallback: string): string {
  const base = name?.trim() || fallback;
  return `${base} Copy`;
}

export function renameCollection(
  collection: PostmanCollection,
  name: string
): PostmanCollection {
  return {
    ...collection,
    info: { ...(collection.info ?? {}), name }
  };
}

export function renameItem(
  collection: PostmanCollection,
  path: ItemPath,
  name: string
): PostmanCollection {
  return {
    ...collection,
    item: updateItemByPath(collection.item, path, (item) => ({ ...item, name }))
  };
}

export function deleteItem(
  collection: PostmanCollection,
  path: ItemPath
): PostmanCollection {
  const indexes = parseItemPath(path);
  if (indexes.length === 0) {
    throw new Error('Cannot delete the collection root');
  }

  const remove = (nodes: PostmanItem[], depth: number): PostmanItem[] => {
    const index = indexes[depth]!;
    if (index >= nodes.length) {
      throw new Error(`Item path out of range: ${path}`);
    }
    if (depth === indexes.length - 1) {
      const next = nodes.slice();
      next.splice(index, 1);
      return next;
    }
    const node = nodes[index]!;
    if (!Array.isArray(node.item)) {
      throw new Error(`Item path traverses a request: ${path}`);
    }
    const next = nodes.slice();
    next[index] = { ...node, item: remove(node.item, depth + 1) };
    return next;
  };

  return { ...collection, item: remove(collection.item ?? [], 0) };
}

export function duplicateItem(
  collection: PostmanCollection,
  path: ItemPath
): { collection: PostmanCollection; newPath: ItemPath } {
  const indexes = parseItemPath(path);
  if (indexes.length === 0) {
    throw new Error('Cannot duplicate the collection root');
  }

  let newPath: ItemPath = path;

  const duplicate = (nodes: PostmanItem[], depth: number, parent: ItemPath | null): PostmanItem[] => {
    const index = indexes[depth]!;
    if (index >= nodes.length) {
      throw new Error(`Item path out of range: ${path}`);
    }
    if (depth === indexes.length - 1) {
      const original = nodes[index]!;
      const copy: PostmanItem = {
        ...cloneJson(original),
        name: copyName(original.name, 'Item')
      };
      const next = nodes.slice();
      next.splice(index + 1, 0, copy);
      newPath = childPath(parent, index + 1);
      return next;
    }
    const node = nodes[index]!;
    if (!Array.isArray(node.item)) {
      throw new Error(`Item path traverses a request: ${path}`);
    }
    const next = nodes.slice();
    const currentPath = childPath(parent, index);
    next[index] = { ...node, item: duplicate(node.item, depth + 1, currentPath) };
    return next;
  };

  return {
    collection: { ...collection, item: duplicate(collection.item ?? [], 0, null) },
    newPath
  };
}

/**
 * After deleting `deleted`, map an open tab path:
 * - removed if it was the deleted node or a descendant
 * - shifted if a sibling index after the deleted one needs decrementing
 */
export function remapPathAfterDelete(
  path: ItemPath,
  deleted: ItemPath
): ItemPath | null {
  if (path === deleted || path.startsWith(`${deleted}.`)) {
    return null;
  }

  const pathParts = parseItemPath(path);
  const deletedParts = parseItemPath(deleted);
  if (pathParts.length < deletedParts.length) {
    return path;
  }

  const parentLen = deletedParts.length - 1;
  for (let i = 0; i < parentLen; i += 1) {
    if (pathParts[i] !== deletedParts[i]) {
      return path;
    }
  }

  const deletedIndex = deletedParts[parentLen]!;
  const pathIndex = pathParts[parentLen]!;
  if (pathIndex <= deletedIndex) {
    return path;
  }

  const next = pathParts.slice();
  next[parentLen] = pathIndex - 1;
  return next.join('.');
}

/** After duplicating at `original` → `created`, shift later sibling tab paths up by one. */
export function remapPathAfterDuplicate(
  path: ItemPath,
  original: ItemPath,
  created: ItemPath
): ItemPath {
  if (path === original || path.startsWith(`${original}.`)) {
    return path;
  }

  const pathParts = parseItemPath(path);
  const createdParts = parseItemPath(created);
  if (pathParts.length < createdParts.length) {
    return path;
  }

  const parentLen = createdParts.length - 1;
  for (let i = 0; i < parentLen; i += 1) {
    if (pathParts[i] !== createdParts[i]) {
      return path;
    }
  }

  const createdIndex = createdParts[parentLen]!;
  const pathIndex = pathParts[parentLen]!;
  // Paths that were at createdIndex or after (before insert) are now +1, except the
  // original which stayed put. createdIndex is originalIndex+1.
  if (pathIndex >= createdIndex) {
    const next = pathParts.slice();
    next[parentLen] = pathIndex + 1;
    return next.join('.');
  }
  return path;
}

export function itemExists(
  collection: PostmanCollection,
  path: ItemPath
): boolean {
  return Boolean(getItemByPath(collection.item, path));
}

export function createRequestItem(name = 'New Request'): PostmanItem {
  return {
    name,
    request: {
      method: 'GET',
      header: [],
      url: ''
    }
  };
}

/**
 * Insert an item under `parentPath` (null = collection root).
 * When `afterPath` is set (must be a direct child of the parent), inserts after it.
 * When `index` is set, inserts at that 0-based position (clamped).
 */
export function insertItem(
  collection: PostmanCollection,
  parentPath: ItemPath | null,
  item: PostmanItem,
  afterPath?: ItemPath | null,
  index?: number
): { collection: PostmanCollection; newPath: ItemPath } {
  const insertInto = (nodes: PostmanItem[]): { nodes: PostmanItem[]; newPath: ItemPath } => {
    const next = nodes.slice();
    let at = next.length;
    if (typeof index === 'number' && Number.isFinite(index)) {
      at = Math.max(0, Math.min(Math.floor(index), next.length));
    } else if (afterPath) {
      const afterIndexes = parseItemPath(afterPath);
      const afterIndex = afterIndexes[afterIndexes.length - 1];
      if (afterIndex != null && afterIndex >= 0 && afterIndex < next.length) {
        at = afterIndex + 1;
      }
    }
    next.splice(at, 0, item);
    return { nodes: next, newPath: childPath(parentPath, at) };
  };

  if (parentPath == null) {
    const result = insertInto(collection.item ?? []);
    return {
      collection: { ...collection, item: result.nodes },
      newPath: result.newPath
    };
  }

  let newPath: ItemPath = parentPath;
  const itemTree = updateItemByPath(collection.item, parentPath, (folder) => {
    if (!Array.isArray(folder.item) && folder.request !== undefined) {
      throw new Error(`Cannot insert under a request: ${parentPath}`);
    }
    const result = insertInto(folder.item ?? []);
    newPath = result.newPath;
    return { ...folder, item: result.nodes };
  });

  return { collection: { ...collection, item: itemTree }, newPath };
}

export type MoveTarget =
  | { relation: 'before'; path: ItemPath }
  | { relation: 'after'; path: ItemPath }
  /** `path: null` = collection root; otherwise a folder path. */
  | { relation: 'into'; path: ItemPath | null };

function isSelfOrDescendant(path: ItemPath, ancestor: ItemPath): boolean {
  return path === ancestor || path.startsWith(`${ancestor}.`);
}

/**
 * Move an item within a collection. Returns the new path of the moved node.
 * No-op (same collection + path) when the drop would not change position.
 */
export function moveItem(
  collection: PostmanCollection,
  fromPath: ItemPath,
  target: MoveTarget
): { collection: PostmanCollection; newPath: ItemPath } {
  const source = getItemByPath(collection.item, fromPath);
  if (!source) {
    throw new Error(`Item path out of range: ${fromPath}`);
  }

  if (target.relation === 'into') {
    if (target.path != null && isSelfOrDescendant(target.path, fromPath)) {
      throw new Error('Cannot move an item into itself or a descendant');
    }
  } else if (isSelfOrDescendant(target.path, fromPath)) {
    // Dropping before/after self is a no-op; before/after a descendant is invalid.
    if (target.path === fromPath) {
      return { collection, newPath: fromPath };
    }
    throw new Error('Cannot move an item relative to its own descendant');
  }

  // Same-parent no-ops: before next sibling / after previous sibling.
  if (target.relation === 'before' || target.relation === 'after') {
    const fromParent = parentPathOf(fromPath);
    const targetParent = parentPathOf(target.path);
    if (fromParent === targetParent) {
      const fromIndex = parseItemPath(fromPath).at(-1)!;
      const targetIndex = parseItemPath(target.path).at(-1)!;
      if (target.relation === 'before' && targetIndex === fromIndex + 1) {
        return { collection, newPath: fromPath };
      }
      if (target.relation === 'after' && targetIndex === fromIndex - 1) {
        return { collection, newPath: fromPath };
      }
    }
  }

  if (target.relation === 'into') {
    const fromParent = parentPathOf(fromPath);
    if (fromParent === target.path) {
      const siblings =
        target.path == null
          ? (collection.item ?? [])
          : (getItemByPath(collection.item, target.path)?.item ?? []);
      const fromIndex = parseItemPath(fromPath).at(-1)!;
      if (fromIndex === siblings.length - 1) {
        return { collection, newPath: fromPath };
      }
    }
  }

  const moved = cloneJson(source);
  const without = deleteItem(collection, fromPath);

  if (target.relation === 'into') {
    const parent =
      target.path == null ? null : remapPathAfterDelete(target.path, fromPath);
    if (target.path != null && parent == null) {
      throw new Error('Invalid move target');
    }
    return insertItem(without, parent, moved);
  }

  const remappedAnchor = remapPathAfterDelete(target.path, fromPath);
  if (remappedAnchor == null) {
    throw new Error('Invalid move target');
  }
  const parent = parentPathOf(remappedAnchor);
  if (target.relation === 'after') {
    return insertItem(without, parent, moved, remappedAnchor);
  }
  const index = parseItemPath(remappedAnchor).at(-1)!;
  return insertItem(without, parent, moved, undefined, index);
}

/**
 * After inserting at `inserted` under the same parent, shift later sibling tab paths.
 */
export function remapPathAfterInsert(path: ItemPath, inserted: ItemPath): ItemPath {
  const pathParts = parseItemPath(path);
  const insertedParts = parseItemPath(inserted);
  if (pathParts.length < insertedParts.length) {
    return path;
  }

  const parentLen = insertedParts.length - 1;
  for (let i = 0; i < parentLen; i += 1) {
    if (pathParts[i] !== insertedParts[i]) {
      return path;
    }
  }

  const insertedIndex = insertedParts[parentLen]!;
  const pathIndex = pathParts[parentLen]!;
  if (pathIndex >= insertedIndex) {
    const next = pathParts.slice();
    next[parentLen] = pathIndex + 1;
    return next.join('.');
  }
  return path;
}

/** Parent folder path for an item path, or null at collection root. */
export function parentPathOf(path: ItemPath): ItemPath | null {
  const indexes = parseItemPath(path);
  if (indexes.length <= 1) {
    return null;
  }
  return indexes.slice(0, -1).join('.');
}
