import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** Developer-tool convention: keep app metadata under ~/.clara */
export const CLARA_HOME = path.join(os.homedir(), '.clara');
export const SESSION_FILE = path.join(CLARA_HOME, 'session.json');

export type SessionTab =
  | { kind: 'collection'; collectionPath: string }
  | { kind: 'folder'; collectionPath: string; path: string }
  | { kind: 'request'; collectionPath: string; path: string };

export type SessionCollectionEntry = {
  path: string;
  expandedPaths: string[];
  collectionExpanded: boolean;
};

export type SessionState = {
  version: 3;
  collections: SessionCollectionEntry[];
  openTabs: SessionTab[];
  activeTabKey: string | null;
};

export const EMPTY_SESSION: SessionState = {
  version: 3,
  collections: [],
  openTabs: [],
  activeTabKey: null
};

function isSessionTab(value: unknown): value is SessionTab {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.collectionPath !== 'string') {
    return false;
  }
  if (candidate.kind === 'collection') {
    return true;
  }
  return (
    (candidate.kind === 'folder' || candidate.kind === 'request') &&
    typeof candidate.path === 'string'
  );
}

function isSessionCollectionEntry(value: unknown): value is SessionCollectionEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.path === 'string' &&
    Array.isArray(candidate.expandedPaths) &&
    candidate.expandedPaths.every((entry) => typeof entry === 'string') &&
    typeof candidate.collectionExpanded === 'boolean'
  );
}

function migrateV1(value: Record<string, unknown>): SessionState | null {
  if (value.version !== 1) {
    return null;
  }
  if (
    !(value.collectionPath === null || typeof value.collectionPath === 'string') ||
    !Array.isArray(value.openPaths) ||
    !value.openPaths.every((entry) => typeof entry === 'string') ||
    !(value.activePath === null || typeof value.activePath === 'string') ||
    !Array.isArray(value.expandedPaths) ||
    !value.expandedPaths.every((entry) => typeof entry === 'string')
  ) {
    return null;
  }

  const collectionPath = value.collectionPath as string | null;
  if (!collectionPath) {
    return { ...EMPTY_SESSION };
  }

  const openTabs: SessionTab[] = (value.openPaths as string[]).map((itemPath) => ({
    kind: 'request',
    collectionPath,
    path: itemPath
  }));
  const activePath = value.activePath as string | null;

  return {
    version: 3,
    collections: [
      {
        path: collectionPath,
        expandedPaths: value.expandedPaths as string[],
        collectionExpanded: true
      }
    ],
    openTabs,
    activeTabKey: activePath
      ? `request:${encodeURIComponent(collectionPath)}:${activePath}`
      : null
  };
}

function migrateV2(value: Record<string, unknown>): SessionState | null {
  if (value.version !== 2) {
    return null;
  }
  if (
    !(value.collectionPath === null || typeof value.collectionPath === 'string') ||
    !Array.isArray(value.openTabs) ||
    !(value.activeTabKey === null || typeof value.activeTabKey === 'string') ||
    !Array.isArray(value.expandedPaths) ||
    !value.expandedPaths.every((entry) => typeof entry === 'string')
  ) {
    return null;
  }

  const collectionPath = value.collectionPath as string | null;
  if (!collectionPath) {
    return { ...EMPTY_SESSION };
  }

  const openTabs: SessionTab[] = [];
  for (const entry of value.openTabs) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const tab = entry as Record<string, unknown>;
    if (tab.kind === 'collection') {
      openTabs.push({ kind: 'collection', collectionPath });
      continue;
    }
    if (
      (tab.kind === 'folder' || tab.kind === 'request') &&
      typeof tab.path === 'string'
    ) {
      openTabs.push({
        kind: tab.kind,
        collectionPath,
        path: tab.path
      });
    }
  }

  let activeTabKey: string | null = null;
  const rawActive = value.activeTabKey as string | null;
  const encoded = encodeURIComponent(collectionPath);
  if (rawActive === 'collection') {
    activeTabKey = `collection:${encoded}`;
  } else if (rawActive?.startsWith('folder:')) {
    activeTabKey = `folder:${encoded}:${rawActive.slice('folder:'.length)}`;
  } else if (rawActive?.startsWith('request:')) {
    activeTabKey = `request:${encoded}:${rawActive.slice('request:'.length)}`;
  }

  return {
    version: 3,
    collections: [
      {
        path: collectionPath,
        expandedPaths: value.expandedPaths as string[],
        collectionExpanded: true
      }
    ],
    openTabs,
    activeTabKey
  };
}

function isSessionState(value: unknown): value is SessionState {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === 3 &&
    Array.isArray(candidate.collections) &&
    candidate.collections.every(isSessionCollectionEntry) &&
    Array.isArray(candidate.openTabs) &&
    candidate.openTabs.every(isSessionTab) &&
    (candidate.activeTabKey === null || typeof candidate.activeTabKey === 'string')
  );
}

export async function ensureClaraHome(): Promise<string> {
  await mkdir(CLARA_HOME, { recursive: true });
  return CLARA_HOME;
}

export async function loadSession(): Promise<SessionState> {
  try {
    const raw = await readFile(SESSION_FILE, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (isSessionState(parsed)) {
      return parsed;
    }
    if (parsed && typeof parsed === 'object') {
      const asRecord = parsed as Record<string, unknown>;
      const migratedV2 = migrateV2(asRecord);
      if (migratedV2) {
        return migratedV2;
      }
      const migratedV1 = migrateV1(asRecord);
      if (migratedV1) {
        return migratedV1;
      }
    }
    return { ...EMPTY_SESSION };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return { ...EMPTY_SESSION };
    }
    throw error;
  }
}

export async function saveSession(state: SessionState): Promise<SessionState> {
  await ensureClaraHome();
  const normalized: SessionState = {
    version: 3,
    collections: state.collections ?? [],
    openTabs: state.openTabs ?? [],
    activeTabKey: state.activeTabKey ?? null
  };
  await writeFile(SESSION_FILE, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}
