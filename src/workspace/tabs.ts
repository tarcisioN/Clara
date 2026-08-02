import type { ItemPath } from '../postman/tree.ts';

export type WorkspaceTab =
  | { kind: 'collection'; collectionPath: string }
  | { kind: 'folder'; collectionPath: string; path: ItemPath }
  | { kind: 'request'; collectionPath: string; path: ItemPath }
  | { kind: 'environment'; environmentPath: string };

export type SessionTab =
  | { kind: 'collection'; collectionPath: string }
  | { kind: 'folder'; collectionPath: string; path: string }
  | { kind: 'request'; collectionPath: string; path: string }
  | { kind: 'environment'; environmentPath: string };

function enc(filePath: string): string {
  return encodeURIComponent(filePath);
}

function dec(value: string): string {
  return decodeURIComponent(value);
}

/** Encode a stable tab identity that includes the collection or environment file path. */
export function tabKey(tab: WorkspaceTab): string {
  if (tab.kind === 'environment') {
    return `environment:${enc(tab.environmentPath)}`;
  }
  const collection = enc(tab.collectionPath);
  if (tab.kind === 'collection') {
    return `collection:${collection}`;
  }
  return `${tab.kind}:${collection}:${tab.path}`;
}

export function sameTab(a: WorkspaceTab, b: WorkspaceTab): boolean {
  return tabKey(a) === tabKey(b);
}

export type OpenTabOptions = {
  /** Always append a new tab slot (⌘/Ctrl+click, drag onto tab bar, file dialog). */
  forceNew?: boolean;
};

/**
 * Decide the next tab strip after opening `tab`.
 * - Already open → unchanged list (caller still activates).
 * - `forceNew` → append.
 * - Else if the active tab is present and not sticky (`isDirty` — unsaved
 *   and/or pinned) → replace it in place.
 * - Else → append.
 */
export function nextOpenTabs(
  current: WorkspaceTab[],
  tab: WorkspaceTab,
  active: WorkspaceTab | null,
  options: OpenTabOptions & { isDirty: (tab: WorkspaceTab) => boolean }
): WorkspaceTab[] {
  if (current.some((entry) => sameTab(entry, tab))) {
    return current;
  }
  if (options.forceNew) {
    return [...current, tab];
  }
  if (
    active &&
    current.some((entry) => sameTab(entry, active)) &&
    !options.isDirty(active)
  ) {
    return current.map((entry) => (sameTab(entry, active) ? tab : entry));
  }
  return [...current, tab];
}

export function parseTabKey(key: string): WorkspaceTab | null {
  if (key.startsWith('environment:')) {
    try {
      return {
        kind: 'environment',
        environmentPath: dec(key.slice('environment:'.length))
      };
    } catch {
      return null;
    }
  }
  if (key.startsWith('collection:')) {
    try {
      return { kind: 'collection', collectionPath: dec(key.slice('collection:'.length)) };
    } catch {
      return null;
    }
  }
  if (key.startsWith('folder:') || key.startsWith('request:')) {
    const kind = key.startsWith('folder:') ? 'folder' : 'request';
    const prefix = kind === 'folder' ? 'folder:' : 'request:';
    const rest = key.slice(prefix.length);
    const split = rest.indexOf(':');
    if (split <= 0) {
      return null;
    }
    try {
      return {
        kind,
        collectionPath: dec(rest.slice(0, split)),
        path: rest.slice(split + 1)
      };
    } catch {
      return null;
    }
  }
  return null;
}

export function toSessionTab(tab: WorkspaceTab): SessionTab {
  if (tab.kind === 'environment') {
    return { kind: 'environment', environmentPath: tab.environmentPath };
  }
  if (tab.kind === 'collection') {
    return { kind: 'collection', collectionPath: tab.collectionPath };
  }
  return {
    kind: tab.kind,
    collectionPath: tab.collectionPath,
    path: tab.path
  };
}

export function fromSessionTab(tab: SessionTab): WorkspaceTab {
  if (tab.kind === 'environment') {
    return { kind: 'environment', environmentPath: tab.environmentPath };
  }
  if (tab.kind === 'collection') {
    return { kind: 'collection', collectionPath: tab.collectionPath };
  }
  return {
    kind: tab.kind,
    collectionPath: tab.collectionPath,
    path: tab.path
  };
}

export function requestRunKey(collectionPath: string, path: ItemPath): string {
  return `${enc(collectionPath)}::${path}`;
}
