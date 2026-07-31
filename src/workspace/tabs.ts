import type { ItemPath } from '../postman/tree.ts';

export type WorkspaceTab =
  | { kind: 'collection' }
  | { kind: 'folder'; path: ItemPath }
  | { kind: 'request'; path: ItemPath };

export type SessionTab =
  | { kind: 'collection' }
  | { kind: 'folder'; path: string }
  | { kind: 'request'; path: string };

export function tabKey(tab: WorkspaceTab): string {
  if (tab.kind === 'collection') {
    return 'collection';
  }
  return `${tab.kind}:${tab.path}`;
}

export function sameTab(a: WorkspaceTab, b: WorkspaceTab): boolean {
  return tabKey(a) === tabKey(b);
}

export function parseTabKey(key: string): WorkspaceTab | null {
  if (key === 'collection') {
    return { kind: 'collection' };
  }
  if (key.startsWith('folder:')) {
    return { kind: 'folder', path: key.slice('folder:'.length) };
  }
  if (key.startsWith('request:')) {
    return { kind: 'request', path: key.slice('request:'.length) };
  }
  return null;
}

export function toSessionTab(tab: WorkspaceTab): SessionTab {
  if (tab.kind === 'collection') {
    return { kind: 'collection' };
  }
  return { kind: tab.kind, path: tab.path };
}

export function fromSessionTab(tab: SessionTab): WorkspaceTab {
  if (tab.kind === 'collection') {
    return { kind: 'collection' };
  }
  return { kind: tab.kind, path: tab.path };
}
