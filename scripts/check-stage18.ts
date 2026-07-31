import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { groupByDirectory, WorkspaceFileWatcher } from '../electron/watch.ts';
import { decideExternalChange } from '../src/workspace/externalChanges.ts';

// Reload decisions: unsaved edits are only discarded when the reload is explicit.
assert.equal(
  decideExternalChange({ diskRaw: 'a', loadedRaw: 'a', dirty: false }),
  'unchanged'
);
assert.equal(
  decideExternalChange({ diskRaw: 'a', loadedRaw: 'a', dirty: true }),
  'unchanged'
);
assert.equal(
  decideExternalChange({ diskRaw: 'b', loadedRaw: 'a', dirty: false }),
  'reload'
);
assert.equal(
  decideExternalChange({ diskRaw: 'b', loadedRaw: 'a', dirty: true }),
  'conflict'
);
assert.equal(
  decideExternalChange({ diskRaw: 'b', loadedRaw: 'a', dirty: true, force: true }),
  'reload'
);
assert.equal(
  decideExternalChange({ diskRaw: 'a', loadedRaw: 'a', dirty: true, force: true }),
  'reload'
);
assert.equal(
  decideExternalChange({ diskRaw: 'a', loadedRaw: 'a', dirty: false, force: true }),
  'unchanged'
);

// Watched files are grouped per directory so renames keep firing.
const grouped = groupByDirectory([
  '/tmp/one/a.json',
  '/tmp/one/b.json',
  '/tmp/two/c.json'
]);
assert.equal(grouped.size, 2);
assert.deepEqual([...(grouped.get('/tmp/one') ?? [])].sort(), ['a.json', 'b.json']);
assert.deepEqual([...(grouped.get('/tmp/two') ?? [])], ['c.json']);

const workspace = mkdtempSync(path.join(tmpdir(), 'clara-stage18-'));
const watched = path.join(workspace, 'collection.json');
const ignored = path.join(workspace, 'other.json');
writeFileSync(watched, '{"v":1}');
writeFileSync(ignored, '{"v":1}');

const seen: string[][] = [];
const watcher = new WorkspaceFileWatcher((paths) => seen.push(paths), 20);
watcher.setFiles([watched]);

const waitFor = (predicate: () => boolean, timeoutMs = 3000): Promise<void> =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error('timed out waiting for watcher event'));
        return;
      }
      setTimeout(tick, 20);
    };
    tick();
  });

writeFileSync(watched, '{"v":2}');
await waitFor(() => seen.length > 0);
assert.deepEqual(seen[0], [watched]);

// Files outside the watched set stay quiet.
seen.length = 0;
writeFileSync(ignored, '{"v":3}');
await new Promise((resolve) => setTimeout(resolve, 200));
assert.equal(seen.length, 0);

// A burst of writes collapses into a single notification.
writeFileSync(watched, '{"v":4}');
writeFileSync(watched, '{"v":5}');
writeFileSync(watched, '{"v":6}');
await waitFor(() => seen.length > 0);
await new Promise((resolve) => setTimeout(resolve, 200));
assert.equal(seen.length, 1);

watcher.close();
seen.length = 0;
writeFileSync(watched, '{"v":7}');
await new Promise((resolve) => setTimeout(resolve, 200));
assert.equal(seen.length, 0);

rmSync(workspace, { recursive: true, force: true });

console.log('check-stage18: ok');
