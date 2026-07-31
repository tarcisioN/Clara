import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** Developer-tool convention: keep app metadata under ~/.clara */
export const CLARA_HOME = path.join(os.homedir(), '.clara');
export const SESSION_FILE = path.join(CLARA_HOME, 'session.json');

export type SessionState = {
  version: 1;
  collectionPath: string | null;
  openPaths: string[];
  activePath: string | null;
  expandedPaths: string[];
};

export const EMPTY_SESSION: SessionState = {
  version: 1,
  collectionPath: null,
  openPaths: [],
  activePath: null,
  expandedPaths: []
};

function isSessionState(value: unknown): value is SessionState {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === 1 &&
    (candidate.collectionPath === null || typeof candidate.collectionPath === 'string') &&
    Array.isArray(candidate.openPaths) &&
    candidate.openPaths.every((entry) => typeof entry === 'string') &&
    (candidate.activePath === null || typeof candidate.activePath === 'string') &&
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
    if (!isSessionState(parsed)) {
      return { ...EMPTY_SESSION };
    }
    return parsed;
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
    version: 1,
    collectionPath: state.collectionPath ?? null,
    openPaths: state.openPaths ?? [],
    activePath: state.activePath ?? null,
    expandedPaths: state.expandedPaths ?? []
  };
  await writeFile(SESSION_FILE, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}
