import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  addEnvironmentValue,
  assertPostmanEnvironment,
  environmentsEqual,
  isEnvironmentDirty,
  isPostmanEnvironment,
  removeEnvironmentValue,
  renameEnvironment,
  serializeEnvironment,
  setEnvironmentValueEnabled,
  setEnvironmentValues,
  updateEnvironmentValue,
  type PostmanEnvironment
} from '../src/postman/environment.ts';
import { parseTabKey, tabKey, toSessionTab, fromSessionTab } from '../src/workspace/tabs.ts';
import {
  CHANGES_DEFAULT_HEIGHT,
  CHANGES_MIN_HEIGHT,
  clampChangesHeight
} from '../src/workspace/sidebar.ts';

assert.equal(clampChangesHeight(CHANGES_DEFAULT_HEIGHT), CHANGES_DEFAULT_HEIGHT);
assert.equal(clampChangesHeight(10), CHANGES_MIN_HEIGHT);
assert.equal(clampChangesHeight(900, 300), 300);
assert.equal(clampChangesHeight(Number.NaN), CHANGES_DEFAULT_HEIGHT);

const sample: PostmanEnvironment = {
  id: 'env-1',
  name: 'Local',
  values: [
    { key: 'baseUrl', value: 'https://example.com', enabled: true, type: 'default' },
    { key: 'token', value: 'secret', enabled: false, type: 'secret' }
  ],
  _postman_variable_scope: 'environment'
};

assert.equal(isPostmanEnvironment(sample), true);
assert.equal(isPostmanEnvironment({ name: 'no values' }), false);
assert.equal(isPostmanEnvironment(null), false);

const parsed = assertPostmanEnvironment(JSON.parse(JSON.stringify(sample)));
assert.equal(parsed.name, 'Local');
assert.equal(parsed.values?.length, 2);
assert.equal((parsed as Record<string, unknown>)._postman_variable_scope, 'environment');

const originalRaw = JSON.stringify(sample);
assert.equal(isEnvironmentDirty(sample, originalRaw), false);

let edited = renameEnvironment(sample, 'Staging');
assert.equal(isEnvironmentDirty(edited, originalRaw), true);
edited = renameEnvironment(edited, 'Local');
assert.equal(isEnvironmentDirty(edited, originalRaw), false, 'renaming back clears dirty');

edited = setEnvironmentValues(
  sample,
  updateEnvironmentValue(sample.values ?? [], 0, { value: 'https://staging.example.com' })
);
assert.equal(isEnvironmentDirty(edited, originalRaw), true);
edited = setEnvironmentValues(
  edited,
  updateEnvironmentValue(edited.values ?? [], 0, { value: 'https://example.com' })
);
assert.equal(isEnvironmentDirty(edited, originalRaw), false);

edited = setEnvironmentValues(
  sample,
  setEnvironmentValueEnabled(sample.values ?? [], 1, true)
);
assert.equal(isEnvironmentDirty(edited, originalRaw), true);

edited = setEnvironmentValues(sample, addEnvironmentValue(sample.values ?? []));
assert.equal((edited.values ?? []).length, 3);
edited = setEnvironmentValues(
  edited,
  removeEnvironmentValue(edited.values ?? [], 2)
);
assert.ok(environmentsEqual(edited, sample));

const serialized = serializeEnvironment(sample);
assert.ok(serialized.endsWith('\n'));
assert.equal(serialized, `${JSON.stringify(sample, null, 2)}\n`);
assert.equal(
  serializeEnvironment(sample, { trailingNewline: false }),
  JSON.stringify(sample, null, 2)
);

// Environment tab keys encode paths portably.
const envPath = '/Users/dev/my env/a:b/local.postman_environment.json';
const envTab = { kind: 'environment' as const, environmentPath: envPath };
assert.deepEqual(parseTabKey(tabKey(envTab)), envTab);
assert.deepEqual(fromSessionTab(toSessionTab(envTab)), envTab);

