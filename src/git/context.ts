import type { GitDiscoverResult } from '../../electron/git.ts';
import { assertPostmanCollection, type PostmanCollection } from '../postman/types.ts';
import {
  assertPostmanEnvironment,
  type PostmanEnvironment
} from '../postman/environment.ts';

export type GitContext = Extract<GitDiscoverResult, { inRepo: true }>;

/** Discover git metadata for an open collection/environment path; null when not in a repo. */
export async function discoverForCollection(
  filePath: string
): Promise<GitContext | null> {
  const result = await window.clara.discoverGit(filePath);
  return result.inRepo ? result : null;
}

/**
 * Load and parse the collection blob at `ref` (no working-tree checkout).
 * Returns null when the file is untracked at that ref, so there is nothing to compare.
 */
export async function loadCollectionAtRef(
  filePath: string,
  ref: string
): Promise<PostmanCollection | null> {
  const result = await window.clara.readCollectionAtRef(filePath, ref);
  if (result.raw == null) {
    return null;
  }
  return assertPostmanCollection(JSON.parse(result.raw));
}

/** Load and parse an environment blob at `ref`; null when untracked at that ref. */
export async function loadEnvironmentAtRef(
  filePath: string,
  ref: string
): Promise<PostmanEnvironment | null> {
  const result = await window.clara.readCollectionAtRef(filePath, ref);
  if (result.raw == null) {
    return null;
  }
  return assertPostmanEnvironment(JSON.parse(result.raw));
}
