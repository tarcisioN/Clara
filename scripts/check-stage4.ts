import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPostmanCollection, serializeCollection } from '../src/postman/types.ts';
import { getItemByPath, getRequestByPath } from '../src/postman/tree.ts';
import {
  addRequestUrlEncodedParam,
  getRequestBody,
  removeRequestUrlEncodedParam,
  setRequestBodyMode,
  setRequestBodyRaw,
  setRequestUrlEncodedParamDisabled,
  updateCollectionItem,
  updateRequestUrlEncodedParam
} from '../src/postman/edit.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, '../fixtures/smoke.postman_collection.json');
const collection = assertPostmanCollection(JSON.parse(readFileSync(fixturePath, 'utf8')));

const echoBody = getRequestBody(getItemByPath(collection.item, '1')!);
assert.equal(echoBody?.mode, 'raw');
assert.equal(echoBody?.raw, '{"ok":true}');
assert.equal(echoBody?.options?.raw?.language, 'json');
assert.equal(echoBody?.urlencoded?.[0]?.key, 'legacy');

// edit raw preserves options + sibling urlencoded payload
const editedRaw = updateCollectionItem(collection, '1', (item) =>
  setRequestBodyRaw(item, '{"ok":false,"n":1}')
);
const editedRawBody = getRequestBody(getItemByPath(editedRaw.item, '1')!);
assert.equal(editedRawBody?.raw, '{"ok":false,"n":1}');
assert.equal(editedRawBody?.options?.raw?.language, 'json');
assert.equal(editedRawBody?.urlencoded?.[0]?.value, 'kept-when-mode-is-raw');
assert.equal(getRequestBody(getItemByPath(collection.item, '1')!)?.raw, '{"ok":true}');

// switch mode keeps sibling payloads
const asUrlencoded = updateCollectionItem(editedRaw, '1', (item) =>
  setRequestBodyMode(item, 'urlencoded')
);
const switched = getRequestBody(getItemByPath(asUrlencoded.item, '1')!);
assert.equal(switched?.mode, 'urlencoded');
assert.equal(switched?.raw, '{"ok":false,"n":1}');
assert.equal(switched?.options?.raw?.language, 'json');

const backToRaw = updateCollectionItem(asUrlencoded, '1', (item) =>
  setRequestBodyMode(item, 'raw')
);
assert.equal(getRequestBody(getItemByPath(backToRaw.item, '1')!)?.mode, 'raw');

// urlencoded CRUD on Form login (path 2)
const login = getRequestBody(getItemByPath(collection.item, '2')!);
assert.equal(login?.mode, 'urlencoded');
assert.equal(login?.urlencoded?.length, 2);
assert.equal(login?.raw, '{"note":"sibling raw kept"}');

const renamed = updateCollectionItem(collection, '2', (item) =>
  updateRequestUrlEncodedParam(item, 0, { key: 'username', value: 'clara-user' })
);
assert.deepEqual(getRequestBody(getItemByPath(renamed.item, '2')!)?.urlencoded?.[0], {
  key: 'username',
  value: 'clara-user'
});

const enabled = updateCollectionItem(renamed, '2', (item) =>
  setRequestUrlEncodedParamDisabled(item, 1, false)
);
assert.equal(getRequestBody(getItemByPath(enabled.item, '2')!)?.urlencoded?.[1]?.disabled, undefined);

const withExtra = updateCollectionItem(enabled, '2', (item) => addRequestUrlEncodedParam(item));
assert.equal(getRequestBody(getItemByPath(withExtra.item, '2')!)?.urlencoded?.length, 3);

const trimmed = updateCollectionItem(withExtra, '2', (item) =>
  removeRequestUrlEncodedParam(item, 2)
);
assert.equal(getRequestBody(getItemByPath(trimmed.item, '2')!)?.urlencoded?.length, 2);

// unsupported mode stays readable and is not stripped when switching away then back via none
const graphqlCollection = assertPostmanCollection({
  info: {
    name: 'gql',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
  },
  item: [
    {
      name: 'Query',
      request: {
        method: 'POST',
        body: {
          mode: 'graphql',
          graphql: { query: '{ hi }', variables: '{}' },
          raw: 'keep-me'
        },
        url: 'https://example.com/graphql'
      }
    }
  ]
});
const gqlNone = updateCollectionItem(graphqlCollection, '0', (item) =>
  setRequestBodyMode(item, 'none')
);
assert.equal(getRequestBody(getItemByPath(gqlNone.item, '0')!)?.mode, 'none');
assert.deepEqual(getRequestBody(getItemByPath(gqlNone.item, '0')!)?.graphql, {
  query: '{ hi }',
  variables: '{}'
});
assert.equal(getRequestBody(getItemByPath(gqlNone.item, '0')!)?.raw, 'keep-me');

// serialization keeps options + no invented keys on raw body
const serialized = JSON.parse(serializeCollection(editedRaw));
assert.deepEqual(serialized.item[1].request.body.options, {
  raw: { language: 'json' }
});
assert.equal(serialized.item[1].request.body.mode, 'raw');
assert.equal(getRequestByPath(editedRaw.item, '1')?.method, 'POST');

assert.throws(
  () =>
    updateCollectionItem(collection, '2', (item) => removeRequestUrlEncodedParam(item, 9)),
  /out of range/
);

console.log('stage4 checks passed');
