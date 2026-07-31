import assert from 'node:assert/strict';
import { computeRequestFieldDiff } from '../src/git/requestFieldDiff.ts';
import { diffLines, hasTextChanges } from '../src/git/textDiff.ts';
import { updateRequestHeader, setRequestUrl, setRequestBodyRaw } from '../src/postman/edit.ts';
import type { PostmanItem } from '../src/postman/types.ts';

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
assert.equal(field.headers.rows.length, 1);
assert.equal(field.headers.rows[0]?.change, 'modified');
assert.equal(field.headers.rows[0]?.baseValue, '1');
assert.equal(field.headers.rows[0]?.currentValue, 'changed');

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
assert.ok(field.changedSections.includes('method'));
assert.ok(field.changedSections.includes('url'));

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

console.log('check-stage19: ok');
