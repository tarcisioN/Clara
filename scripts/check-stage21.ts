import assert from 'node:assert/strict';
import {
  deleteFromSavedCollection,
  resolveSavedPath
} from '../src/workspace/savedTree.ts';
import type { PostmanCollection, PostmanItem } from '../src/postman/types.ts';

const request = (name: string): PostmanItem => ({
  name,
  request: { method: 'GET', url: `https://example.com/${name}` }
});

const saved: PostmanCollection = {
  info: { name: 'Col' },
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

console.log('saved-tree delete checks passed');
