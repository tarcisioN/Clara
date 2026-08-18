import type { PostmanItem } from '../postman/types.ts';
import { getItemByPath, isFolder, type ItemPath } from '../postman/tree.ts';
import { matchKey } from '../git/structuralDiff.ts';
import { tabKey, type WorkspaceTab } from './tabs.ts';

export type PinnedRequest = {
  /** Stable id for the pin (survives path remaps). */
  id: string;
  collectionPath: string;
  /** Path when pinned / last known path. May be missing after reload. */
  linkedPath: ItemPath;
  /** Live editable snapshot. */
  item: PostmanItem;
  /**
   * Set when a reload left `linkedPath` pointing at something else, so the
   * snapshot is not written back over an unrelated request.
   */
  detached?: boolean;
  /**
   * Unsaved copy (Duplicate Tab / tab-bar "+"). It has no item of its own in the
   * tree, so it never links to one — only Save As turns it into a request.
   */
  draft?: boolean;
};

export type SaveAsLocation = {
  /** `null` = collection root. */
  parentPath: ItemPath | null;
  label: string;
};

function cloneItem<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createPinnedRequest(
  collectionPath: string,
  linkedPath: ItemPath,
  item: PostmanItem
): PinnedRequest {
  return {
    id: crypto.randomUUID(),
    collectionPath,
    linkedPath,
    item: cloneItem(item)
  };
}

export function isRequestTabPinned(
  tab: WorkspaceTab,
  pins: Record<string, PinnedRequest>
): boolean {
  return tab.kind === 'request' && Boolean(pins[tabKey(tab)]);
}

export function isPinnedDetached(
  pin: PinnedRequest,
  items: PostmanItem[] | undefined
): boolean {
  return (
    pin.draft === true ||
    pin.detached === true ||
    getItemByPath(items, pin.linkedPath) == null
  );
}

/**
 * Re-check pins of `collectionPath` after the file changed underneath us: a
 * linked pin whose path is gone — or now holds a different request — detaches,
 * and one whose request came back links again.
 */
export function markDetachedPins(
  pins: Record<string, PinnedRequest>,
  collectionPath: string,
  items: PostmanItem[] | undefined
): Record<string, PinnedRequest> {
  let changed = false;
  const next: Record<string, PinnedRequest> = {};

  for (const [key, pin] of Object.entries(pins)) {
    if (pin.collectionPath !== collectionPath || pin.draft) {
      next[key] = pin;
      continue;
    }
    const linked = getItemByPath(items, pin.linkedPath);
    const detached = !linked || matchKey(linked) !== matchKey(pin.item);
    if (detached === (pin.detached === true)) {
      next[key] = pin;
      continue;
    }
    next[key] = { ...pin, detached };
    changed = true;
  }

  return changed ? next : pins;
}

/** Keep pinned request tabs even when their path vanished from the tree. */
export function shouldKeepTabAfterReload(
  tab: WorkspaceTab,
  collectionPath: string,
  validKeys: Set<string>,
  pins: Record<string, PinnedRequest>
): boolean {
  if (tab.kind === 'environment' || tab.collectionPath !== collectionPath) {
    return true;
  }
  const key = tabKey(tab);
  return validKeys.has(key) || Boolean(pins[key]);
}

export function updatePinnedItem(
  pins: Record<string, PinnedRequest>,
  key: string,
  updater: (item: PostmanItem) => PostmanItem
): Record<string, PinnedRequest> {
  const pin = pins[key];
  if (!pin) {
    return pins;
  }
  return {
    ...pins,
    [key]: { ...pin, item: updater(pin.item) }
  };
}

/** Remap pin keys when a request tab's path changes. */
export function remapPinnedTabKey(
  pins: Record<string, PinnedRequest>,
  from: WorkspaceTab,
  to: WorkspaceTab
): Record<string, PinnedRequest> {
  if (from.kind !== 'request' || to.kind !== 'request') {
    return pins;
  }
  const fromKey = tabKey(from);
  const toKey = tabKey(to);
  if (fromKey === toKey || !pins[fromKey]) {
    return pins;
  }
  const { [fromKey]: pin, ...rest } = pins;
  return {
    ...rest,
    [toKey]: { ...pin, linkedPath: to.path, collectionPath: to.collectionPath }
  };
}

export function listSaveAsLocations(
  items: PostmanItem[] | undefined,
  collectionName: string
): SaveAsLocation[] {
  const locations: SaveAsLocation[] = [
    { parentPath: null, label: collectionName || 'Collection root' }
  ];

  const walk = (nodes: PostmanItem[] | undefined, parent: ItemPath | null, trail: string[]) => {
    if (!nodes) {
      return;
    }
    nodes.forEach((node, index) => {
      if (!isFolder(node)) {
        return;
      }
      const path = parent == null ? String(index) : `${parent}.${index}`;
      const name = node.name?.trim() || 'Folder';
      const nextTrail = [...trail, name];
      locations.push({ parentPath: path, label: nextTrail.join(' / ') });
      walk(node.item, path, nextTrail);
    });
  };

  walk(items, null, []);
  return locations;
}
