import type { ItemPath } from '../postman/tree.ts';

export type CollectionDirtyState = {
  dirtyPaths: Set<ItemPath>;
  dirtyFolderPaths: Set<ItemPath>;
  collectionDirty: boolean;
  structureDirty: boolean;
};

export type CollectionUiState = CollectionDirtyState & {
  expanded: Set<ItemPath>;
  collectionExpanded: boolean;
};

export function createCollectionUiState(
  expanded: Iterable<ItemPath> = [],
  collectionExpanded = true
): CollectionUiState {
  return {
    expanded: new Set(expanded),
    collectionExpanded,
    dirtyPaths: new Set(),
    dirtyFolderPaths: new Set(),
    collectionDirty: false,
    structureDirty: false
  };
}

export function isCollectionDirty(ui: CollectionDirtyState): boolean {
  return (
    ui.dirtyPaths.size > 0 ||
    ui.dirtyFolderPaths.size > 0 ||
    ui.collectionDirty ||
    ui.structureDirty
  );
}

export function clearCollectionDirty(ui: CollectionUiState): CollectionUiState {
  return {
    ...ui,
    dirtyPaths: new Set(),
    dirtyFolderPaths: new Set(),
    collectionDirty: false,
    structureDirty: false
  };
}
