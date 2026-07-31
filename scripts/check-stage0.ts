import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertPostmanCollection,
  countItems,
  createEmptyCollection,
  serializeCollection,
  suggestCollectionFileName,
  trailingNewlineFromRaw
} from '../src/postman/types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, '../fixtures/smoke.postman_collection.json');

const raw = readFileSync(fixturePath, 'utf8');
const collection = assertPostmanCollection(JSON.parse(raw));
const counts = countItems(collection.item);

assert.equal(collection.info?.name, 'Clara Smoke Collection');
assert.equal(counts.folders, 1);
assert.equal(counts.requests, 3);

const dir = mkdtempSync(path.join(tmpdir(), 'clara-stage0-'));
const copyPath = path.join(dir, 'smoke.postman_collection.json');
writeFileSync(copyPath, raw, 'utf8');

// dirty-free save: write original raw → bytes identical
writeFileSync(copyPath, raw, 'utf8');
assert.equal(readFileSync(copyPath, 'utf8'), raw);

// edited save format: 2-space; trailing newline follows the original when known
const serialized = serializeCollection(collection);
assert.match(serialized, /\n$/);
assert.ok(serialized.includes('\n  "info"'));
writeFileSync(copyPath, serialized, 'utf8');
assert.equal(readFileSync(copyPath, 'utf8'), serialized);

const withoutEof = serializeCollection(collection, { trailingNewline: false });
assert.equal(withoutEof.endsWith('\n'), false);
assert.equal(withoutEof + '\n', serialized);
assert.equal(
  serializeCollection(collection, { trailingNewline: trailingNewlineFromRaw(raw) }).endsWith(
    '\n'
  ),
  raw.endsWith('\n')
);

const blank = createEmptyCollection('Demo APIs');
assert.equal(blank.info?.name, 'Demo APIs');
assert.equal(blank.info?.schema?.includes('v2.1.0'), true);
assert.deepEqual(blank.item, []);
assert.equal(suggestCollectionFileName('Demo APIs'), 'Demo APIs.postman_collection.json');
assert.equal(suggestCollectionFileName('a/b:c*'), 'a-b-c-.postman_collection.json');
assert.equal(
  suggestCollectionFileName('Mine.postman_collection.json'),
  'Mine.postman_collection.json'
);

rmSync(dir, { recursive: true, force: true });
console.log('stage0 checks passed');
