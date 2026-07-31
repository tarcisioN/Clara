import type { PostmanCollection, PostmanItem } from '../postman/types.ts';
import { isRequest, parseItemPath, type ItemPath } from '../postman/tree.ts';
import { pairChildren, type ChangeKind, type StructuralDiff } from './structuralDiff.ts';

export type BaseItemResolution =
  | { kind: 'none' }
  | { kind: 'added' }
  | { kind: 'paired'; item: PostmanItem }
  | { kind: 'missing' };

/**
 * Walk the current path and resolve the paired base item using the same
 * kind+name sibling matching as the structural tree diff.
 */
export function findPairedBaseItem(
  currentRoot: PostmanItem[] | undefined,
  baseRoot: PostmanItem[] | undefined,
  path: ItemPath
): PostmanItem | undefined {
  const indexes = parseItemPath(path);
  let currentLevel = currentRoot ?? [];
  let baseLevel = baseRoot ?? [];
  let matched: PostmanItem | undefined;

  for (const index of indexes) {
    if (index >= currentLevel.length) {
      return undefined;
    }
    const pairs = pairChildren(currentLevel, baseLevel);
    const pair = pairs.find((candidate) => candidate.currentIndex === index);
    if (!pair?.current) {
      return undefined;
    }
    if (!pair.base) {
      return undefined;
    }
    matched = pair.base;
    currentLevel = Array.isArray(pair.current.item) ? pair.current.item : [];
    baseLevel = Array.isArray(pair.base.item) ? pair.base.item : [];
  }

  return matched;
}

export function resolveBaseRequestItem(
  structuralDiff: StructuralDiff | null | undefined,
  currentCollection: PostmanCollection,
  baseCollection: PostmanCollection | null | undefined,
  path: ItemPath
): BaseItemResolution {
  if (!structuralDiff || !baseCollection) {
    return { kind: 'none' };
  }

  const status = structuralDiff.statusByPath.get(path);
  if (status === 'added') {
    return { kind: 'added' };
  }

  const paired = findPairedBaseItem(
    currentCollection.item,
    baseCollection.item,
    path
  );
  if (!paired) {
    return status === 'modified' || status === 'unchanged'
      ? { kind: 'missing' }
      : { kind: 'added' };
  }
  if (!isRequest(paired)) {
    return { kind: 'missing' };
  }
  return { kind: 'paired', item: paired };
}

export function structuralStatusAt(
  structuralDiff: StructuralDiff | null | undefined,
  path: ItemPath
): ChangeKind | undefined {
  return structuralDiff?.statusByPath.get(path);
}
