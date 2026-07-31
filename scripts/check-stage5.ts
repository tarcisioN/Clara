import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPostmanCollection, serializeCollection } from '../src/postman/types.ts';
import { getItemByPath } from '../src/postman/tree.ts';
import {
  getAuthAttributeValue,
  resolveEditableAuthType
} from '../src/postman/auth.ts';
import {
  getRequestAuth,
  setRequestApiKeyAuth,
  setRequestAuthType,
  setRequestBasicAuth,
  setRequestBearerToken,
  updateCollectionItem
} from '../src/postman/edit.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, '../fixtures/smoke.postman_collection.json');
const collection = assertPostmanCollection(JSON.parse(readFileSync(fixturePath, 'utf8')));

// Ping inherits — no request.auth
assert.equal(getRequestAuth(getItemByPath(collection.item, '0.0')!), undefined);
assert.equal(resolveEditableAuthType(undefined), 'inherit');

// folder auth stays on the folder when child inherits
assert.equal((getItemByPath(collection.item, '0') as { auth?: { type?: string } }).auth?.type, 'apikey');

// Root echo bearer
const echoAuth = getRequestAuth(getItemByPath(collection.item, '1')!);
assert.equal(echoAuth?.type, 'bearer');
assert.equal(getAuthAttributeValue(echoAuth?.bearer, 'token'), 'echo-token');

const retokened = updateCollectionItem(collection, '1', (item) =>
  setRequestBearerToken(item, 'new-token')
);
assert.equal(
  getAuthAttributeValue(getRequestAuth(getItemByPath(retokened.item, '1')!)?.bearer, 'token'),
  'new-token'
);
assert.equal(
  getAuthAttributeValue(getRequestAuth(getItemByPath(collection.item, '1')!)?.bearer, 'token'),
  'echo-token'
);

// Form login basic
const loginAuth = getRequestAuth(getItemByPath(collection.item, '2')!);
assert.equal(loginAuth?.type, 'basic');
assert.equal(getAuthAttributeValue(loginAuth?.basic, 'username'), 'clara');

const renamed = updateCollectionItem(collection, '2', (item) =>
  setRequestBasicAuth(item, { username: 'clara-admin', password: 'better' })
);
const renamedAuth = getRequestAuth(getItemByPath(renamed.item, '2')!);
assert.equal(getAuthAttributeValue(renamedAuth?.basic, 'username'), 'clara-admin');
assert.equal(getAuthAttributeValue(renamedAuth?.basic, 'password'), 'better');

// inherit removes request.auth without touching folder auth
const inherited = updateCollectionItem(retokened, '1', (item) =>
  setRequestAuthType(item, 'inherit')
);
assert.equal(getRequestAuth(getItemByPath(inherited.item, '1')!), undefined);
assert.equal('auth' in (getItemByPath(inherited.item, '1')!.request as object), false);
assert.equal((getItemByPath(inherited.item, '0') as { auth?: { type?: string } }).auth?.type, 'apikey');

// noauth is explicit
const noauth = updateCollectionItem(collection, '0.0', (item) =>
  setRequestAuthType(item, 'noauth')
);
assert.deepEqual(getRequestAuth(getItemByPath(noauth.item, '0.0')!), { type: 'noauth' });

// switching type keeps sibling arrays
const switched = updateCollectionItem(collection, '1', (item) =>
  setRequestAuthType(item, 'basic')
);
const switchedAuth = getRequestAuth(getItemByPath(switched.item, '1')!);
assert.equal(switchedAuth?.type, 'basic');
assert.equal(getAuthAttributeValue(switchedAuth?.bearer, 'token'), 'echo-token');
assert.equal(getAuthAttributeValue(switchedAuth?.basic, 'username'), '');

// apikey upsert
const withKey = updateCollectionItem(collection, '0.0', (item) =>
  setRequestAuthType(item, 'apikey')
);
const keyed = updateCollectionItem(withKey, '0.0', (item) =>
  setRequestApiKeyAuth(item, { key: 'X-Token', value: 'abc', in: 'query' })
);
const keyedAuth = getRequestAuth(getItemByPath(keyed.item, '0.0')!);
assert.equal(keyedAuth?.type, 'apikey');
assert.equal(getAuthAttributeValue(keyedAuth?.apikey, 'key'), 'X-Token');
assert.equal(getAuthAttributeValue(keyedAuth?.apikey, 'value'), 'abc');
assert.equal(getAuthAttributeValue(keyedAuth?.apikey, 'in'), 'query');

// serialization keeps Postman attribute shape (key/value/type)
const serialized = JSON.parse(serializeCollection(retokened));
assert.deepEqual(serialized.item[1].request.auth, {
  type: 'bearer',
  bearer: [{ key: 'token', value: 'new-token', type: 'string' }]
});
assert.equal(serialized.item[0].item[0].request.auth, undefined);

console.log('stage5 checks passed');
