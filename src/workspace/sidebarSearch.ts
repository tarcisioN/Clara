import type { PostmanItem } from '../postman/types.ts';
import { childPath, isFolder, type ItemPath } from '../postman/tree.ts';

export function normalizeSidebarQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function textMatchesQuery(text: string | undefined, query: string): boolean {
  if (!query) {
    return true;
  }
  return (text ?? '').toLowerCase().includes(query);
}

/** True when this item or any nested descendant matches the query. */
export function itemMatchesQuery(item: PostmanItem, query: string): boolean {
  if (!query) {
    return true;
  }
  if (textMatchesQuery(item.name, query)) {
    return true;
  }
  if (!isFolder(item)) {
    return false;
  }
  return (item.item ?? []).some((child) => itemMatchesQuery(child, query));
}

/**
 * Folder paths that should open so search matches become visible.
 * Includes every ancestor folder of a matching descendant.
 */
export function collectMatchingFolderPaths(
  items: PostmanItem[] | undefined,
  query: string
): Set<ItemPath> {
  const paths = new Set<ItemPath>();
  if (!query || !items) {
    return paths;
  }

  const walk = (nodes: PostmanItem[], parent: ItemPath | null): boolean => {
    let anyMatch = false;
    nodes.forEach((node, index) => {
      const path = childPath(parent, index);
      const selfMatch = textMatchesQuery(node.name, query);
      if (isFolder(node)) {
        const childMatch = walk(node.item ?? [], path);
        if (selfMatch || childMatch) {
          paths.add(path);
          anyMatch = true;
        }
      } else if (selfMatch) {
        anyMatch = true;
      }
    });
    return anyMatch;
  };

  walk(items, null);
  return paths;
}
