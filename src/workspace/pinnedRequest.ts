import type { PostmanItem } from '../postman/types.ts';
import { getItemByPath, isFolder, type ItemPath } from '../postman/tree.ts';
import { tabKey, type WorkspaceTab } from './tabs.ts';

export type PinnedRequest = {
  /** Stable id for the pin (survives path remaps). */
  id: string;
  collectionPath: string;
  /** Path when pinned / last known path. May be missing after reload. */
  linkedPath: ItemPath;
  /** Live editable snapshot. */
  item: PostmanItem;
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
  return getItemByPath(items, pin.linkedPath) == null;
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
