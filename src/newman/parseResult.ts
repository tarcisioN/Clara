export type NewmanResponseHeader = {
  key: string;
  value: string;
};

export type NewmanAssertion = {
  name: string;
  ok: boolean;
  error?: string;
};

export type NewmanExecutionView = {
  name: string;
  method: string;
  url: string;
  code: number | null;
  status: string;
  responseTime: number | null;
  responseSize: number | null;
  headers: NewmanResponseHeader[];
  body: string;
  assertions: NewmanAssertion[];
  /**
   * Extra HTTP calls Newman reported under the same item, i.e. requests fired by
   * `pm.sendRequest` inside pre-request/test scripts.
   */
  scriptRequests: number;
};

export type NewmanRunView = {
  ok: boolean;
  exitCode: number | null;
  command: string;
  stderr: string;
  error?: string;
  /** True when the newman binary was not found on PATH. */
  missingNewman?: boolean;
  /** All request executions from the Newman report. */
  executions: NewmanExecutionView[];
  /** Convenience: first execution (single-request runs). */
  execution: NewmanExecutionView | null;
  failures: Array<{ name: string; message: string }>;
};

type NewmanJsonReport = {
  run?: {
    executions?: Array<{
      cursor?: { ref?: string };
      item?: { name?: string };
      request?: {
        method?: string;
        url?: unknown;
      };
      response?: {
        code?: number;
        status?: string;
        header?: Array<{ key?: string; value?: string }>;
        stream?: { type?: string; data?: number[] } | string;
        responseTime?: number;
        responseSize?: number;
      } | null;
      assertions?: Array<{
        assertion?: string;
        error?: { message?: string; name?: string };
      }>;
    }>;
    failures?: Array<{
      error?: { name?: string; message?: string; test?: string };
      at?: string;
      source?: { name?: string };
    }>;
    error?: { message?: string; name?: string } | null;
  };
};

function decodeStream(stream: unknown): string {
  if (stream == null) {
    return '';
  }
  if (typeof stream === 'string') {
    return stream;
  }
  if (typeof stream === 'object' && stream !== null && 'data' in stream) {
    const data = (stream as { data?: unknown }).data;
    if (Array.isArray(data)) {
      return new TextDecoder().decode(Uint8Array.from(data as number[]));
    }
  }
  return '';
}

function urlToString(url: unknown): string {
  if (typeof url === 'string') {
    return url;
  }
  if (url && typeof url === 'object') {
    const raw = (url as { raw?: unknown }).raw;
    if (typeof raw === 'string') {
      return raw;
    }
    const href = (url as { href?: unknown }).href;
    if (typeof href === 'string') {
      return href;
    }
  }
  return '';
}

function mapExecution(
  execution: NonNullable<NonNullable<NewmanJsonReport['run']>['executions']>[number]
): NewmanExecutionView {
  const response = execution.response ?? null;
  const headers = (response?.header ?? [])
    .filter((header) => typeof header?.key === 'string')
    .map((header) => ({
      key: header.key ?? '',
      value: header.value ?? ''
    }));

  return {
    name: execution.item?.name ?? 'Request',
    method: (execution.request?.method ?? 'GET').toUpperCase(),
    url: urlToString(execution.request?.url),
    code: response?.code ?? null,
    status: response?.status ?? '',
    responseTime: response?.responseTime ?? null,
    responseSize: response?.responseSize ?? null,
    headers,
    body: decodeStream(response?.stream),
    assertions: (execution.assertions ?? []).map((assertion) => ({
      name: assertion.assertion ?? 'assertion',
      ok: !assertion.error,
      error: assertion.error?.message
    })),
    scriptRequests: 0
  };
}

/**
 * Newman pushes one entry per HTTP call, so every `pm.sendRequest` from a script
 * shows up as a repeat of the item that fired it (same `cursor.ref`). Collapse
 * them into a single row and keep the count of the script-issued calls.
 */
function collapseScriptRequests(
  executions: NonNullable<NonNullable<NewmanJsonReport['run']>['executions']>
): NewmanExecutionView[] {
  const collapsed: NewmanExecutionView[] = [];
  const indexByRef = new Map<string, number>();

  for (const raw of executions) {
    const view = mapExecution(raw);
    const ref = typeof raw.cursor?.ref === 'string' ? raw.cursor.ref : null;
    if (ref) {
      const seen = indexByRef.get(ref);
      if (seen != null) {
        collapsed[seen] = {
          ...view,
          scriptRequests: collapsed[seen].scriptRequests + 1
        };
        continue;
      }
      indexByRef.set(ref, collapsed.length);
    }
    collapsed.push(view);
  }

  return collapsed;
}

/** Status color for the response toolbar / collection run rows. */
export function executionStatusTone(
  execution: Pick<NewmanExecutionView, 'code' | 'assertions'>
): 'tests-passed' | 'tests-failed' | 'ok' | 'redirect' | 'error' | 'unknown' {
  const total = execution.assertions.length;
  const passed = execution.assertions.filter((assertion) => assertion.ok).length;
  if (total > 0 && passed === total) {
    return 'tests-passed';
  }
  if (
    total > passed &&
    execution.code != null &&
    execution.code >= 200 &&
    execution.code < 300
  ) {
    return 'tests-failed';
  }
  const code = execution.code;
  if (code == null) {
    return 'unknown';
  }
  if (code >= 200 && code < 300) {
    return 'ok';
  }
  if (code >= 300 && code < 400) {
    return 'redirect';
  }
  if (code >= 400) {
    return 'error';
  }
  return 'unknown';
}

/** Normalize Newman `--reporter-json-export` output for the response pane. */
export function parseNewmanJsonReport(
  raw: string,
  meta: { exitCode: number | null; command: string; stderr: string }
): NewmanRunView {
  let report: NewmanJsonReport;
  try {
    report = JSON.parse(raw) as NewmanJsonReport;
  } catch {
    return {
      ok: false,
      exitCode: meta.exitCode,
      command: meta.command,
      stderr: meta.stderr,
      error: 'Could not parse Newman JSON report',
      executions: [],
      execution: null,
      failures: []
    };
  }

  const executions = collapseScriptRequests(report.run?.executions ?? []);

  const failures = (report.run?.failures ?? []).map((failure) => ({
    name: failure.error?.test ?? failure.source?.name ?? failure.error?.name ?? 'failure',
    message: failure.error?.message ?? failure.at ?? 'Unknown failure'
  }));

  const runError = report.run?.error?.message;
  const ok = meta.exitCode === 0 && failures.length === 0 && !runError;

  return {
    ok,
    exitCode: meta.exitCode,
    command: meta.command,
    stderr: meta.stderr,
    error: runError,
    executions,
    execution: executions[0] ?? null,
    failures
  };
}
