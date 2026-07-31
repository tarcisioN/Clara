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
};

export type NewmanRunView = {
  ok: boolean;
  exitCode: number | null;
  command: string;
  stderr: string;
  error?: string;
  execution: NewmanExecutionView | null;
  failures: Array<{ name: string; message: string }>;
};

type NewmanJsonReport = {
  run?: {
    executions?: Array<{
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
      execution: null,
      failures: []
    };
  }

  const execution = report.run?.executions?.[0];
  const response = execution?.response ?? null;
  const headers = (response?.header ?? [])
    .filter((header) => typeof header?.key === 'string')
    .map((header) => ({
      key: header.key ?? '',
      value: header.value ?? ''
    }));

  const assertions: NewmanAssertion[] = (execution?.assertions ?? []).map((assertion) => ({
    name: assertion.assertion ?? 'assertion',
    ok: !assertion.error,
    error: assertion.error?.message
  }));

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
    execution: execution
      ? {
          name: execution.item?.name ?? 'Request',
          method: (execution.request?.method ?? 'GET').toUpperCase(),
          url: urlToString(execution.request?.url),
          code: response?.code ?? null,
          status: response?.status ?? '',
          responseTime: response?.responseTime ?? null,
          responseSize: response?.responseSize ?? null,
          headers,
          body: decodeStream(response?.stream),
          assertions
        }
      : null,
    failures
  };
}
