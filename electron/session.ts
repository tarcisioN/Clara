import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_SIDEBAR,
  normalizeSidebar,
  type SessionSidebar
} from '../src/workspace/sidebar.ts';

export type { SessionSidebar };
export {
  DEFAULT_SIDEBAR,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH
} from '../src/workspace/sidebar.ts';

/** Developer-tool convention: keep app metadata under ~/.clara */
export const CLARA_HOME = path.join(os.homedir(), '.clara');
export const SESSION_FILE = path.join(CLARA_HOME, 'session.json');

export type SessionTab =
  | { kind: 'collection'; collectionPath: string }
  | { kind: 'folder'; collectionPath: string; path: string }
  | { kind: 'request'; collectionPath: string; path: string }
  | { kind: 'environment'; environmentPath: string };

export type SessionCollectionEntry = {
  path: string;
  expandedPaths: string[];
  collectionExpanded: boolean;
};

export type SessionState = {
  version: 4;
  collections: SessionCollectionEntry[];
  openTabs: SessionTab[];
  activeTabKey: string | null;
  openedEnvironments: string[];
  activeEnvironmentPath: string | null;
  sidebar: SessionSidebar;
  /** Last selected compare base ref, keyed by git repo root. */
  compareBases: Record<string, string>;
};

export const EMPTY_SESSION: SessionState = {
  version: 4,
  collections: [],
  openTabs: [],
  activeTabKey: null,
  openedEnvironments: [],
  activeEnvironmentPath: null,
  sidebar: { ...DEFAULT_SIDEBAR },
  compareBases: {}
};

export function normalizeCompareBases(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof key === 'string' && key.length > 0 && typeof entry === 'string' && entry.trim()) {
      result[key] = entry.trim();
    }
  }
  return result;
}

function isSessionTab(value: unknown): value is SessionTab {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === 'environment') {
    return typeof candidate.environmentPath === 'string';
  }
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

function withSessionDefaults(partial: {
  collections: SessionCollectionEntry[];
  openTabs: SessionTab[];
  activeTabKey: string | null;
  openedEnvironments?: string[];
  activeEnvironmentPath?: string | null;
  sidebar?: SessionSidebar;
  compareBases?: Record<string, string>;
}): SessionState {
  return {
    version: 4,
    collections: partial.collections,
    openTabs: partial.openTabs,
    activeTabKey: partial.activeTabKey,
    openedEnvironments: partial.openedEnvironments ?? [],
    activeEnvironmentPath: partial.activeEnvironmentPath ?? null,
    sidebar: partial.sidebar ?? { ...DEFAULT_SIDEBAR },
    compareBases: normalizeCompareBases(partial.compareBases)
  };
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

  return withSessionDefaults({
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
  });
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

  return withSessionDefaults({
    collections: [
      {
        path: collectionPath,
        expandedPaths: value.expandedPaths as string[],
        collectionExpanded: true
      }
    ],
    openTabs,
    activeTabKey
  });
}

function migrateV3(value: Record<string, unknown>): SessionState | null {
  if (value.version !== 3) {
    return null;
  }
  if (
    !Array.isArray(value.collections) ||
    !value.collections.every(isSessionCollectionEntry) ||
    !Array.isArray(value.openTabs) ||
    !value.openTabs.every(isSessionTab) ||
    !(value.activeTabKey === null || typeof value.activeTabKey === 'string')
  ) {
    return null;
  }

  return withSessionDefaults({
    collections: value.collections as SessionCollectionEntry[],
    openTabs: value.openTabs as SessionTab[],
    activeTabKey: value.activeTabKey as string | null,
    openedEnvironments: Array.isArray(value.openedEnvironments)
      ? (value.openedEnvironments as unknown[]).filter(
          (entry): entry is string => typeof entry === 'string'
        )
      : [],
    activeEnvironmentPath:
      value.activeEnvironmentPath === null || typeof value.activeEnvironmentPath === 'string'
        ? (value.activeEnvironmentPath as string | null)
        : null,
    sidebar: normalizeSidebar(value.sidebar),
    compareBases: normalizeCompareBases(value.compareBases)
  });
}

function isSessionState(value: unknown): value is SessionState {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === 4 &&
    Array.isArray(candidate.collections) &&
    candidate.collections.every(isSessionCollectionEntry) &&
    Array.isArray(candidate.openTabs) &&
    candidate.openTabs.every(isSessionTab) &&
    (candidate.activeTabKey === null || typeof candidate.activeTabKey === 'string') &&
    Array.isArray(candidate.openedEnvironments) &&
    candidate.openedEnvironments.every((entry) => typeof entry === 'string') &&
    (candidate.activeEnvironmentPath === null ||
      typeof candidate.activeEnvironmentPath === 'string') &&
    !!candidate.sidebar &&
    typeof candidate.sidebar === 'object'
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
      return {
        ...parsed,
        sidebar: normalizeSidebar(parsed.sidebar),
        compareBases: normalizeCompareBases(parsed.compareBases)
      };
    }
    if (parsed && typeof parsed === 'object') {
      const asRecord = parsed as Record<string, unknown>;
      const migratedV3 = migrateV3(asRecord);
      if (migratedV3) {
        return migratedV3;
      }
      const migratedV2 = migrateV2(asRecord);
      if (migratedV2) {
        return migratedV2;
      }
      const migratedV1 = migrateV1(asRecord);
      if (migratedV1) {
        return migratedV1;
      }
    }
    return { ...EMPTY_SESSION, sidebar: { ...DEFAULT_SIDEBAR } };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return { ...EMPTY_SESSION, sidebar: { ...DEFAULT_SIDEBAR } };
    }
    throw error;
  }
}

export async function saveSession(state: SessionState): Promise<SessionState> {
  await ensureClaraHome();
  const normalized: SessionState = {
    version: 4,
    collections: state.collections ?? [],
    openTabs: state.openTabs ?? [],
    activeTabKey: state.activeTabKey ?? null,
    openedEnvironments: state.openedEnvironments ?? [],
    activeEnvironmentPath: state.activeEnvironmentPath ?? null,
    sidebar: normalizeSidebar(state.sidebar),
    compareBases: normalizeCompareBases(state.compareBases)
  };
  await writeFile(SESSION_FILE, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}
