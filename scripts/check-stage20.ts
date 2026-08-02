import assert from 'node:assert/strict';
import {
  createPinnedRequest,
  isPinnedDetached,
  isRequestTabPinned,
  listSaveAsLocations,
  markDetachedPins,
  remapPinnedTabKey,
  shouldKeepTabAfterReload,
  updatePinnedItem
} from '../src/workspace/pinnedRequest.ts';
import { nextOpenTabs, tabKey, type WorkspaceTab } from '../src/workspace/tabs.ts';
import type { PostmanItem } from '../src/postman/types.ts';

const request: PostmanItem = {
  name: 'Ping',
  request: { method: 'GET', url: 'https://example.com' }
};

const pin = createPinnedRequest('/repo/col.json', '0.1', request);
assert.equal(pin.linkedPath, '0.1');
assert.equal(pin.item.name, 'Ping');
assert.notEqual(pin.item, request);

const items: PostmanItem[] = [
  {
    name: 'Folder',
    item: [request]
  }
];
assert.equal(isPinnedDetached(pin, items), true);
assert.equal(
  isPinnedDetached({ ...pin, linkedPath: '0.0' }, items),
  false
);

const tab: WorkspaceTab = {
  kind: 'request',
  collectionPath: '/repo/col.json',
  path: '0.1'
};
const other: WorkspaceTab = {
  kind: 'request',
  collectionPath: '/repo/col.json',
  path: '0.0'
};
const key = tabKey(tab);
const pins = { [key]: pin };
assert.equal(isRequestTabPinned(tab, pins), true);
assert.equal(isRequestTabPinned(other, pins), false);
assert.equal(
  shouldKeepTabAfterReload(tab, '/repo/col.json', new Set(), pins),
  true
);
assert.equal(
  shouldKeepTabAfterReload(tab, '/repo/col.json', new Set(), {}),
  false
);

// Pinned active tab behaves like dirty: opening another request appends.
assert.deepEqual(
  nextOpenTabs([tab], other, tab, {
    isDirty: (candidate) => isRequestTabPinned(candidate, pins)
  }),
  [tab, other]
);
assert.deepEqual(
  nextOpenTabs([tab], other, tab, { isDirty: () => false }),
  [other],
  'unpinned clean active is still replaced'
);

// A reload that leaves another request at the pinned path must detach the pin,
// so edits never write over the request that took its place.
const linkedPin = createPinnedRequest('/repo/col.json', '0.0', request);
const linkedPins = { [tabKey({ ...tab, path: '0.0' })]: linkedPin };
const linkedKey = tabKey({ ...tab, path: '0.0' });

assert.equal(
  markDetachedPins(linkedPins, '/repo/col.json', items),
  linkedPins,
  'a pin whose request is still there stays linked'
);

const replaced: PostmanItem[] = [
  { name: 'Folder', item: [{ name: 'Other', request: { method: 'GET', url: 'x' } }] }
];
const afterReplace = markDetachedPins(linkedPins, '/repo/col.json', replaced);
assert.equal(afterReplace[linkedKey]?.detached, true);
assert.equal(isPinnedDetached(afterReplace[linkedKey]!, replaced), true);

const afterRemoval = markDetachedPins(linkedPins, '/repo/col.json', []);
assert.equal(afterRemoval[linkedKey]?.detached, true);

// Coming back to a branch that still has the request links the pin again.
assert.equal(markDetachedPins(afterReplace, '/repo/col.json', items)[linkedKey]?.detached, false);

// Pins of other collections are left alone.
assert.equal(markDetachedPins(linkedPins, '/repo/other.json', []), linkedPins);

// A draft (Duplicate Tab) is always detached and never links to a tree item,
// even when it ends up with the same name as the request under its path.
const draftTab: WorkspaceTab = {
  kind: 'request',
  collectionPath: '/repo/col.json',
  path: '0.0',
  draftId: 'd1'
};
const draftPin = {
  ...createPinnedRequest('/repo/col.json', '0.0', request),
  draft: true
};
const draftPins = { [tabKey(draftTab)]: draftPin };
assert.equal(isPinnedDetached(draftPin, items), true);
assert.equal(markDetachedPins(draftPins, '/repo/col.json', items), draftPins);
assert.equal(
  shouldKeepTabAfterReload(draftTab, '/repo/col.json', new Set(), draftPins),
  true,
  'a draft survives a reload that has no item at its path'
);

const updated = updatePinnedItem(pins, key, (item) => ({ ...item, name: 'Pong' }));
assert.equal(updated[key]?.item.name, 'Pong');
assert.equal(pins[key]?.item.name, 'Ping');

const remapped = remapPinnedTabKey(updated, tab, { ...tab, path: '2' });
assert.equal(remapped[key], undefined);
assert.equal(remapped[tabKey({ ...tab, path: '2' })]?.linkedPath, '2');

const locations = listSaveAsLocations(
  [
    { name: 'A', item: [{ name: 'nested', item: [request] }] },
    request
  ],
  'Root'
);
assert.equal(locations[0]?.parentPath, null);
assert.equal(locations[0]?.label, 'Root');
assert.ok(locations.some((entry) => entry.label === 'A'));
assert.ok(locations.some((entry) => entry.label === 'A / nested'));

console.log('pin checks passed');
