import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  fromSessionTab,
  isDraftTab,
  nextOpenTabs,
  parseTabKey,
  requestRunKey,
  sameTab,
  tabKey,
  toSessionTab,
  type WorkspaceTab
} from '../src/workspace/tabs.ts';
import {
  clearCollectionDirty,
  createCollectionUiState,
  isCollectionDirty
} from '../src/workspace/collectionUi.ts';

// Tab identity survives collection paths with separators, spaces and unicode.
const awkwardPaths = [
  '/Users/dev/apis/prod.postman_collection.json',
  '/Users/dev/测试/my apis/a:b/collection.json',
  'C:\\Users\\dev\\api%20v2\\team.json',
  '/tmp/weird#name?v=1.json'
];

for (const collectionPath of awkwardPaths) {
  const cases: WorkspaceTab[] = [
    { kind: 'collection', collectionPath },
    { kind: 'folder', collectionPath, path: '0.1' },
    { kind: 'request', collectionPath, path: '0.1.2' }
  ];
  for (const tab of cases) {
    const roundtrip = parseTabKey(tabKey(tab));
    assert.deepEqual(roundtrip, tab, `roundtrip failed for ${tabKey(tab)}`);
    assert.equal(sameTab(roundtrip!, tab), true);
    assert.deepEqual(fromSessionTab(toSessionTab(tab)), tab);
  }
}

// The same item path in two collections is never the same tab or the same run key.
const a = '/repo-a/api.postman_collection.json';
const b = '/repo-b/api.postman_collection.json';
assert.equal(
  sameTab(
    { kind: 'request', collectionPath: a, path: '0' },
    { kind: 'request', collectionPath: b, path: '0' }
  ),
  false
);
assert.notEqual(requestRunKey(a, '0'), requestRunKey(b, '0'));
assert.ok(requestRunKey(a, '0.1').startsWith(requestRunKey(a, '')));

// A draft is a tab of its own, so it never shares identity — or a response —
// with the request it was copied from.
{
  const source: WorkspaceTab = { kind: 'request', collectionPath: a, path: '0.1' };
  const draft: WorkspaceTab = { ...source, draftId: 'd1' };
  assert.notEqual(tabKey(draft), tabKey(source));
  assert.equal(sameTab(draft, source), false);
  assert.equal(isDraftTab(draft), true);
  assert.equal(isDraftTab(source), false);
  assert.deepEqual(parseTabKey(tabKey(draft)), draft);
  assert.notEqual(requestRunKey(a, '0.1', 'd1'), requestRunKey(a, '0.1'));
  assert.notEqual(requestRunKey(a, '0.1', 'd1'), requestRunKey(a, '0.1', 'd2'));
}

assert.equal(parseTabKey('nonsense'), null);
assert.equal(parseTabKey('request:'), null);

// Per-collection UI state
const ui = createCollectionUiState(['0', '0.1'], false);
assert.equal(ui.expanded.has('0.1'), true);
assert.equal(ui.collectionExpanded, false);
assert.equal(isCollectionDirty(ui), false);

const dirtyUi = { ...ui, dirtyPaths: new Set(['0.1']) };
assert.equal(isCollectionDirty(dirtyUi), true);
const cleaned = clearCollectionDirty(dirtyUi);
assert.equal(isCollectionDirty(cleaned), false);
assert.equal(cleaned.expanded.has('0.1'), true, 'clearing dirty keeps expanded state');

// Opening a tab replaces the clean active tab; dirty active appends; forceNew always appends.
const reqA: WorkspaceTab = { kind: 'request', collectionPath: a, path: '0' };
const reqB: WorkspaceTab = { kind: 'request', collectionPath: a, path: '1' };
const reqC: WorkspaceTab = { kind: 'request', collectionPath: a, path: '2' };
const neverDirty = () => false;
const onlyADirty = (tab: WorkspaceTab) => sameTab(tab, reqA);

assert.deepEqual(
  nextOpenTabs([reqA], reqB, reqA, { isDirty: neverDirty }),
  [reqB],
  'clean active is replaced'
);
assert.deepEqual(
  nextOpenTabs([reqA], reqB, reqA, { isDirty: onlyADirty }),
  [reqA, reqB],
  'dirty active keeps a new slot'
);
assert.deepEqual(
  nextOpenTabs([reqA], reqB, reqA, { forceNew: true, isDirty: neverDirty }),
  [reqA, reqB],
  'forceNew appends even when active is clean'
);
assert.deepEqual(
  nextOpenTabs([reqA, reqB], reqA, reqB, { isDirty: neverDirty }),
  [reqA, reqB],
  'already-open tab does not duplicate'
);
assert.deepEqual(
  nextOpenTabs([reqA], reqC, null, { isDirty: neverDirty }),
  [reqA, reqC],
  'no active tab → append'
);

// Session v3: multiple collections round-trip, and v2 migrates into one entry.
const home = mkdtempSync(path.join(tmpdir(), 'clara-stage10-'));
const previousHome = process.env.HOME;
process.env.HOME = home;
try {
  mkdirSync(path.join(home, '.clara'), { recursive: true });
  writeFileSync(
    path.join(home, '.clara', 'session.json'),
    JSON.stringify({
      version: 2,
      collectionPath: a,
      openTabs: [{ kind: 'collection' }, { kind: 'request', path: '0.1' }],
      activeTabKey: 'request:0.1',
      expandedPaths: ['0']
    }),
    'utf8'
  );

  const session = await import('../electron/session.ts');
  const migrated = await session.loadSession();
  assert.equal(migrated.version, 4);
  assert.equal(migrated.collections.length, 1);
  assert.equal(migrated.collections[0]?.path, a);
  assert.deepEqual(migrated.collections[0]?.expandedPaths, ['0']);
  assert.equal(migrated.openTabs.length, 2);
  assert.equal(migrated.openTabs[1]?.collectionPath, a);
  assert.deepEqual(
    parseTabKey(migrated.activeTabKey!),
    { kind: 'request', collectionPath: a, path: '0.1' }
  );
  assert.deepEqual(migrated.openedEnvironments, []);
  assert.equal(migrated.activeEnvironmentPath, null);
  assert.equal(migrated.sidebar.width, 270);

  const saved = await session.saveSession({
    version: 4,
    collections: [
      { path: a, expandedPaths: ['0'], collectionExpanded: true },
      { path: b, expandedPaths: [], collectionExpanded: false }
    ],
    openTabs: [
      { kind: 'collection', collectionPath: a },
      { kind: 'request', collectionPath: b, path: '2' }
    ],
    activeTabKey: tabKey({ kind: 'request', collectionPath: b, path: '2' }),
    openedEnvironments: [],
    activeEnvironmentPath: null,
    sidebar: {
      collectionsExpanded: true,
      environmentsExpanded: true,
      changesExpanded: true,
      width: 270
    }
  });
  assert.equal(saved.collections.length, 2);

  const reloaded = await session.loadSession();
  assert.deepEqual(reloaded, saved);
  assert.equal(reloaded.collections[1]?.collectionExpanded, false);
} finally {
  if (previousHome == null) {
    delete process.env.HOME;
  } else {
    process.env.HOME = previousHome;
  }
  rmSync(home, { recursive: true, force: true });
}

console.log('stage10 checks passed');
