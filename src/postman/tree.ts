import type { PostmanItem, PostmanRequest } from './types.ts';

/** Dot-separated indexes into nested `item[]`, e.g. `"0.1.2"`. */
export type ItemPath = string;

export function isFolder(item: PostmanItem): boolean {
  return Array.isArray(item.item);
}

export function isRequest(item: PostmanItem): boolean {
  return item.request !== undefined && !isFolder(item);
}

export function parseItemPath(path: ItemPath): number[] {
  if (!path) {
    return [];
  }
  return path.split('.').map((part) => {
    const index = Number(part);
    if (!Number.isInteger(index) || index < 0) {
      throw new Error(`Invalid item path: ${path}`);
    }
    return index;
  });
}

export function getItemByPath(
  items: PostmanItem[] | undefined,
  path: ItemPath
): PostmanItem | undefined {
  const indexes = parseItemPath(path);
  let current: PostmanItem[] | undefined = items;
  let node: PostmanItem | undefined;

  for (const index of indexes) {
    if (!current || index >= current.length) {
      return undefined;
    }
    node = current[index];
    current = Array.isArray(node.item) ? node.item : undefined;
  }

  return node;
}

export function getRequestByPath(
  items: PostmanItem[] | undefined,
  path: ItemPath
): PostmanRequest | undefined {
  const item = getItemByPath(items, path);
  if (!item || !isRequest(item)) {
    return undefined;
  }
  if (typeof item.request === 'string') {
    return { method: 'GET', url: item.request };
  }
  return item.request;
}

/** Returns a new `item[]` with the node at `path` replaced; untouched branches are shared. */
export function updateItemByPath(
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
    if (index >= nodes.length) {
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

export function childPath(parent: ItemPath | null, index: number): ItemPath {
  return parent === null || parent === '' ? String(index) : `${parent}.${index}`;
}

/** Expand every folder path so a fresh tree opens fully expanded. */
export function collectFolderPaths(items: PostmanItem[] | undefined): Set<ItemPath> {
  const paths = new Set<ItemPath>();

  const walk = (nodes: PostmanItem[] | undefined, parent: ItemPath | null) => {
    if (!nodes) {
      return;
    }
    nodes.forEach((node, index) => {
      const path = childPath(parent, index);
      if (isFolder(node)) {
        paths.add(path);
        walk(node.item, path);
      }
    });
  };

  walk(items, null);
  return paths;
}

/** Count request items under a folder (or 1 if the node itself is a request). */
export function countRequestsUnder(item: PostmanItem): number {
  if (isRequest(item)) {
    return 1;
  }
  if (!isFolder(item)) {
    return 0;
  }
  return (item.item ?? []).reduce((sum, child) => sum + countRequestsUnder(child), 0);
}
