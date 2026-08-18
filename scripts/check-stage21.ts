import assert from 'node:assert/strict';
import {
  deleteFromSavedCollection,
  resolveSavedPath,
  writeCollectionMetaToSaved,
  writeItemToSavedCollection
} from '../src/workspace/savedTree.ts';
import type { PostmanCollection, PostmanItem } from '../src/postman/types.ts';

const request = (name: string, extra?: Partial<PostmanItem>): PostmanItem => ({
  name,
  request: { method: 'GET', url: `https://example.com/${name}` },
  ...extra
});

const saved: PostmanCollection = {
  info: { name: 'Col' },
  variable: [{ key: 'base', value: '1' }],
  item: [
    { name: 'Folder', item: [request('a'), request('b')] },
    request('root')
  ]
};

const clone = (value: PostmanCollection): PostmanCollection =>
  JSON.parse(JSON.stringify(value)) as PostmanCollection;

// No pending edits: paths line up one to one.
assert.equal(resolveSavedPath(saved.item, saved.item, '0.1'), '0.1');
assert.equal(resolveSavedPath(saved.item, saved.item, '1'), '1');

// A pending insert before the target must not shift the saved path.
const withInsert = clone(saved);
withInsert.item![0]!.item!.unshift(request('new'));
assert.equal(resolveSavedPath(withInsert.item, saved.item, '0.2'), '0.1');
assert.equal(
  resolveSavedPath(withInsert.item, saved.item, '0.0'),
  null,
  'an item that is not on disk yet has no saved path'
);

// A pending reorder still matches by kind+name.
const withReorder = clone(saved);
withReorder.item![0]!.item!.reverse();
assert.equal(resolveSavedPath(withReorder.item, saved.item, '0.0'), '0.1');

// Deleting writes only the removal; unrelated pending edits stay in memory.
const working = clone(saved);
working.item![1]!.name = 'root renamed';
const nextSaved = deleteFromSavedCollection(working, saved, '0.1');
assert.ok(nextSaved);
assert.deepEqual(
  nextSaved!.item![0]!.item!.map((entry) => entry.name),
  ['a'],
  'the deleted request is gone from the file'
);
assert.equal(
  nextSaved!.item![1]!.name,
  'root',
  'the pending rename is not flushed to the file'
);
assert.deepEqual(
  saved.item![0]!.item!.map((entry) => entry.name),
  ['a', 'b'],
  'the saved tree is not mutated'
);

// Deleting something that was never saved leaves the file alone.
const added = clone(saved);
added.item!.push(request('brand new'));
assert.equal(deleteFromSavedCollection(added, saved, '2'), null);

// Deleting a folder removes its subtree from the file.
const withoutFolder = deleteFromSavedCollection(saved, saved, '0');
assert.deepEqual(
  withoutFolder!.item!.map((entry) => entry.name),
  ['root']
);

// ⌘S on one request writes only that request; sibling edits stay pending.
const dualEdit = clone(saved);
dualEdit.item![0]!.item![0] = request('a', {
  request: { method: 'POST', url: 'https://example.com/a-edited' }
});
dualEdit.item![1] = request('root', {
  request: { method: 'PUT', url: 'https://example.com/root-edited' }
});
const savedOnlyA = writeItemToSavedCollection(dualEdit, saved, '0.0');
assert.ok(savedOnlyA);
assert.equal(
  (savedOnlyA!.item![0]!.item![0]!.request as { method?: string }).method,
  'POST',
  'the active request is written'
);
assert.equal(
  (savedOnlyA!.item![1]!.request as { method?: string }).method,
  'GET',
  'the other dirty request is not flushed'
);

// New request inserts under the paired parent without flushing siblings.
const withNew = clone(saved);
withNew.item![0]!.item!.push(request('c'));
withNew.item![1] = request('root', {
  request: { method: 'DELETE', url: 'https://example.com/root-dirty' }
});
const savedWithC = writeItemToSavedCollection(withNew, saved, '0.2');
assert.ok(savedWithC);
assert.deepEqual(
  savedWithC!.item![0]!.item!.map((entry) => entry.name),
  ['a', 'b', 'c']
);
assert.equal(
  (savedWithC!.item![1]!.request as { method?: string }).method,
  'GET',
  'sibling dirtiness stays out of the file'
);

// Folder save updates meta only; nested request dirtiness stays pending.
const folderEdit = clone(saved);
folderEdit.item![0] = {
  name: 'Folder',
  variable: [{ key: 'f', value: '9' }],
  item: [request('a-dirty'), request('b')]
};
const savedFolder = writeItemToSavedCollection(folderEdit, saved, '0');
assert.ok(savedFolder);
assert.deepEqual(savedFolder!.item![0]!.variable, [{ key: 'f', value: '9' }]);
assert.equal(savedFolder!.item![0]!.item![0]!.name, 'a');

// Collection tab save writes variables without flushing request edits.
const metaEdit = clone(saved);
metaEdit.variable = [{ key: 'base', value: '2' }];
metaEdit.item![1] = request('root', {
  request: { method: 'PATCH', url: 'https://example.com/root' }
});
const savedMeta = writeCollectionMetaToSaved(metaEdit, saved);
assert.deepEqual(savedMeta.variable, [{ key: 'base', value: '2' }]);
assert.equal((savedMeta.item![1]!.request as { method?: string }).method, 'GET');

console.log('saved-tree delete checks passed');
