import { spawn } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** GUI apps on macOS often miss shell PATH (asdf/nvm/homebrew). */
function gitEnv(): NodeJS.ProcessEnv {
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

function runGit(
  cwd: string,
  args: string[]
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      env: gitEnv()
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

export type GitDiscoverResult =
  | {
      inRepo: true;
      repoRoot: string;
      relPath: string;
      currentBranch: string | null;
      defaultBase: string;
      branches: string[];
    }
  | { inRepo: false };

export type GitReadAtRefResult =
  | { raw: string; missing?: false }
  | { raw: null; missing: true };

/** `git show ref:path` failing because the file is untracked at that ref, not a real error. */
export function isPathMissingAtRef(stderr: string): boolean {
  return (
    /exists on disk, but not in/i.test(stderr) ||
    /does not exist in ['"]?[^'"]*['"]?/i.test(stderr) ||
    /path '.*' does not exist/i.test(stderr)
  );
}

/** Walk parents for `.git`, then confirm with `rev-parse --show-toplevel`. */
export async function findRepoRoot(startPath: string): Promise<string | null> {
  const start = path.resolve(startPath);
  let dir = path.extname(start) ? path.dirname(start) : start;

  while (true) {
    if (existsSync(path.join(dir, '.git'))) {
      const result = await runGit(dir, ['rev-parse', '--show-toplevel']);
      if (result.exitCode === 0) {
        const toplevel = result.stdout.trim();
        try {
          return realpathSync(toplevel);
        } catch {
          return toplevel;
        }
      }
      return null;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

export async function resolveDefaultBase(repoRoot: string): Promise<string> {
  const originHead = await runGit(repoRoot, [
    'symbolic-ref',
    '--quiet',
    '--short',
    'refs/remotes/origin/HEAD'
  ]);
  if (originHead.exitCode === 0) {
    const short = originHead.stdout.trim(); // e.g. origin/main
    const slash = short.lastIndexOf('/');
    if (slash >= 0 && slash < short.length - 1) {
      const name = short.slice(slash + 1);
      if (await refExists(repoRoot, name)) {
        return name;
      }
      if (await refExists(repoRoot, short)) {
        return short;
      }
    }
  }

  if (await refExists(repoRoot, 'main')) {
    return 'main';
  }
  if (await refExists(repoRoot, 'master')) {
    return 'master';
  }

  const current = await runGit(repoRoot, ['branch', '--show-current']);
  if (current.exitCode === 0 && current.stdout.trim()) {
    return current.stdout.trim();
  }

  return 'HEAD';
}

async function refExists(repoRoot: string, ref: string): Promise<boolean> {
  const result = await runGit(repoRoot, ['rev-parse', '--verify', '--quiet', ref]);
  return result.exitCode === 0;
}

export async function listBranches(repoRoot: string): Promise<string[]> {
  const result = await runGit(repoRoot, [
    'for-each-ref',
    '--format=%(refname:short)',
    'refs/heads',
    'refs/remotes'
  ]);
  if (result.exitCode !== 0) {
    return [];
  }
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.endsWith('/HEAD'));
}

export async function currentBranch(repoRoot: string): Promise<string | null> {
  const result = await runGit(repoRoot, ['branch', '--show-current']);
  if (result.exitCode !== 0) {
    return null;
  }
  const name = result.stdout.trim();
  return name.length > 0 ? name : null;
}

/**
 * Read a tracked file at `ref` without checking it out.
 * `relPath` must use forward slashes as git expects.
 */
export async function readFileAtRef(
  repoRoot: string,
  ref: string,
  relPath: string
): Promise<GitReadAtRefResult> {
  if (!ref || typeof ref !== 'string') {
    throw new Error('ref is required');
  }
  if (!relPath || typeof relPath !== 'string') {
    throw new Error('relPath is required');
  }

  const gitPath = relPath.split(path.sep).join('/');
  const result = await runGit(repoRoot, ['show', `${ref}:${gitPath}`]);
  if (result.exitCode !== 0) {
    if (isPathMissingAtRef(result.stderr)) {
      return { raw: null, missing: true };
    }
    throw new Error(
      result.stderr.trim() || `git show failed for ${ref}:${gitPath}`
    );
  }
  return { raw: result.stdout };
}

export async function discoverGit(collectionPath: string): Promise<GitDiscoverResult> {
  if (!collectionPath || typeof collectionPath !== 'string') {
    throw new Error('collectionPath is required');
  }

  const absolute = path.resolve(collectionPath);
  let resolvedAbsolute = absolute;
  try {
    resolvedAbsolute = realpathSync(absolute);
  } catch {
    // File may not exist yet; still allow discover from its directory.
  }
  const repoRoot = await findRepoRoot(resolvedAbsolute);
  if (!repoRoot) {
    return { inRepo: false };
  }

  const relPath = path.relative(repoRoot, resolvedAbsolute);
  if (!relPath || relPath.startsWith('..') || path.isAbsolute(relPath)) {
    return { inRepo: false };
  }

  const [branch, defaultBase, branches] = await Promise.all([
    currentBranch(repoRoot),
    resolveDefaultBase(repoRoot),
    listBranches(repoRoot)
  ]);

  return {
    inRepo: true,
    repoRoot,
    relPath,
    currentBranch: branch,
    defaultBase,
    branches
  };
}

export async function readCollectionAtRef(
  collectionPath: string,
  ref: string
): Promise<GitReadAtRefResult> {
  const discovered = await discoverGit(collectionPath);
  if (!discovered.inRepo) {
    throw new Error('Path is not inside a git repository');
  }
  return readFileAtRef(discovered.repoRoot, ref, discovered.relPath);
}
