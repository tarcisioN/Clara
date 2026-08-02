import { pairChildren } from '../git/structuralDiff.ts';
import { deleteItem } from '../postman/structure.ts';
import { childPath, parseItemPath, type ItemPath } from '../postman/tree.ts';
import type { PostmanCollection, PostmanItem } from '../postman/types.ts';

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
