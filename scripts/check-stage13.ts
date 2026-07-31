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
assert.equal(diff.statusByPath.get('0'), 'modified'); // Folder A has nested changes

assert.equal(diff.added, 1);
assert.equal(diff.removedCount, 1);
assert.equal(diff.modified, 1); // Edit Me only (folder nested-only does not bump modified counter twice)
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

console.log('stage13 checks passed');
