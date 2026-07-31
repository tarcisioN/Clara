import assert from 'node:assert/strict';
import { computeKeyedValueDiff } from '../src/git/keyedValueDiff.ts';
import { computeRequestFieldDiff } from '../src/git/requestFieldDiff.ts';
import { findRemovedBaseItem } from '../src/git/resolveBaseItem.ts';
import { computeStructuralDiff } from '../src/git/structuralDiff.ts';
import { diffLines, hasTextChanges, highlightPair, diffChars } from '../src/git/textDiff.ts';
import { updateRequestHeader, setRequestUrl, setRequestBodyRaw } from '../src/postman/edit.ts';
import type { PostmanCollection, PostmanItem } from '../src/postman/types.ts';

// --- keyedValueDiff (shared by request / env / variables Diff) ---
const keyed = computeKeyedValueDiff(
  [
    { key: 'keep', value: '1', disabled: false },
    { key: 'changed', value: 'new', disabled: false },
    { key: 'added', value: 'x', disabled: false }
  ],
  [
    { key: 'keep', value: '1', disabled: false },
    { key: 'changed', value: 'old', disabled: false },
    { key: 'gone', value: 'z', disabled: true }
  ]
);
assert.equal(keyed.hasChanges, true);
assert.deepEqual(
  keyed.rows.map((row) => `${row.change}:${row.key}`),
  ['unchanged:keep', 'modified:changed', 'added:added', 'removed:gone']
);
assert.equal(
  computeKeyedValueDiff(
    [{ key: 'a', value: '1', disabled: false }],
    [{ key: 'a', value: '1', disabled: false }]
  ).hasChanges,
  false
);

// --- textDiff ---
const empty = diffLines('', '');
assert.equal(empty.length, 0);

const identical = diffLines('a\nb\n', 'a\nb\n');
assert.equal(identical.every((line) => line.kind === 'equal'), true);
assert.equal(hasTextChanges(identical), false);

const changed = diffLines('hello\nworld\n', 'hello\nclara\n');
assert.equal(changed.filter((line) => line.kind === 'delete').length, 1);
assert.equal(changed.filter((line) => line.kind === 'insert').length, 1);
assert.ok(changed.some((line) => line.kind === 'equal' && line.text === 'hello'));
assert.equal(hasTextChanges(changed), true);

const addedOnly = diffLines('', 'new line');
assert.deepEqual(
  addedOnly.map((line) => line.kind),
  ['insert']
);

const removedOnly = diffLines('gone', '');
assert.deepEqual(
  removedOnly.map((line) => line.kind),
  ['delete']
);

// Char-level highlight
const pair = highlightPair('https://example.com/ping', 'https://example.com/pingx');
assert.ok(pair.base.some((segment) => segment.kind === 'equal'));
assert.ok(pair.current.some((segment) => segment.kind === 'insert'));
assert.equal(
  pair.base.filter((segment) => segment.kind === 'delete').map((segment) => segment.text).join(''),
  ''
);
assert.equal(
  pair.current.filter((segment) => segment.kind === 'insert').map((segment) => segment.text).join(''),
  'x'
);

const chars = diffChars('abc', 'axc');
assert.deepEqual(
  chars.map((segment) => `${segment.kind}:${segment.text}`),
  ['equal:a', 'delete:b', 'insert:x', 'equal:c']
);

// Line diff attaches char segments on paired delete/insert
const withChars = diffLines('hello world\n', 'hello clara\n');
const deleted = withChars.find((line) => line.kind === 'delete');
const inserted = withChars.find((line) => line.kind === 'insert');
assert.ok(deleted?.segments?.some((segment) => segment.kind === 'delete'));
assert.ok(inserted?.segments?.some((segment) => segment.kind === 'insert'));

// --- requestFieldDiff ---
const baseRequest: PostmanItem = {
  name: 'Ping',
  request: {
    method: 'GET',
    url: {
      raw: 'https://example.com/ping?q=1',
      host: ['example', 'com'],
      path: ['ping'],
      query: [{ key: 'q', value: '1' }]
    },
    header: [
      { key: 'X-Trace', value: '1' },
      { key: 'Accept', value: 'application/json' }
    ],
    body: { mode: 'raw', raw: '{\n  "ok": true\n}\n' },
    auth: { type: 'bearer', bearer: [{ key: 'token', value: 'old', type: 'string' }] }
  },
  event: [
    {
      listen: 'test',
      script: { type: 'text/javascript', exec: ['pm.test("ok", () => {});'] }
    }
  ]
};

