import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  discoverGit,
  findRepoRoot,
  readCollectionAtRef,
  readFileAtRef,
  resolveDefaultBase
} from '../electron/git.ts';
import { assertPostmanCollection } from '../src/postman/types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, '../fixtures/smoke.postman_collection.json');
const fixtureRaw = readFileSync(fixturePath, 'utf8');

function git(cwd: string, args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

const root = mkdtempSync(path.join(tmpdir(), 'clara-stage12-'));
const repoUnlinked = path.join(root, 'repo');
mkdirSync(repoUnlinked);
const repo = realpathSync(repoUnlinked);

try {
  git(repo, ['-c', 'init.defaultBranch=main', 'init']);
  git(repo, ['config', 'user.email', 'clara@example.com']);
  git(repo, ['config', 'user.name', 'Clara']);

  const collectionsDir = path.join(repo, 'collections');
  mkdirSync(collectionsDir);
  const collectionPath = path.join(collectionsDir, 'smoke.postman_collection.json');
  writeFileSync(collectionPath, fixtureRaw, 'utf8');
  git(repo, ['add', 'collections/smoke.postman_collection.json']);
  git(repo, ['commit', '-m', 'add smoke collection']);

  // Feature branch mutates the file on disk (working tree ≠ main blob).
  git(repo, ['checkout', '-b', 'feature']);
  const edited = assertPostmanCollection(JSON.parse(fixtureRaw));
  edited.info.name = 'Feature Branch Collection';
  writeFileSync(collectionPath, `${JSON.stringify(edited, null, 2)}\n`, 'utf8');
  git(repo, ['add', 'collections/smoke.postman_collection.json']);
  git(repo, ['commit', '-m', 'rename on feature']);

  const discoveredRoot = await findRepoRoot(collectionPath);
  assert.equal(discoveredRoot, repo);

  const discovered = await discoverGit(collectionPath);
  assert.equal(discovered.inRepo, true);
  if (!discovered.inRepo) {
    throw new Error('expected inRepo');
  }
  assert.equal(discovered.repoRoot, repo);
  assert.equal(discovered.relPath, path.join('collections', 'smoke.postman_collection.json'));
  assert.equal(discovered.currentBranch, 'feature');
  assert.equal(discovered.defaultBase, 'main');
  assert.ok(discovered.branches.includes('main'));
  assert.ok(discovered.branches.includes('feature'));

  assert.equal(await resolveDefaultBase(repo), 'main');

  const atMain = await readFileAtRef(
    repo,
    'main',
    path.join('collections', 'smoke.postman_collection.json')
  );
  assert.equal(atMain.raw, fixtureRaw);
  const mainCollection = assertPostmanCollection(JSON.parse(atMain.raw));
  assert.equal(mainCollection.info?.name, 'Clara Smoke Collection');

  const atFeature = await readCollectionAtRef(collectionPath, 'feature');
  const featureCollection = assertPostmanCollection(JSON.parse(atFeature.raw));
  assert.equal(featureCollection.info?.name, 'Feature Branch Collection');

  // Outside a repo
  const outsideDir = path.join(root, 'outside');
  mkdirSync(outsideDir);
  const outsideFile = path.join(outsideDir, 'orphan.json');
  writeFileSync(outsideFile, fixtureRaw, 'utf8');
  const outside = await discoverGit(outsideFile);
  assert.equal(outside.inRepo, false);

  // Missing path at ref
  await assert.rejects(
    () => readFileAtRef(repo, 'main', 'collections/does-not-exist.json'),
    /git show failed|does not exist|exists on disk/i
  );

  console.log('stage12 checks passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
