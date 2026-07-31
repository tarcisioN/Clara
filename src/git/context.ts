import type { GitDiscoverResult } from '../../electron/git.ts';
import { assertPostmanCollection, type PostmanCollection } from '../postman/types.ts';

export type GitContext = Extract<GitDiscoverResult, { inRepo: true }>;

/** Discover git metadata for an open collection path; null when not in a repo. */
export async function discoverForCollection(
  filePath: string
): Promise<GitContext | null> {
  const result = await window.clara.discoverGit(filePath);
  return result.inRepo ? result : null;
}

/** Load and parse the collection blob at `ref` (no working-tree checkout). */
export async function loadCollectionAtRef(
  filePath: string,
  ref: string
): Promise<PostmanCollection> {
  const { raw } = await window.clara.readCollectionAtRef(filePath, ref);
  return assertPostmanCollection(JSON.parse(raw));
}
