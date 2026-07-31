import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { CLARA_HOME } from './session.ts';
import { parseNewmanJsonReport, type NewmanRunView } from '../src/newman/parseResult.ts';

export type { NewmanRunView };

export type NewmanRunRequest = {
  /** Serialized Postman collection (usually a single-request temp collection). */
  collectionJson: string;
  /** Newman `--folder` name; runs only that folder when set. */
  folder?: string;
};

const RUNS_DIR = path.join(CLARA_HOME, 'runs');

/** GUI apps on macOS often miss shell PATH (asdf/nvm/homebrew). */
function newmanEnv(): NodeJS.ProcessEnv {
  const home = os.homedir();
  const extras = [
    path.join(home, '.asdf', 'shims'),
    path.join(home, '.local', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin'
  ];
  const current = process.env.PATH ?? '';
  return {
    ...process.env,
    PATH: [...extras, current].join(path.delimiter)
  };
}

function runCommand(
  command: string,
  args: string[]
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: newmanEnv()
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      reject(error);
    });
    child.on('close', (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
}

export async function runNewmanCollection(
  payload: NewmanRunRequest
): Promise<NewmanRunView> {
  if (!payload?.collectionJson || typeof payload.collectionJson !== 'string') {
    throw new Error('collectionJson is required');
  }

  await mkdir(RUNS_DIR, { recursive: true });
  const id = randomUUID();
  const collectionPath = path.join(RUNS_DIR, `${id}.collection.json`);
  const reportPath = path.join(RUNS_DIR, `${id}.result.json`);
  const args = [
    'run',
    collectionPath,
    ...(payload.folder ? ['--folder', payload.folder] : []),
    '--reporters',
    'json',
    '--reporter-json-export',
    reportPath,
    '--suppress-exit-code'
  ];
  const command = `newman ${args.map((arg) => JSON.stringify(arg)).join(' ')}`;

  try {
    await writeFile(collectionPath, payload.collectionJson, 'utf8');

    let spawned;
    try {
      spawned = await runCommand('newman', args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const notFound =
        (error as NodeJS.ErrnoException).code === 'ENOENT' ||
        /not found|ENOENT/i.test(message);
      return {
        ok: false,
        exitCode: null,
        command,
        stderr: message,
        error: notFound
          ? 'Newman was not found on PATH. Install it with: npm install -g newman'
          : message,
        executions: [],
        execution: null,
        failures: []
      };
    }

    let reportRaw = '';
    try {
      reportRaw = await readFile(reportPath, 'utf8');
    } catch {
      return {
        ok: false,
        exitCode: spawned.exitCode,
        command,
        stderr: spawned.stderr || spawned.stdout,
        error:
          spawned.stderr.trim() ||
          spawned.stdout.trim() ||
          'Newman did not write a JSON report',
        executions: [],
        execution: null,
        failures: []
      };
    }

    return parseNewmanJsonReport(reportRaw, {
      exitCode: spawned.exitCode,
      command,
      stderr: spawned.stderr
    });
  } finally {
    await Promise.allSettled([rm(collectionPath, { force: true }), rm(reportPath, { force: true })]);
  }
}
