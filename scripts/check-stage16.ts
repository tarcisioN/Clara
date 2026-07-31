import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import {
  discoverGit,
  readCollectionAtRef
} from '../electron/git.ts';
import { computeStructuralDiff } from '../src/git/structuralDiff.ts';
import { assertPostmanCollection } from '../src/postman/types.ts';

// Sandbox HOME before importing session.ts: it resolves ~/.clara at module load,
// so a static import here would read and overwrite the developer's own session.
const home = mkdtempSync(path.join(tmpdir(), 'clara-stage16-home-'));
const previousHome = process.env.HOME;
process.env.HOME = home;

const { normalizeCompareBases, loadSession, saveSession } = await import(
  '../electron/session.ts'
);

assert.deepEqual(normalizeCompareBases(undefined), {});
assert.deepEqual(normalizeCompareBases(null), {});
assert.deepEqual(normalizeCompareBases({ '/a': 'main', '/b': '  develop  ', bad: 1 }), {
  '/a': 'main',
  '/b': 'develop'
});

const root = mkdtempSync(path.join(tmpdir(), 'clara-stage16-'));
const repoUnlinked = path.join(root, 'repo');
mkdirSync(repoUnlinked);
const { realpathSync } = await import('node:fs');
const repo = realpathSync(repoUnlinked);

function git(cwd: string, args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, '../fixtures/smoke.postman_collection.json');
const fixtureRaw = readFileSync(fixturePath, 'utf8');

try {
  git(repo, ['-c', 'init.defaultBranch=main', 'init']);
  git(repo, ['config', 'user.email', 'clara@example.com']);
  git(repo, ['config', 'user.name', 'Clara']);

  const collectionsDir = path.join(repo, 'collections');
  mkdirSync(collectionsDir);
  const collectionPath = path.join(collectionsDir, 'smoke.postman_collection.json');
  writeFileSync(collectionPath, fixtureRaw, 'utf8');
  git(repo, ['add', 'collections/smoke.postman_collection.json']);
  git(repo, ['commit', '-m', 'base']);

  git(repo, ['checkout', '-b', 'feature']);
  const edited = assertPostmanCollection(JSON.parse(fixtureRaw));
  const ping = edited.item?.[0]?.item?.[0];
  if (!ping?.request || typeof ping.request === 'string') {
    throw new Error('fixture missing Health/Ping request');
  }
  ping.request.method = 'POST';
  writeFileSync(collectionPath, `${JSON.stringify(edited, null, 2)}\n`, 'utf8');
  git(repo, ['add', 'collections/smoke.postman_collection.json']);
  git(repo, ['commit', '-m', 'feature']);

  // Also create develop for selector coverage.
  git(repo, ['branch', 'develop', 'main']);

  const discovered = await discoverGit(collectionPath);
  assert.equal(discovered.inRepo, true);
  if (!discovered.inRepo) {
    throw new Error('expected repo');
  }
  assert.ok(discovered.branches.includes('main'));
  assert.ok(discovered.branches.includes('feature'));
  assert.ok(discovered.branches.includes('develop'));

  const atMain = await readCollectionAtRef(collectionPath, 'main');
  const atFeature = await readCollectionAtRef(collectionPath, 'feature');
  const mainCollection = assertPostmanCollection(JSON.parse(atMain.raw));
  const featureCollection = assertPostmanCollection(JSON.parse(atFeature.raw));

  const vsMain = computeStructuralDiff(featureCollection, mainCollection);
  assert.ok(vsMain.changedCount > 0);

  const vsSelf = computeStructuralDiff(featureCollection, featureCollection);
  assert.equal(vsSelf.changedCount, 0);

  // Persisting preferred base per repo root.
  const saved = await saveSession({
    version: 4,
    collections: [],
    openTabs: [],
    activeTabKey: null,
    openedEnvironments: [],
    activeEnvironmentPath: null,
    sidebar: {
      collectionsExpanded: true,
      environmentsExpanded: true,
      changesExpanded: true,
      width: 270,
      followActiveTab: false,
      changedOnly: false
    },
    compareBases: { [discovered.repoRoot]: 'develop' }
  });
  assert.equal(saved.compareBases[discovered.repoRoot], 'develop');
  const loaded = await loadSession();
  assert.equal(loaded.compareBases[discovered.repoRoot], 'develop');

  // Invalid base persistence is stripped.
  assert.deepEqual(normalizeCompareBases({ [discovered.repoRoot]: '   ' }), {});

  console.log('stage16 checks passed');
} finally {
  if (previousHome == null) {
    delete process.env.HOME;
  } else {
    process.env.HOME = previousHome;
  }
  rmSync(home, { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
}