// Session v3 → v4 migration
const home = mkdtempSync(path.join(tmpdir(), 'clara-stage11-'));
const previousHome = process.env.HOME;
process.env.HOME = home;
try {
  mkdirSync(path.join(home, '.clara'), { recursive: true });
  const collectionPath = '/repo/api.postman_collection.json';
  writeFileSync(
    path.join(home, '.clara', 'session.json'),
    JSON.stringify({
      version: 3,
      collections: [
        { path: collectionPath, expandedPaths: ['0'], collectionExpanded: true }
      ],
      openTabs: [
        { kind: 'collection', collectionPath },
        { kind: 'environment', environmentPath: envPath }
      ],
      activeTabKey: tabKey(envTab)
    }),
    'utf8'
  );

  const session = await import('../electron/session.ts');
  const migrated = await session.loadSession();
  assert.equal(migrated.version, 4);
  assert.equal(migrated.collections.length, 1);
  assert.equal(migrated.collections[0]?.path, collectionPath);
  assert.deepEqual(migrated.openedEnvironments, []);
  assert.equal(migrated.activeEnvironmentPath, null);
  assert.equal(migrated.sidebar.collectionsExpanded, true);
  assert.equal(migrated.sidebar.environmentsExpanded, true);
  assert.equal(migrated.sidebar.changesExpanded, true);
  assert.equal(migrated.sidebar.width, 270);
  assert.equal(migrated.sidebar.followActiveTab, false);
  assert.equal(migrated.sidebar.changedOnly, false);
  assert.equal(migrated.openTabs.length, 2);
  assert.equal(migrated.openTabs[1]?.kind, 'environment');

  const saved = await session.saveSession({
    version: 4,
    collections: migrated.collections,
    openTabs: migrated.openTabs,
    activeTabKey: migrated.activeTabKey,
    openedEnvironments: [envPath],
    activeEnvironmentPath: envPath,
    sidebar: {
      collectionsExpanded: false,
      environmentsExpanded: true,
      changesExpanded: false,
      width: 360,
      followActiveTab: true,
      changedOnly: true
    },
    compareBases: {}
  });
  assert.equal(saved.version, 4);
  assert.equal(saved.sidebar.width, 360);
  assert.equal(saved.sidebar.changesExpanded, false);
  assert.equal(saved.sidebar.followActiveTab, false);
  assert.equal(saved.sidebar.changedOnly, false);
  assert.deepEqual(saved.compareBases, {});
  assert.equal(saved.activeEnvironmentPath, envPath);

  // Stale true flags in session.json must not survive load.
  writeFileSync(
    path.join(home, '.clara', 'session.json'),
    JSON.stringify({
      ...saved,
      sidebar: {
        ...saved.sidebar,
        followActiveTab: true,
        changedOnly: true
      }
    }),
    'utf8'
  );
  const reloadedFilters = await session.loadSession();
  assert.equal(reloadedFilters.sidebar.followActiveTab, false);
  assert.equal(reloadedFilters.sidebar.changedOnly, false);
  assert.equal(reloadedFilters.sidebar.width, 360);

  const withBase = await session.saveSession({
    ...saved,
    compareBases: { '/repo': 'main' }
  });
  assert.equal(withBase.compareBases['/repo'], 'main');
  const reloadedBase = await session.loadSession();
  assert.equal(reloadedBase.compareBases['/repo'], 'main');

  const reloaded = await session.loadSession();
  assert.deepEqual(reloaded, withBase);

  // Width is clamped on save/load.
  const clamped = await session.saveSession({
    ...saved,
    sidebar: { ...saved.sidebar, width: 9999 }
  });
  assert.equal(clamped.sidebar.width, 520);
} finally {
  if (previousHome == null) {
    delete process.env.HOME;
  } else {
    process.env.HOME = previousHome;
  }
  rmSync(home, { recursive: true, force: true });
}

console.log('stage11 checks passed');
