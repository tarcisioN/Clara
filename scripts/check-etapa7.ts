import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPostmanCollection, serializeCollection } from '../src/postman/types.ts';
import { getItemByPath } from '../src/postman/tree.ts';
import {
  getItemScriptSource,
  setItemScriptSource,
  updateCollectionItem
} from '../src/postman/edit.ts';
import { scriptExecToSource, sourceToScriptExec } from '../src/postman/scripts.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, '../fixtures/smoke.postman_collection.json');
const collection = assertPostmanCollection(JSON.parse(readFileSync(fixturePath, 'utf8')));

assert.equal(
  scriptExecToSource(['a', 'b']),
  'a\nb'
);
assert.deepEqual(sourceToScriptExec('a\nb'), ['a', 'b']);
assert.deepEqual(sourceToScriptExec(''), ['']);

const ping = getItemByPath(collection.item, '0.0')!;
assert.match(getItemScriptSource(ping, 'prerequest'), /pingStarted/);
assert.match(getItemScriptSource(ping, 'test'), /status is 200/);

// Root echo has no events yet
const echo = getItemByPath(collection.item, '1')!;
assert.equal(getItemScriptSource(echo, 'prerequest'), '');
assert.equal(getItemScriptSource(echo, 'test'), '');

const withPre = updateCollectionItem(collection, '1', (item) =>
  setItemScriptSource(item, 'prerequest', 'console.log("pre");\npm.variables.set("x", 1);')
);
assert.equal(
  getItemScriptSource(getItemByPath(withPre.item, '1')!, 'prerequest'),
  'console.log("pre");\npm.variables.set("x", 1);'
);
// original unchanged
assert.equal(getItemScriptSource(echo, 'prerequest'), '');
// Ping scripts untouched
assert.match(getItemScriptSource(getItemByPath(withPre.item, '0.0')!, 'test'), /status is 200/);

const withBoth = updateCollectionItem(withPre, '1', (item) =>
  setItemScriptSource(item, 'test', 'pm.test("ok", () => {});')
);
const echoEvents = getItemByPath(withBoth.item, '1')!.event!;
assert.equal(echoEvents.length, 2);
assert.equal(echoEvents[0]?.listen, 'prerequest');
assert.equal(echoEvents[1]?.listen, 'test');
assert.deepEqual(echoEvents[0]?.script?.exec, [
  'console.log("pre");',
  'pm.variables.set("x", 1);'
]);

// Preserve sibling script fields when rewriting exec
const withId = updateCollectionItem(collection, '0.0', (item) => {
  const events = [...(item.event ?? [])];
  const index = events.findIndex((event) => event.listen === 'test');
  events[index] = {
    ...events[index]!,
    script: { ...events[index]!.script, id: 'keep-me', type: 'text/javascript' }
  };
  return { ...item, event: events };
});
const rewritten = updateCollectionItem(withId, '0.0', (item) =>
  setItemScriptSource(item, 'test', 'pm.test("rewritten", () => {});')
);
const testEvent = getItemByPath(rewritten.item, '0.0')!.event!.find(
  (event) => event.listen === 'test'
);
assert.equal(testEvent?.script?.id, 'keep-me');
assert.equal(testEvent?.script?.type, 'text/javascript');
assert.deepEqual(testEvent?.script?.exec, ['pm.test("rewritten", () => {});']);

// Empty source still produces Postman-shaped exec
const cleared = updateCollectionItem(withBoth, '1', (item) =>
  setItemScriptSource(item, 'prerequest', '')
);
assert.deepEqual(
  getItemByPath(cleared.item, '1')!.event!.find((event) => event.listen === 'prerequest')
    ?.script?.exec,
  ['']
);

const serialized = JSON.parse(serializeCollection(withBoth));
assert.deepEqual(serialized.item[1].event[0].script.exec, [
  'console.log("pre");',
  'pm.variables.set("x", 1);'
]);
assert.equal(serialized.item[0].item[0].event[0].listen, 'prerequest');

console.log('etapa7 checks passed');
