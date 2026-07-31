import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPostmanCollection, serializeCollection } from '../src/postman/types.ts';
import { getItemByPath, getRequestByPath } from '../src/postman/tree.ts';
import {
  addRequestHeader,
  getRequestHeaders,
  removeRequestHeader,
  setRequestHeaderDisabled,
  updateCollectionItem,
  updateRequestHeader
} from '../src/postman/edit.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, '../fixtures/smoke.postman_collection.json');
const collection = assertPostmanCollection(JSON.parse(readFileSync(fixturePath, 'utf8')));

const pingHeaders = getRequestHeaders(getItemByPath(collection.item, '0.0')!);
assert.equal(pingHeaders.length, 2);
assert.equal(pingHeaders[0].key, 'Accept');
assert.equal(pingHeaders[0].description, 'kept by Clara');
assert.equal(pingHeaders[0].disabled, undefined);
assert.equal(pingHeaders[1].key, 'X-Debug');
assert.equal(pingHeaders[1].disabled, true);

// edit key/value preserves description and disabled siblings
const renamed = updateCollectionItem(collection, '0.0', (item) =>
  updateRequestHeader(item, 0, { key: 'Accept-Language', value: 'pt-BR' })
);
const renamedHeaders = getRequestHeaders(getItemByPath(renamed.item, '0.0')!);
assert.equal(renamedHeaders[0].key, 'Accept-Language');
assert.equal(renamedHeaders[0].value, 'pt-BR');
assert.equal(renamedHeaders[0].description, 'kept by Clara');
assert.equal(renamedHeaders[1].disabled, true);
// source collection untouched
assert.equal(getRequestHeaders(getItemByPath(collection.item, '0.0')!)[0].key, 'Accept');

// toggle disabled: omit when enabled, set true when disabled
const enabled = updateCollectionItem(renamed, '0.0', (item) =>
  setRequestHeaderDisabled(item, 1, false)
);
assert.equal(getRequestHeaders(getItemByPath(enabled.item, '0.0')!)[1].disabled, undefined);

const disabledAgain = updateCollectionItem(enabled, '0.0', (item) =>
  setRequestHeaderDisabled(item, 1, true)
);
assert.equal(getRequestHeaders(getItemByPath(disabledAgain.item, '0.0')!)[1].disabled, true);

// add + remove
const withExtra = updateCollectionItem(disabledAgain, '0.0', (item) => addRequestHeader(item));
assert.equal(getRequestHeaders(getItemByPath(withExtra.item, '0.0')!).length, 3);
assert.deepEqual(getRequestHeaders(getItemByPath(withExtra.item, '0.0')!)[2], {
  key: '',
  value: ''
});

const removed = updateCollectionItem(withExtra, '0.0', (item) => removeRequestHeader(item, 2));
assert.equal(getRequestHeaders(getItemByPath(removed.item, '0.0')!).length, 2);

// out-of-range fails loudly
assert.throws(
  () => updateCollectionItem(collection, '0.0', (item) => removeRequestHeader(item, 9)),
  /out of range/
);

// string-form request expands when a header is added
const stringFormCollection = assertPostmanCollection({
  info: {
    name: 'string-form',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
  },
  item: [{ name: 'Bare', request: 'https://example.com/bare' }]
});
const expanded = updateCollectionItem(stringFormCollection, '0', (item) =>
  addRequestHeader(item)
);
const bare = getItemByPath(expanded.item, '0');
assert.equal(typeof bare?.request, 'object');
assert.equal(getRequestByPath(expanded.item, '0')?.method, 'GET');
assert.equal(getRequestHeaders(bare!).length, 1);

// existing object requests keep method when headers change
const withExtraOnPost = updateCollectionItem(collection, '1', (item) => addRequestHeader(item));
assert.equal(getRequestByPath(withExtraOnPost.item, '1')?.method, 'POST');
assert.equal(getRequestHeaders(getItemByPath(withExtraOnPost.item, '1')!).length, 1);

// round-trip shape: no invented fields on headers
const serialized = JSON.parse(serializeCollection(disabledAgain));
const savedHeaders = serialized.item[0].item[0].request.header;
assert.deepEqual(Object.keys(savedHeaders[0]).sort(), ['description', 'key', 'value']);
assert.deepEqual(Object.keys(savedHeaders[1]).sort(), ['disabled', 'key', 'value']);
assert.equal(savedHeaders[1].disabled, true);

console.log('stage3 checks passed');
