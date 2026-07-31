import type { ItemPath } from '../postman/tree.ts';

export type WorkspaceTab =
  | { kind: 'collection'; collectionPath: string }
  | { kind: 'folder'; collectionPath: string; path: ItemPath }
  | { kind: 'request'; collectionPath: string; path: ItemPath };

export type SessionTab =
  | { kind: 'collection'; collectionPath: string }
  | { kind: 'folder'; collectionPath: string; path: string }
  | { kind: 'request'; collectionPath: string; path: string };

function enc(collectionPath: string): string {
  return encodeURIComponent(collectionPath);
}

function dec(value: string): string {
  return decodeURIComponent(value);
}

/** Encode a stable tab identity that includes the collection file path. */
export function tabKey(tab: WorkspaceTab): string {
  const collection = enc(tab.collectionPath);
  if (tab.kind === 'collection') {
    return `collection:${collection}`;
  }
  return `${tab.kind}:${collection}:${tab.path}`;
}

export function sameTab(a: WorkspaceTab, b: WorkspaceTab): boolean {
  return tabKey(a) === tabKey(b);
}

export function parseTabKey(key: string): WorkspaceTab | null {
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
