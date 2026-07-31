import {
  serializeCollection,
  type PostmanCollection,
  type PostmanItem
} from '../postman/types.ts';
import {
  childPath,
  isFolder,
  isRequest,
  type ItemPath
} from '../postman/tree.ts';

export type DirtySnapshot = {
  dirtyPaths: Set<ItemPath>;
  dirtyFolderPaths: Set<ItemPath>;
  collectionDirty: boolean;
  structureDirty: boolean;
};

function stable(value: unknown): string {
  return JSON.stringify(value);
}

function folderMeta(item: PostmanItem): unknown {
  return {
    name: item.name,
    variable: item.variable,
    auth: item.auth,
    event: item.event
  };
}

function collectionMeta(collection: PostmanCollection): unknown {
  return {
    info: collection.info,
    variable: collection.variable,
    auth: collection.auth
  };
}

function markNewSubtree(
  item: PostmanItem,
  path: ItemPath,
  dirtyPaths: Set<ItemPath>,
  dirtyFolderPaths: Set<ItemPath>
) {
  if (isFolder(item)) {
    dirtyFolderPaths.add(path);
    (item.item ?? []).forEach((child, index) => {
      markNewSubtree(child, childPath(path, index), dirtyPaths, dirtyFolderPaths);
    });
    return;
  }
  if (isRequest(item)) {
    dirtyPaths.add(path);
  }
}

/**
 * Diff `current` against the last-saved `baseline`. Reverting edits so the
 * collection matches the baseline clears every dirty flag.
 */
export function computeDirtyState(
  current: PostmanCollection,
  baseline: PostmanCollection
): DirtySnapshot {
  if (serializeCollection(current) === serializeCollection(baseline)) {
    return {
      dirtyPaths: new Set(),
      dirtyFolderPaths: new Set(),
      collectionDirty: false,
      structureDirty: false
    };
  }

  const dirtyPaths = new Set<ItemPath>();
  const dirtyFolderPaths = new Set<ItemPath>();
  let shapeChanged = false;

  const walk = (
    currentItems: PostmanItem[] | undefined,
    baselineItems: PostmanItem[] | undefined,
    parent: ItemPath | null
  ) => {
    const cur = currentItems ?? [];
    const base = baselineItems ?? [];
    if (cur.length !== base.length) {
      shapeChanged = true;
    }

    const max = Math.max(cur.length, base.length);
    for (let index = 0; index < max; index += 1) {
      const path = childPath(parent, index);
      const node = cur[index];
      const original = base[index];

      if (!node || !original) {
        shapeChanged = true;
        if (node) {
          markNewSubtree(node, path, dirtyPaths, dirtyFolderPaths);
        }
        continue;
      }

      if (isFolder(node) && isFolder(original)) {
        if (stable(folderMeta(node)) !== stable(folderMeta(original))) {
          dirtyFolderPaths.add(path);
        }
        walk(node.item, original.item, path);
        continue;
      }

      if (isRequest(node) && isRequest(original)) {
        if (stable(node) !== stable(original)) {
          dirtyPaths.add(path);
        }
        continue;
      }

      shapeChanged = true;
      markNewSubtree(node, path, dirtyPaths, dirtyFolderPaths);
    }
  };

  walk(current.item, baseline.item, null);

  const metaChanged = stable(collectionMeta(current)) !== stable(collectionMeta(baseline));
  const collectionDirty = metaChanged || shapeChanged;
  const structureDirty =
    metaChanged || shapeChanged || dirtyFolderPaths.size > 0;

  return {
    dirtyPaths,
    dirtyFolderPaths,
    collectionDirty,
    structureDirty
  };
}
