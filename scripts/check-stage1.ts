import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPostmanCollection } from '../src/postman/types.ts';
import {
  collectFolderPaths,
  getItemByPath,
  getRequestByPath,
  isFolder,
  isRequest
} from '../src/postman/tree.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, '../fixtures/smoke.postman_collection.json');

const collection = assertPostmanCollection(JSON.parse(readFileSync(fixturePath, 'utf8')));

const folder = getItemByPath(collection.item, '0');
assert.ok(folder);
assert.equal(folder.name, 'Health');
assert.equal(isFolder(folder), true);
assert.equal(isRequest(folder), false);

const nestedRequest = getItemByPath(collection.item, '0.0');
assert.ok(nestedRequest);
assert.equal(nestedRequest.name, 'Ping');
assert.equal(isRequest(nestedRequest), true);

const request = getRequestByPath(collection.item, '0.0');
assert.ok(request);
assert.equal(request.method, 'GET');
assert.ok(request.url && typeof request.url === 'object');
assert.equal(request.url.raw, 'https://example.com/ping?verbose=1');

const rootRequest = getRequestByPath(collection.item, '1');
assert.ok(rootRequest);
assert.equal(rootRequest.method, 'POST');

assert.equal(getItemByPath(collection.item, '9'), undefined);
assert.equal(getRequestByPath(collection.item, '0'), undefined);

const folders = collectFolderPaths(collection.item);
assert.equal(folders.has('0'), true);
assert.equal(folders.has('0.0'), false);

console.log('stage1 checks passed');
