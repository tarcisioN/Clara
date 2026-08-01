import assert from 'node:assert/strict';
import { flattenStructuralChanges, changeListCounts } from '../src/git/changeList.ts';
import { computeStructuralDiff } from '../src/git/structuralDiff.ts';
import type { PostmanCollection } from '../src/postman/types.ts';

const base: PostmanCollection = {
  info: {
    name: 'Base',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
  },
  item: [
    {
      name: 'Folder A',
      item: [
        {
          name: 'Keep',
          request: { method: 'GET', url: 'https://example.com/keep' }
        },
        {
          name: 'Edit Me',
          request: { method: 'GET', url: 'https://example.com/old' }
        },
        {
          name: 'Remove Me',
          request: { method: 'DELETE', url: 'https://example.com/gone' }
        }
      ]
    },
    {
      name: 'Root Ping',
      request: { method: 'GET', url: 'https://example.com/ping' }
    }
  ]
};

const current: PostmanCollection = {
  info: {
    name: 'Current',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
  },
  item: [
    {
      name: 'Folder A',
      item: [
        {
          name: 'Keep',
          request: { method: 'GET', url: 'https://example.com/keep' }
        },
        {
          name: 'Edit Me',
          request: { method: 'POST', url: 'https://example.com/new' }
        },
        {
          name: 'Added',
          request: { method: 'PUT', url: 'https://example.com/added' }
        }
      ]
    },
    {
      name: 'Root Ping',
      request: { method: 'GET', url: 'https://example.com/ping' }
    }
  ]
};

const diff = computeStructuralDiff(current, base);
const entries = flattenStructuralChanges(current, diff);

assert.deepEqual(
  entries.map((entry) => `${entry.changeKind}:${entry.name}`),
  ['modified:Edit Me', 'added:Added', 'removed:Remove Me']
);

const counts = changeListCounts(entries);
assert.equal(counts.added, 1);
assert.equal(counts.modified, 1);
assert.equal(counts.removed, 1);
assert.equal(counts.moved, 0);

// Reorder-only siblings appear as moved with from/to indices.
const baseOrder: PostmanCollection = {
  info: { name: 'O', schema: base.info.schema },
  item: [
    { name: 'A', request: { method: 'GET', url: 'https://example.com/a' } },
    { name: 'B', request: { method: 'GET', url: 'https://example.com/b' } }
  ]
};
const currentOrder: PostmanCollection = {
  info: baseOrder.info,
  item: [
    { name: 'B', request: { method: 'GET', url: 'https://example.com/b' } },
    { name: 'A', request: { method: 'GET', url: 'https://example.com/a' } }
  ]
};
const orderDiff = computeStructuralDiff(currentOrder, baseOrder);
const orderEntries = flattenStructuralChanges(currentOrder, orderDiff);
assert.deepEqual(
  orderEntries.map((entry) =>
    entry.type === 'current' && entry.changeKind === 'moved'
      ? `${entry.name}:${entry.fromIndex}→${entry.toIndex}`
      : `${entry.changeKind}:${entry.name}`
  ),
  ['B:1→0', 'A:0→1']
);
assert.equal(changeListCounts(orderEntries).moved, 2);

console.log('stage15 checks passed');
