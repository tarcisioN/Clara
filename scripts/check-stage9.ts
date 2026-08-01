import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSingleRequestCollection,
  resolveInheritedVariables
} from '../src/newman/buildRunCollection.ts';
import {
  getCollectionVariables,
  getItemVariables,
  setCollectionVariables,
  setItemVariables,
  setRequestMethod,
  updateCollectionItem
} from '../src/postman/edit.ts';
import {
  createRequestItem,
  deleteItem,
  duplicateItem,
  insertItem,
  moveItem,
  remapPathAfterDelete,
  remapPathAfterDuplicate,
  remapPathAfterInsert,
  renameItem
} from '../src/postman/structure.ts';
import { getItemByPath } from '../src/postman/tree.ts';
import { assertPostmanCollection } from '../src/postman/types.ts';
import {
  addVariable,
  removeVariable,
  setVariableDisabled,
  updateVariable
} from '../src/postman/variables.ts';
import { computeDirtyState } from '../src/workspace/dirty.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, '../fixtures/smoke.postman_collection.json');
const collection = assertPostmanCollection(JSON.parse(readFileSync(fixturePath, 'utf8')));

// Collection / folder variables on fixture
const collectionVars = getCollectionVariables(collection);
assert.equal(collectionVars.length, 2);
assert.equal(collectionVars[0]?.key, 'baseUrl');

const health = getItemByPath(collection.item, '0')!;
assert.equal(getItemVariables(health).length, 2);
assert.equal(getItemVariables(health)[0]?.key, 'healthToken');

// CRUD helpers
let vars = addVariable([]);
assert.equal(vars.length, 1);
vars = updateVariable(vars, 0, { key: 'k', value: 'v' });
assert.deepEqual(vars[0], { key: 'k', value: 'v', type: 'string' });
vars = setVariableDisabled(vars, 0, true);
assert.equal(vars[0]?.disabled, true);
vars = setVariableDisabled(vars, 0, false);
assert.equal(vars[0]?.disabled, undefined);
vars = removeVariable(vars, 0);
assert.equal(vars.length, 0);

const withCollectionVar = setCollectionVariables(collection, [
  { key: 'x', value: '1', type: 'string' }
]);
assert.equal(getCollectionVariables(withCollectionVar)[0]?.key, 'x');

const withFolderVar = {
  ...collection,
  item: collection.item!.map((item, index) =>
    index === 0 ? setItemVariables(item, [{ key: 'f', value: '2', type: 'string' }]) : item
  )
};
assert.equal(getItemVariables(withFolderVar.item![0]!)[0]?.key, 'f');

// Inherited variables for single-request run: folder overwrites collection by key
const inherited = resolveInheritedVariables(collection, '0.0');
const byKey = Object.fromEntries(inherited.map((entry) => [entry.key, entry.value]));
assert.equal(byKey.baseUrl, 'https://example.com');
assert.equal(byKey.healthToken, 'folder-health');
assert.equal(byKey.env, 'health-folder');

const pingRun = buildSingleRequestCollection(collection, '0.0');
assert.ok(Array.isArray(pingRun.variable));
assert.equal(
  pingRun.variable?.find((entry) => entry.key === 'env')?.value,
  'health-folder'
);

// Structure: rename / duplicate / delete + path remap
const renamed = renameItem(collection, '0.0', 'Ping renamed');
assert.equal(getItemByPath(renamed.item, '0.0')?.name, 'Ping renamed');

const duplicated = duplicateItem(collection, '0');
assert.equal(duplicated.newPath, '1');
assert.equal(getItemByPath(duplicated.collection.item, '1')?.name, 'Health Copy');
// Root echo was at "1", now at "2"
assert.equal(remapPathAfterDuplicate('1', '0', '1'), '2');
assert.equal(remapPathAfterDuplicate('0', '0', '1'), '0');
assert.equal(remapPathAfterDuplicate('0.0', '0', '1'), '0.0');

