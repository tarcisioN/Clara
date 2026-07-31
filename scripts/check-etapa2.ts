import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPostmanCollection, serializeCollection } from '../src/postman/types.ts';
import { getItemByPath, getRequestByPath } from '../src/postman/tree.ts';
import {
  setRequestMethod,
  setRequestUrl,
  updateCollectionItem
} from '../src/postman/edit.ts';
import { buildRaw, getUrlRaw, parseUrlString, setUrlRaw } from '../src/postman/url.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, '../fixtures/smoke.postman_collection.json');
const raw = readFileSync(fixturePath, 'utf8');
const collection = assertPostmanCollection(JSON.parse(raw));

// --- url parsing -------------------------------------------------------------

const parsed = parseUrlString('https://api.example.com:8443/v1/users?page=2&q=a b#top');
assert.equal(parsed.protocol, 'https');
assert.deepEqual(parsed.host, ['api', 'example', 'com']);
assert.equal(parsed.port, '8443');
assert.deepEqual(parsed.path, ['v1', 'users']);
assert.deepEqual(parsed.query, [
  { key: 'page', value: '2' },
  { key: 'q', value: 'a b' }
]);
assert.equal(parsed.hash, 'top');

// `{{vars}}` survive host splitting even with dots inside
assert.deepEqual(parseUrlString('{{base.url}}/ping').host, ['{{base.url}}']);
assert.deepEqual(parseUrlString('{{host}}.example.com/ping').host, ['{{host}}', 'example', 'com']);

// keyless query params keep Postman's null value
assert.deepEqual(parseUrlString('https://example.com/x?flag').query, [
  { key: 'flag', value: null }
]);

// --- url rewriting preserves what raw cannot express -------------------------

const original = {
  raw: 'https://example.com/v1/users/:id?page=1',
  protocol: 'https',
  host: ['example', 'com'],
  path: ['v1', 'users', ':id'],
  query: [
    { key: 'page', value: '1' },
    { key: 'debug', value: 'true', disabled: true }
  ],
  variable: [{ key: 'id', value: '42' }]
};

const rewritten = setUrlRaw(original, 'https://example.com/v2/users/:id?page=3');
assert.ok(typeof rewritten === 'object');
assert.equal(rewritten.raw, 'https://example.com/v2/users/:id?page=3');
assert.deepEqual(rewritten.path, ['v2', 'users', ':id']);
assert.deepEqual(rewritten.variable, [{ key: 'id', value: '42' }]);
assert.deepEqual(rewritten.query, [
  { key: 'page', value: '3' },
  { key: 'debug', value: 'true', disabled: true }
]);
// the source object is untouched
assert.equal(original.raw, 'https://example.com/v1/users/:id?page=1');

// structured members stay consistent with raw, which is what Newman resolves
assert.equal(buildRaw(rewritten), 'https://example.com/v2/users/:id?page=3');

// dropping the query removes it from the members too
const withoutQuery = setUrlRaw(original, 'https://example.com/v1/users/:id');
assert.ok(typeof withoutQuery === 'object');
assert.deepEqual(withoutQuery.query, [
  { key: 'debug', value: 'true', disabled: true }
]);

// string urls stay strings
assert.equal(setUrlRaw('https://example.com/a', 'https://example.com/b'), 'https://example.com/b');

// --- item edits are immutable and land on the right node ---------------------

const editedUrl = updateCollectionItem(collection, '0.0', (item) =>
  setRequestUrl(item, 'https://example.com/pong')
);
assert.equal(getUrlRaw(getRequestByPath(editedUrl.item, '0.0')?.url), 'https://example.com/pong');
assert.equal(getUrlRaw(getRequestByPath(collection.item, '0.0')?.url), 'https://example.com/ping?verbose=1');
// untouched siblings are shared, not cloned
assert.equal(getItemByPath(editedUrl.item, '1'), getItemByPath(collection.item, '1'));

const editedMethod = updateCollectionItem(editedUrl, '0.0', (item) =>
  setRequestMethod(item, 'delete')
);
assert.equal(getRequestByPath(editedMethod.item, '0.0')?.method, 'DELETE');

// a request stored as a bare string stays a string when only the url changes
const stringUrlEdit = updateCollectionItem(collection, '1', (item) =>
  setRequestUrl(item, 'https://example.com/echo2')
);
const stringItem = getItemByPath(stringUrlEdit.item, '1');
assert.equal(typeof stringItem?.request, 'object');
assert.equal(getUrlRaw((stringItem?.request as { url?: unknown }).url as never), 'https://example.com/echo2');

// editing an out-of-range path fails loudly instead of corrupting the tree
assert.throws(() => updateCollectionItem(collection, '9', (item) => item), /out of range/);

// --- serialization stays canonical ------------------------------------------

const serialized = serializeCollection(editedMethod);
assert.match(serialized, /\n$/);
assert.ok(JSON.parse(serialized));

console.log('etapa2 checks passed');
