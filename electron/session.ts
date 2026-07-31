import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** Developer-tool convention: keep app metadata under ~/.clara */
export const CLARA_HOME = path.join(os.homedir(), '.clara');
export const SESSION_FILE = path.join(CLARA_HOME, 'session.json');

export type SessionTab =
  | { kind: 'collection' }
  | { kind: 'folder'; path: string }
  | { kind: 'request'; path: string };

export type SessionState = {
  version: 2;
  collectionPath: string | null;
  openTabs: SessionTab[];
  activeTabKey: string | null;
  expandedPaths: string[];
};

export const EMPTY_SESSION: SessionState = {
  version: 2,
  collectionPath: null,
  openTabs: [],
  activeTabKey: null,
  expandedPaths: []
};

function isSessionTab(value: unknown): value is SessionTab {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === 'collection') {
    return true;
  }
  return (
    (candidate.kind === 'folder' || candidate.kind === 'request') &&
    typeof candidate.path === 'string'
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

  const openTabs: SessionTab[] = (value.openPaths as string[]).map((path) => ({
    kind: 'request',
    path
  }));
  const activePath = value.activePath as string | null;

  return {
    version: 2,
    collectionPath: value.collectionPath as string | null,
    openTabs,
    activeTabKey: activePath ? `request:${activePath}` : null,
    expandedPaths: value.expandedPaths as string[]
  };
}

function isSessionState(value: unknown): value is SessionState {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === 2 &&
    (candidate.collectionPath === null || typeof candidate.collectionPath === 'string') &&
    Array.isArray(candidate.openTabs) &&
    candidate.openTabs.every(isSessionTab) &&
    (candidate.activeTabKey === null || typeof candidate.activeTabKey === 'string') &&
    Array.isArray(candidate.expandedPaths) &&
    candidate.expandedPaths.every((entry) => typeof entry === 'string')
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
      const migrated = migrateV1(parsed as Record<string, unknown>);
      if (migrated) {
        return migrated;
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
    version: 2,
    collectionPath: state.collectionPath ?? null,
    openTabs: state.openTabs ?? [],
    activeTabKey: state.activeTabKey ?? null,
    expandedPaths: state.expandedPaths ?? []
  };
  await writeFile(SESSION_FILE, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}
