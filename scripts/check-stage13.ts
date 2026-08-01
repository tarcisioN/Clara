import assert from 'node:assert/strict';
import {
  collectChangedFolderPaths,
  computeStructuralDiff,
  pathVisibleWhenChangedOnly,
  removedUnderParent
} from '../src/git/structuralDiff.ts';
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

assert.equal(diff.statusByPath.get('0.0'), 'unchanged'); // Keep
assert.equal(diff.statusByPath.get('0.1'), 'modified'); // Edit Me
assert.equal(diff.statusByPath.get('0.2'), 'added'); // Added
assert.equal(diff.statusByPath.get('1'), 'unchanged'); // Root Ping
assert.equal(diff.statusByPath.get('0'), 'unchanged'); // Folder A: nested-only, meta intact

assert.equal(diff.added, 1);
assert.equal(diff.removedCount, 1);
assert.equal(diff.modified, 1); // Edit Me only
assert.equal(diff.changedCount, 3);

const removedInFolder = removedUnderParent(diff.removed, '0');
assert.equal(removedInFolder.length, 1);
assert.equal(removedInFolder[0].name, 'Remove Me');
assert.equal(removedInFolder[0].kind, 'request');

assert.ok((diff.descendantChangeCount.get('0') ?? 0) >= 3);

// Changed only: hide Keep and Root Ping; keep Folder A and changed children.
assert.equal(
  pathVisibleWhenChangedOnly('0.0', diff.statusByPath, diff.descendantChangeCount),
  false
);
assert.equal(
  pathVisibleWhenChangedOnly('0.1', diff.statusByPath, diff.descendantChangeCount),
  true
);
assert.equal(
  pathVisibleWhenChangedOnly('0', diff.statusByPath, diff.descendantChangeCount),
  true
);
assert.equal(
  pathVisibleWhenChangedOnly('1', diff.statusByPath, diff.descendantChangeCount),
  false
);

const expand = collectChangedFolderPaths(
  current.item,
  diff.statusByPath,
  diff.descendantChangeCount
);
assert.ok(expand.has('0'));

// Folder whose own meta changes (variables) is modified even without child edits.
const baseMeta: PostmanCollection = {
  info: base.info,
  item: [
    {
      name: 'Vars',
      variable: [{ key: 'a', value: '1' }],
      item: [{ name: 'Ping', request: { method: 'GET', url: 'https://example.com' } }]
    }
  ]
};
const currentMeta: PostmanCollection = {
  info: base.info,
  item: [
    {
      name: 'Vars',
      variable: [{ key: 'a', value: '2' }],
      item: [{ name: 'Ping', request: { method: 'GET', url: 'https://example.com' } }]
    }
  ]
};
const metaDiff = computeStructuralDiff(currentMeta, baseMeta);
assert.equal(metaDiff.statusByPath.get('0'), 'modified');
assert.equal(metaDiff.statusByPath.get('0.0'), 'unchanged');
assert.equal(metaDiff.modified, 1);

// Sibling reorder with identical content → moved (not modified).
const baseOrder: PostmanCollection = {
  info: base.info,
  item: [
    { name: 'A', request: { method: 'GET', url: 'https://example.com/a' } },
    { name: 'B', request: { method: 'GET', url: 'https://example.com/b' } },
    { name: 'C', request: { method: 'GET', url: 'https://example.com/c' } }
  ]
};
const currentOrder: PostmanCollection = {
  info: base.info,
  item: [
    { name: 'C', request: { method: 'GET', url: 'https://example.com/c' } },
    { name: 'A', request: { method: 'GET', url: 'https://example.com/a' } },
    { name: 'B', request: { method: 'GET', url: 'https://example.com/b' } }
  ]
};
const orderDiff = computeStructuralDiff(currentOrder, baseOrder);
assert.equal(orderDiff.statusByPath.get('0'), 'moved'); // C was 2
assert.equal(orderDiff.statusByPath.get('1'), 'moved'); // A was 0
assert.equal(orderDiff.statusByPath.get('2'), 'moved'); // B was 1
assert.equal(orderDiff.movedFromIndex.get('0'), 2);
assert.equal(orderDiff.movedFromIndex.get('1'), 0);
assert.equal(orderDiff.movedFromIndex.get('2'), 1);
assert.equal(orderDiff.moved, 3);
assert.equal(orderDiff.modified, 0);
assert.equal(orderDiff.changedCount, 3);

console.log('stage13 checks passed');
