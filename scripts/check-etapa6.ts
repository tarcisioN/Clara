import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPostmanCollection, serializeCollection } from '../src/postman/types.ts';
import { getItemByPath, getRequestByPath } from '../src/postman/tree.ts';
import { buildRaw, ensureUrlObject, isUrlObject, setUrlQueryParams } from '../src/postman/url.ts';
import {
  addRequestQueryParam,
  getRequestQueryParams,
  promoteRequestUrlToObject,
  removeRequestQueryParam,
  setRequestQueryParamDisabled,
  updateCollectionItem,
  updateRequestQueryParam
} from '../src/postman/edit.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, '../fixtures/smoke.postman_collection.json');
const collection = assertPostmanCollection(JSON.parse(readFileSync(fixturePath, 'utf8')));

const pingParams = getRequestQueryParams(getItemByPath(collection.item, '0.0')!);
assert.equal(pingParams.length, 2);
assert.equal(pingParams[0].key, 'verbose');
assert.equal(pingParams[1].disabled, true);

const pingUrl = getRequestByPath(collection.item, '0.0')!.url;
assert.ok(isUrlObject(pingUrl));
assert.equal(pingUrl.raw, 'https://example.com/ping?verbose=1');
assert.equal(buildRaw(pingUrl), 'https://example.com/ping?verbose=1');

// edit query rebuilds raw; host/path/variable stay
const withVar = {
  ...pingUrl,
  variable: [{ key: 'id', value: '1' }]
};
const updated = setUrlQueryParams(withVar, [
  { key: 'verbose', value: '2' },
  { key: 'trace', value: '1', disabled: true }
]);
assert.equal(updated.raw, 'https://example.com/ping?verbose=2');
assert.deepEqual(updated.host, ['example', 'com']);
assert.deepEqual(updated.path, ['ping']);
assert.deepEqual(updated.variable, [{ key: 'id', value: '1' }]);
assert.equal(updated.query?.[1].disabled, true);

// CRUD via item helpers
const renamed = updateCollectionItem(collection, '0.0', (item) =>
  updateRequestQueryParam(item, 0, { key: 'v', value: '9' })
);
assert.equal(getRequestQueryParams(getItemByPath(renamed.item, '0.0')!)[0].key, 'v');
assert.ok(isUrlObject(getRequestByPath(renamed.item, '0.0')!.url));
assert.equal(
  (getRequestByPath(renamed.item, '0.0')!.url as { raw?: string }).raw,
  'https://example.com/ping?v=9'
);

const enabled = updateCollectionItem(renamed, '0.0', (item) =>
  setRequestQueryParamDisabled(item, 1, false)
);
assert.equal(
  (getRequestByPath(enabled.item, '0.0')!.url as { raw?: string }).raw,
  'https://example.com/ping?v=9&trace=1'
);

const withExtra = updateCollectionItem(enabled, '0.0', (item) => addRequestQueryParam(item));
assert.equal(getRequestQueryParams(getItemByPath(withExtra.item, '0.0')!).length, 3);

const trimmed = updateCollectionItem(withExtra, '0.0', (item) =>
  removeRequestQueryParam(item, 2)
);
assert.equal(getRequestQueryParams(getItemByPath(trimmed.item, '0.0')!).length, 2);

// string URL: no query table until promote
assert.equal(getRequestQueryParams(getItemByPath(collection.item, '1')!).length, 0);
assert.equal(typeof getRequestByPath(collection.item, '1')!.url, 'string');

const promoted = updateCollectionItem(collection, '1', (item) => promoteRequestUrlToObject(item));
const promotedUrl = getRequestByPath(promoted.item, '1')!.url;
assert.ok(isUrlObject(promotedUrl));
assert.equal(promotedUrl.raw, 'https://example.com/echo');
assert.deepEqual(promotedUrl.host, ['example', 'com']);

const promotedWithQuery = updateCollectionItem(promoted, '1', (item) =>
  addRequestQueryParam(item)
);
const q = getRequestQueryParams(getItemByPath(promotedWithQuery.item, '1')!);
assert.equal(q.length, 1);
assert.ok(isUrlObject(getRequestByPath(promotedWithQuery.item, '1')!.url));
assert.match(
  (getRequestByPath(promotedWithQuery.item, '1')!.url as { raw?: string }).raw ?? '',
  /\?=/
);

assert.deepEqual(ensureUrlObject('https://a.b/c?x=1').query, [{ key: 'x', value: '1' }]);

assert.throws(
  () => updateCollectionItem(collection, '0.0', (item) => removeRequestQueryParam(item, 9)),
  /out of range/
);

const serialized = JSON.parse(serializeCollection(renamed));
assert.deepEqual(serialized.item[0].item[0].request.url.query[0], { key: 'v', value: '9' });
assert.equal(serialized.item[0].item[0].request.url.query[1].disabled, true);
assert.equal(serialized.item[0].item[0].request.url.raw, 'https://example.com/ping?v=9');

console.log('etapa6 checks passed');
