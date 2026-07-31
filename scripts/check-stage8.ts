import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertPostmanCollection,
  serializeCollection
} from '../src/postman/types.ts';
import { getItemByPath } from '../src/postman/tree.ts';
import {
  buildSingleRequestCollection,
  resolveInheritedAuth
} from '../src/newman/buildRunCollection.ts';
import { parseNewmanJsonReport } from '../src/newman/parseResult.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, '../fixtures/smoke.postman_collection.json');
const collection = assertPostmanCollection(JSON.parse(readFileSync(fixturePath, 'utf8')));

const pingRun = buildSingleRequestCollection(collection, '0.0');
assert.equal(pingRun.item?.length, 1);
assert.equal(pingRun.item?.[0]?.name, 'Ping');
assert.equal(Array.isArray(pingRun.item?.[0]?.item), false);

// Folder apikey is materialized onto the request for the temp collection
const pingAuth =
  typeof pingRun.item?.[0]?.request === 'object' ? pingRun.item?.[0]?.request?.auth : undefined;
assert.equal(pingAuth?.type, 'apikey');
assert.equal(resolveInheritedAuth(collection, '0.0')?.type, 'apikey');

// Own request auth wins (Root echo bearer) — no overwrite from collection
const echoRun = buildSingleRequestCollection(collection, '1');
const echoAuth =
  typeof echoRun.item?.[0]?.request === 'object' ? echoRun.item?.[0]?.request?.auth : undefined;
assert.equal(echoAuth?.type, 'bearer');

// Original collection is not mutated — Ping still has no request.auth
const originalPing = getItemByPath(collection.item, '0.0')!;
assert.equal(
  typeof originalPing.request === 'object' ? originalPing.request.auth : undefined,
  undefined
);

const serialized = serializeCollection(pingRun);
assert.match(serialized, /Clara run — Ping/);
assert.match(serialized, /"listen": "prerequest"/);

const report = {
  run: {
    executions: [
      {
        item: { name: 'Ping' },
        request: {
          method: 'GET',
          url: 'https://example.com/ping'
        },
        response: {
          code: 200,
          status: 'OK',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          stream: { type: 'Buffer', data: [...Buffer.from('{"ok":true}', 'utf8')] },
          responseTime: 42,
          responseSize: 11
        },
        assertions: [
          { assertion: 'status is 200' },
          { assertion: 'body ok', error: { message: 'expected true' } }
        ]
      }
    ],
    failures: [
      {
        error: { test: 'body ok', message: 'expected true' },
        source: { name: 'Ping' }
      }
    ]
  }
};

const parsed = parseNewmanJsonReport(JSON.stringify(report), {
  exitCode: 1,
  command: 'newman run …',
  stderr: ''
});
assert.equal(parsed.ok, false);
assert.equal(parsed.executions.length, 1);
assert.equal(parsed.execution?.code, 200);
assert.equal(parsed.execution?.body, '{"ok":true}');
assert.equal(parsed.execution?.headers[0]?.key, 'Content-Type');
assert.equal(parsed.execution?.assertions[0]?.ok, true);
assert.equal(parsed.execution?.assertions[1]?.ok, false);
assert.equal(parsed.failures[0]?.name, 'body ok');
assert.equal(parsed.executions[0]?.name, 'Ping');

const multi = parseNewmanJsonReport(
  JSON.stringify({
    run: {
      executions: [
        {
          item: { name: 'A' },
          request: { method: 'GET', url: 'https://example.com/a' },
          response: { code: 200, status: 'OK', header: [], stream: { type: 'Buffer', data: [] }, responseTime: 1, responseSize: 0 },
          assertions: [{ assertion: 'ok' }]
        },
        {
          item: { name: 'B' },
          request: { method: 'POST', url: 'https://example.com/b' },
          response: { code: 500, status: 'Error', header: [], stream: { type: 'Buffer', data: [] }, responseTime: 2, responseSize: 0 },
          assertions: []
        }
      ],
      failures: []
    }
  }),
  { exitCode: 0, command: 'newman run …', stderr: '' }
);
assert.equal(multi.executions.length, 2);
assert.equal(multi.execution?.name, 'A');
assert.equal(multi.executions[1]?.method, 'POST');

import {
  isNewmanNotFoundError,
  newmanMissingRunView,
  NEWMAN_DOCS_URL,
  NEWMAN_INSTALL_COMMAND,
  NEWMAN_MISSING_ERROR
} from '../src/newman/missing.ts';

assert.equal(isNewmanNotFoundError({ code: 'ENOENT', message: 'spawn newman ENOENT' }), true);
assert.equal(isNewmanNotFoundError(new Error('command not found: newman')), true);
assert.equal(isNewmanNotFoundError(new Error('permission denied')), false);

const missing = newmanMissingRunView('newman run …', 'spawn ENOENT');
assert.equal(missing.ok, false);
assert.equal(missing.missingNewman, true);
assert.equal(missing.error, NEWMAN_MISSING_ERROR);
assert.equal(missing.executions.length, 0);

assert.equal(NEWMAN_INSTALL_COMMAND, 'npm install -g newman');
assert.match(NEWMAN_DOCS_URL, /^https:\/\/learning\.postman\.com\//);

console.log('stage8 checks passed');
