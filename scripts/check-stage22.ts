import assert from 'node:assert/strict';
import { searchCollections } from '../src/workspace/collectionSearch.ts';
import type { PostmanCollection, PostmanItem } from '../src/postman/types.ts';

const request = (
  name: string,
  options?: {
    method?: string;
    url?: string;
    body?: string;
    tests?: string;
    header?: string;
  }
): PostmanItem => ({
  name,
  request: {
    method: options?.method ?? 'GET',
    header: options?.header
      ? [{ key: 'X-Trace', value: options.header }]
      : [],
    url: options?.url ?? `https://example.com/${name}`,
    ...(options?.body
      ? { body: { mode: 'raw', raw: options.body } }
      : {})
  },
  ...(options?.tests
    ? {
        event: [
          {
            listen: 'test',
            script: { type: 'text/javascript', exec: options.tests.split('\n') }
          }
        ]
      }
    : {})
});

const collection: PostmanCollection = {
  info: { name: 'Demo' },
  item: [
    {
      name: 'Auth',
      item: [
        request('login', {
          method: 'POST',
          url: 'https://api.example.com/v1/login',
          body: '{"user":"ada"}',
          tests: 'pm.test("ok", () => pm.response.to.have.status(200));'
        }),
        request('profile', {
          url: 'https://api.example.com/v1/me',
          header: 'trace-secret-token'
        })
      ]
    },
    request('health', { url: 'https://api.example.com/healthz' })
  ]
};

const sources = [{ filePath: '/repo/demo.json', collection }];

// Empty query returns a browse list of requests.
const browse = searchCollections(sources, '');
assert.ok(browse.length >= 3);
assert.equal(browse.every((hit) => hit.kind === 'request'), true);

// Name match ranks above weaker fields.
const byName = searchCollections(sources, 'login');
assert.ok(byName[0]);
assert.equal(byName[0]!.name, 'login');
assert.equal(byName[0]!.field, 'name');

// URL content is searchable.
const byUrl = searchCollections(sources, 'healthz');
assert.ok(byUrl.some((hit) => hit.name === 'health' && hit.field === 'url'));

// Body content is searchable and points at the Body section.
const byBody = searchCollections(sources, 'ada');
assert.ok(byBody[0]);
assert.equal(byBody[0]!.name, 'login');
assert.equal(byBody[0]!.field, 'body');
assert.equal(byBody[0]!.section, 'body');

// Scripts are searchable.
const byTest = searchCollections(sources, 'have.status');
assert.ok(byTest.some((hit) => hit.field === 'tests' && hit.section === 'tests'));

// Headers are searchable.
const byHeader = searchCollections(sources, 'trace-secret');
assert.ok(byHeader.some((hit) => hit.name === 'profile' && hit.field === 'header'));

// Folders match by name.
const byFolder = searchCollections(sources, 'Auth');
assert.ok(byFolder.some((hit) => hit.kind === 'folder' && hit.name === 'Auth'));

console.log('collection search checks passed');
