/** Shared copy + classification when the `newman` binary is missing from PATH. */

export const NEWMAN_INSTALL_COMMAND = 'npm install -g newman';

export const NEWMAN_MISSING_ERROR =
  'Newman was not found on PATH. Install it with: npm install -g newman';

export const NEWMAN_MISSING_HINTS = [
  'Clara runs requests via the Newman CLI.',
  `Install globally: ${NEWMAN_INSTALL_COMMAND}`,
  'Then restart Clara (GUI apps on macOS may not see a freshly updated shell PATH until relaunch).',
  'Verify in a terminal: newman --version'
] as const;

export function isNewmanNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return /not found|ENOENT/i.test(String(error));
  }
  const err = error as NodeJS.ErrnoException;
  if (err.code === 'ENOENT') {
    return true;
  }
  return /not found|ENOENT/i.test(err.message ?? String(error));
}

export function newmanMissingRunView(command: string, stderr = ''): {
  ok: false;
  exitCode: null;
  command: string;
  stderr: string;
  error: string;
  missingNewman: true;
  executions: [];
  execution: null;
  failures: [];
} {
  return {
    ok: false,
    exitCode: null,
    command,
    stderr,
    error: NEWMAN_MISSING_ERROR,
    missingNewman: true,
    executions: [],
    execution: null,
    failures: []
  };
}
