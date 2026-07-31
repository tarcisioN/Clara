import assert from 'node:assert/strict';
import { computeSemanticDiff } from '../src/git/semanticDiff.ts';
import {
  findPairedBaseItem,
  resolveBaseRequestItem
} from '../src/git/resolveBaseItem.ts';
import { computeStructuralDiff } from '../src/git/structuralDiff.ts';
import { updateRequestHeader } from '../src/postman/edit.ts';
import type { PostmanCollection, PostmanItem } from '../src/postman/types.ts';

const baseRequest: PostmanItem = {
  name: 'Ping',
  request: {
    method: 'GET',
    url: {
      raw: 'https://example.com/ping',
      host: ['example', 'com'],
      path: ['ping']
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
  item: [
    {
      name: 'Folder',
      item: [baseRequest]
    }
  ]
};

const headerOnly = structuredClone(base) as PostmanCollection;
const folder = headerOnly.item![0];
folder.item![0] = updateRequestHeader(folder.item![0], 0, {
  key: 'X-Trace',
  value: 'changed'
});

const headerDiff = computeSemanticDiff(folder.item![0], baseRequest);
assert.equal(headerDiff.active, true);
assert.equal(headerDiff.isAdded, false);
assert.equal(headerDiff.sections.headers, true);
assert.equal(headerDiff.sections.body, false);
assert.equal(headerDiff.sections.method, false);
assert.equal(headerDiff.sections.url, false);
assert.equal(headerDiff.sections.params, false);

const addedCurrent: PostmanCollection = {
  info: base.info,
  item: [
    {
      name: 'Folder',
      item: [
        baseRequest,
        {
          name: 'Brand New',
          request: { method: 'POST', url: 'https://example.com/new' }
        }
      ]
    }
  ]
};

const structural = computeStructuralDiff(addedCurrent, base);
assert.equal(structural.statusByPath.get('0.1'), 'added');

const resolution = resolveBaseRequestItem(
  structural,
  addedCurrent,
  base,
  '0.1'
);
assert.equal(resolution.kind, 'added');

const addedDiff = computeSemanticDiff(addedCurrent.item![0].item![1], null);
assert.equal(addedDiff.isAdded, true);
assert.equal(addedDiff.hasChanges, true);
assert.equal(addedDiff.sections.headers, false);

// Reorder: same path index would point at wrong base without pairing.
const reorderedCurrent: PostmanCollection = {
  info: base.info,
  item: [
    {
      name: 'Folder',
      item: [
        {
          name: 'Other',
          request: { method: 'GET', url: 'https://example.com/other' }
        },
        {
          name: 'Ping',
          request: {
            method: 'POST',
            url: {
              raw: 'https://example.com/ping',
              host: ['example', 'com'],
              path: ['ping']
            },
            header: [{ key: 'X-Trace', value: '1' }],
            body: { mode: 'raw', raw: '{"ok":true}' }
          }
        }
      ]
    }
  ]
};

const paired = findPairedBaseItem(reorderedCurrent.item, base.item, '0.1');
assert.ok(paired);
assert.equal(paired?.name, 'Ping');
const reorderDiff = computeSemanticDiff(reorderedCurrent.item![0].item![1], paired!);
assert.equal(reorderDiff.sections.method, true);
assert.equal(reorderDiff.sections.body, false);
assert.equal(reorderDiff.sections.headers, false);

console.log('stage14 checks passed');