// URL-only change
let current = setRequestUrl(structuredClone(baseRequest), 'https://example.com/pingx?q=1');
let field = computeRequestFieldDiff(current, baseRequest);
assert.equal(field.semantic.sections.url, true);
assert.equal(field.semantic.sections.headers, false);
assert.equal(field.url.kind, 'modified');
assert.ok(field.url.current.includes('pingx'));
assert.ok(field.changedSections.includes('url'));
assert.equal(field.headers.hasChanges, false);

// Header value change → keyed row
current = updateRequestHeader(structuredClone(baseRequest), 0, {
  key: 'X-Trace',
  value: 'changed'
});
field = computeRequestFieldDiff(current, baseRequest);
assert.equal(field.semantic.sections.headers, true);
assert.equal(field.headers.hasChanges, true);
const changedHeaders = field.headers.rows.filter((row) => row.change !== 'unchanged');
assert.equal(changedHeaders.length, 1);
assert.equal(changedHeaders[0]?.change, 'modified');
assert.equal(changedHeaders[0]?.baseValue, '1');
assert.equal(changedHeaders[0]?.currentValue, 'changed');
assert.ok(field.headers.rows.some((row) => row.change === 'unchanged' && row.key === 'Accept'));

// Body line diff
current = setRequestBodyRaw(structuredClone(baseRequest), '{\n  "ok": false\n}\n');
field = computeRequestFieldDiff(current, baseRequest);
assert.equal(field.body.kind, 'raw');
if (field.body.kind === 'raw') {
  assert.equal(hasTextChanges(field.body.text.lines), true);
  assert.ok(field.body.text.lines.some((line) => line.kind === 'delete'));
  assert.ok(field.body.text.lines.some((line) => line.kind === 'insert'));
}

// Added request
field = computeRequestFieldDiff(baseRequest, null);
assert.equal(field.semantic.isAdded, true);
assert.equal(field.semantic.isRemoved, false);
assert.ok(field.changedSections.includes('method'));
assert.ok(field.changedSections.includes('url'));

// Removed request
field = computeRequestFieldDiff(null, baseRequest);
assert.equal(field.semantic.isRemoved, true);
assert.equal(field.semantic.isAdded, false);
assert.ok(field.changedSections.includes('method'));
assert.equal(field.url.kind, 'removed');
assert.ok(field.headers.rows.every((row) => row.change === 'removed'));

// Auth type change
current = structuredClone(baseRequest);
if (typeof current.request !== 'string' && current.request) {
  current.request.auth = {
    type: 'basic',
    basic: [
      { key: 'username', value: 'u', type: 'string' },
      { key: 'password', value: 'p', type: 'string' }
    ]
  };
}
field = computeRequestFieldDiff(current, baseRequest);
assert.equal(field.semantic.sections.auth, true);
assert.equal(field.auth.kind, 'changed');
if (field.auth.kind === 'changed') {
  assert.equal(field.auth.baseType, 'bearer');
  assert.equal(field.auth.currentType, 'basic');
}

// Removed ghost resolution via baseIndex
const baseCollection: PostmanCollection = {
  info: {
    name: 'C',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
  },
  item: [
    { name: 'Keep', request: { method: 'GET', url: 'https://example.com/keep' } },
    structuredClone(baseRequest)
  ]
};
const currentCollection: PostmanCollection = {
  info: baseCollection.info,
  item: [baseCollection.item![0]!]
};
const structural = computeStructuralDiff(currentCollection, baseCollection);
assert.equal(structural.removed.length, 1);
assert.equal(structural.removed[0]?.kind, 'request');
assert.equal(typeof structural.removed[0]?.baseIndex, 'number');
const resolved = findRemovedBaseItem(
  currentCollection,
  baseCollection,
  structural.removed[0]!
);
assert.equal(resolved?.name, 'Ping');

console.log('check-stage19: ok');