const deleted = deleteItem(collection, '0');
assert.equal(deleted.item?.length, 2);
assert.equal(deleted.item?.[0]?.name, 'Root echo');
assert.equal(remapPathAfterDelete('0.0', '0'), null);
assert.equal(remapPathAfterDelete('1', '0'), '0');
assert.equal(remapPathAfterDelete('2', '0'), '1');

const inserted = insertItem(collection, null, createRequestItem('Fresh'), '1');
assert.equal(inserted.newPath, '2');
assert.equal(getItemByPath(inserted.collection.item, '2')?.name, 'Fresh');
assert.equal(getItemByPath(inserted.collection.item, '1')?.name, 'Root echo');

const underFolder = insertItem(collection, '0', createRequestItem('Nested'));
assert.equal(underFolder.newPath, '0.1');
assert.equal(getItemByPath(underFolder.collection.item, '0.1')?.name, 'Nested');

const insertedAt = insertItem(collection, null, createRequestItem('First'), undefined, 0);
assert.equal(insertedAt.newPath, '0');
assert.equal(getItemByPath(insertedAt.collection.item, '0')?.name, 'First');
assert.equal(getItemByPath(insertedAt.collection.item, '1')?.name, 'Health');

// moveItem: reorder at root and nest under a folder
const movedDown = moveItem(collection, '1', { relation: 'after', path: '2' });
assert.equal(getItemByPath(movedDown.collection.item, '2')?.name, 'Root echo');
assert.equal(movedDown.newPath, '2');
assert.equal(getItemByPath(movedDown.collection.item, '1')?.name, 'Form login');

const movedUp = moveItem(collection, '2', { relation: 'before', path: '0' });
assert.equal(getItemByPath(movedUp.collection.item, '0')?.name, 'Form login');
assert.equal(movedUp.newPath, '0');
assert.equal(getItemByPath(movedUp.collection.item, '1')?.name, 'Health');

const nestedMove = moveItem(collection, '1', { relation: 'into', path: '0' });
assert.equal(nestedMove.newPath, '0.1');
assert.equal(getItemByPath(nestedMove.collection.item, '0.1')?.name, 'Root echo');
assert.equal((getItemByPath(nestedMove.collection.item, '0')?.item ?? []).length, 2);

const noop = moveItem(collection, '1', { relation: 'before', path: '1' });
assert.equal(noop.newPath, '1');
assert.equal(noop.collection, collection);

assert.equal(remapPathAfterInsert('1', '0'), '2');
assert.equal(remapPathAfterInsert('0', '0'), '1');
assert.equal(remapPathAfterInsert('0.0', '0'), '1.0');
assert.equal(remapPathAfterInsert('0.0', '0.1'), '0.0');

assert.throws(
  () => moveItem(collection, '0', { relation: 'into', path: '0' }),
  /itself or a descendant/
);

// Dirty clears when edits are reverted to the baseline
const clean = computeDirtyState(collection, collection);
assert.equal(clean.dirtyPaths.size, 0);
assert.equal(clean.structureDirty, false);

const methodChanged = updateCollectionItem(collection, '1', (item) =>
  setRequestMethod(item, 'PUT')
);
const dirtyAfterEdit = computeDirtyState(methodChanged, collection);
assert.equal(dirtyAfterEdit.dirtyPaths.has('1'), true);
assert.equal(dirtyAfterEdit.structureDirty, false);

const methodReverted = updateCollectionItem(methodChanged, '1', (item) =>
  setRequestMethod(item, 'POST')
);
const dirtyAfterUndo = computeDirtyState(methodReverted, collection);
assert.equal(dirtyAfterUndo.dirtyPaths.size, 0);
assert.equal(dirtyAfterUndo.structureDirty, false);

const varsChanged = setCollectionVariables(collection, [
  ...getCollectionVariables(collection),
  { key: 'temp', value: '1', type: 'string' }
]);
assert.equal(computeDirtyState(varsChanged, collection).collectionDirty, true);
assert.equal(
  computeDirtyState(setCollectionVariables(varsChanged, getCollectionVariables(collection)), collection)
    .collectionDirty,
  false
);

console.log('check-stage9: ok');
