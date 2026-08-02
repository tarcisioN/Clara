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
import {
  parseNewmanJsonReport,
  replaceRunExecution
} from '../src/newman/parseResult.ts';

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
assert.equal(multi.executions[0]?.scriptRequests, 0);

// pm.sendRequest calls repeat the item under the same cursor.ref — collapse them
const fanout = parseNewmanJsonReport(
  JSON.stringify({
    run: {
      executions: [
        {
          cursor: { ref: 'ref-a' },
          item: { name: 'Throttle' },
          request: { method: 'GET', url: 'https://example.com/a' },
          response: { code: 429, status: 'Too Many Requests', header: [], stream: { type: 'Buffer', data: [] }, responseTime: 1, responseSize: 0 },
          assertions: [{ assertion: 'is 429' }]
        },
        {
          cursor: { ref: 'ref-a' },
          item: { name: 'Throttle' },
          request: { method: 'GET', url: 'https://example.com/a' },
          response: { code: 429, status: 'Too Many Requests', header: [], stream: { type: 'Buffer', data: [] }, responseTime: 1, responseSize: 0 },
          assertions: [{ assertion: 'is 429' }]
        },
        {
          cursor: { ref: 'ref-a' },
          item: { name: 'Throttle' },
          request: { method: 'GET', url: 'https://example.com/a' },
          response: { code: 429, status: 'Too Many Requests', header: [], stream: { type: 'Buffer', data: [] }, responseTime: 1, responseSize: 0 },
          assertions: [{ assertion: 'is 429' }]
        },
        {
          cursor: { ref: 'ref-b' },
          item: { name: 'Next' },
          request: { method: 'GET', url: 'https://example.com/b' },
          response: { code: 200, status: 'OK', header: [], stream: { type: 'Buffer', data: [] }, responseTime: 3, responseSize: 0 },
          assertions: []
        }
      ],
      failures: []
    }
  }),
  { exitCode: 0, command: 'newman run …', stderr: '' }
);
assert.equal(fanout.executions.length, 2);
assert.equal(fanout.executions[0]?.name, 'Throttle');
assert.equal(fanout.executions[0]?.scriptRequests, 2);
assert.equal(fanout.executions[0]?.assertions.length, 1);
assert.equal(fanout.executions[1]?.name, 'Next');
assert.equal(fanout.executions[1]?.scriptRequests, 0);

// Re-running one row patches that row only and leaves the rest of the run intact
const rerun = replaceRunExecution(multi, 1, {
  ...multi.executions[1]!,
  code: 200,
  status: 'OK',
  responseTime: 9
});
assert.equal(rerun.executions.length, 2);
assert.equal(rerun.executions[0]?.name, 'A');
assert.equal(rerun.executions[0]?.responseTime, 1);
assert.equal(rerun.executions[1]?.code, 200);
assert.equal(rerun.executions[1]?.responseTime, 9);
assert.equal(rerun.ok, true);
assert.equal(multi.executions[1]?.code, 500);
assert.equal(replaceRunExecution(multi, 7, multi.executions[0]!), multi);

import {
  TERMINAL_MAX_ENTRIES,
  buildTerminalEntry,
  nextTerminalEntries,
  truncateTerminalText
} from '../src/components/terminalBuffer.ts';

assert.equal(truncateTerminalText('short'), 'short');
const long = 'x'.repeat(300_000);
const truncated = truncateTerminalText(long);
assert.equal(truncated.length < long.length, true);
assert.equal(truncated.startsWith('x'.repeat(256_000)), true);
assert.match(truncated, /truncated .* characters/);

const sample = buildTerminalEntry('Ping', {
  command: 'newman run …',
  stdout: 'ok',
  stderr: '',
  exitCode: 0,
  ok: true
});
assert.equal(sample.label, 'Ping');
assert.equal(sample.stdout, 'ok');

const first = { ...sample, id: '1' };
const second = { ...sample, id: '2' };
assert.deepEqual(nextTerminalEntries([first], second, false), [second]);
assert.equal(nextTerminalEntries([first], second, true).map((e) => e.id).join(','), '1,2');
const many = Array.from({ length: TERMINAL_MAX_ENTRIES }, (_, i) => ({
  ...sample,
  id: String(i)
}));
assert.equal(nextTerminalEntries(many, { ...sample, id: 'new' }, true).length, TERMINAL_MAX_ENTRIES);
assert.equal(nextTerminalEntries(many, { ...sample, id: 'new' }, true).at(-1)?.id, 'new');
assert.equal(nextTerminalEntries(many, { ...sample, id: 'new' }, true)[0]?.id, '1');

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
