import assert from 'node:assert/strict';
import {
  computeEnvironmentDiff,
  restoreAllEnvironmentValuesFromBase,
  restoreEnvironmentValueFromBase
} from '../src/git/environmentDiff.ts';
import { computeKeyedDiff } from '../src/git/keyedDiff.ts';
import {
  restoreItemFromBase,
  restoreRequestSectionFromBase
} from '../src/git/restoreFromBase.ts';
import { computeSemanticDiff } from '../src/git/semanticDiff.ts';
import { computeStructuralDiff } from '../src/git/structuralDiff.ts';
import { computeVariableDiff } from '../src/git/variableDiff.ts';
import type { PostmanCollection, PostmanItem } from '../src/postman/types.ts';
import type { PostmanEnvironment } from '../src/postman/environment.ts';

const baseRequest: PostmanItem = {
  name: 'Ping',
  request: {
    method: 'GET',
    url: {
      raw: 'https://example.com/ping',
      host: ['example', 'com'],
      path: ['ping'],
      query: [{ key: 'q', value: '1' }]
    },
    header: [{ key: 'X-Trace', value: '1' }],
    body: { mode: 'raw', raw: '{"ok":true}' }
  }
};

const base: PostmanCollection = {
  info: {
    name: 'Base',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
  },
  variable: [{ key: 'host', value: 'example.com' }],
  item: [
    {
      name: 'Folder',
      variable: [{ key: 'scope', value: 'folder' }],
      item: [structuredClone(baseRequest)]
    }
  ]
};

const edited = structuredClone(base) as PostmanCollection;
const request = edited.item![0]!.item![0]!;
if (typeof request.request === 'string' || !request.request) {
  throw new Error('expected request object');
}
request.request.method = 'POST';
request.request.header = [{ key: 'X-Trace', value: 'changed' }];
edited.variable = [{ key: 'host', value: 'api.example.com' }];
edited.item![0]!.variable = [{ key: 'scope', value: 'folder-edited' }];

// Restore whole request → semantic equality with base; collection remains structurally dirty via vars.
const restoredCollection = restoreItemFromBase(edited, '0.0', base);
const restoredReq = restoredCollection.item![0]!.item![0]!;
const afterRestore = computeSemanticDiff(restoredReq, baseRequest);
assert.equal(afterRestore.hasChanges, false);
assert.equal(afterRestore.isAdded, false);

const stillDirty = computeStructuralDiff(restoredCollection, base);
assert.equal(stillDirty.collectionVariablesChanged, true);
assert.ok(stillDirty.changedCount >= 1);

// Section restore: headers only
const headerOnly = structuredClone(edited) as PostmanCollection;
const sectionRestored = restoreRequestSectionFromBase(
  headerOnly.item![0]!.item![0]!,
  baseRequest,
  'headers'
);
const sectionDiff = computeSemanticDiff(sectionRestored, baseRequest);
assert.equal(sectionDiff.sections.headers, false);
assert.equal(sectionDiff.sections.method, true);

// Keyed env: value-only change → modified, not removed+added
const baseEnv: PostmanEnvironment = {
  name: 'Local',
  values: [
    { key: 'token', value: 'old', enabled: true },
    { key: 'baseUrl', value: 'https://example.com', enabled: true }
  ]
};
const currentEnv: PostmanEnvironment = {
  name: 'Local',
  values: [
    { key: 'token', value: 'new', enabled: true },
    { key: 'baseUrl', value: 'https://example.com', enabled: true },
    { key: 'extra', value: '1', enabled: true }
  ]
};
const envDiff = computeEnvironmentDiff(currentEnv, baseEnv);
assert.equal(envDiff.byCurrentIndex.get(0), 'modified');
assert.equal(envDiff.byCurrentIndex.get(1), 'unchanged');
assert.equal(envDiff.byCurrentIndex.get(2), 'added');
assert.equal(envDiff.removed.length, 0);
assert.equal(envDiff.modified, 1);
assert.equal(envDiff.added, 1);

const restoredToken = restoreEnvironmentValueFromBase(currentEnv, baseEnv, 'token');
assert.equal(restoredToken.values?.[0]?.value, 'old');
const restoredAll = restoreAllEnvironmentValuesFromBase(currentEnv, baseEnv);
assert.equal(restoredAll.values?.length, 2);
assert.equal(restoredAll.values?.[0]?.value, 'old');

// Variable keyed diff (collection / folder)
const varDiff = computeVariableDiff(edited.variable, base.variable);
assert.equal(varDiff.byCurrentIndex.get(0), 'modified');
assert.equal(varDiff.added, 0);
assert.equal(varDiff.removedCount, 0);

const folderVarDiff = computeVariableDiff(
  edited.item![0]!.variable,
  base.item![0]!.variable
);
assert.equal(folderVarDiff.byCurrentIndex.get(0), 'modified');

// Duplicate-key encounter order + empty key handling in keyedDiff
const keyed = computeKeyedDiff(
  [
    { key: 'a', fingerprint: '1' },
    { key: 'a', fingerprint: '2' }
  ],
  [
    { key: 'a', fingerprint: '1' },
    { key: 'a', fingerprint: 'x' }
  ]
);
assert.equal(keyed.byCurrentIndex.get(0), 'unchanged');
assert.equal(keyed.byCurrentIndex.get(1), 'modified');

console.log('check-stage17: ok');
