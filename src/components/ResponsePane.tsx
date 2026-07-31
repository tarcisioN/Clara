import { useState } from 'react';
import { executionStatusTone, type NewmanRunView } from '../newman/parseResult.ts';
import NewmanMissingGuide from './NewmanMissingGuide.tsx';
import './ResponsePane.css';

type ResponsePaneProps = {
  result: NewmanRunView | null;
  running: boolean;
};

type ResponseSection = 'body' | 'headers' | 'tests';

function formatBytes(size: number | null): string {
  if (size == null) {
    return '—';
  }
  if (size < 1024) {
    return `${size} B`;
  }
  return `${(size / 1024).toFixed(1)} KB`;
}

export default function ResponsePane({ result, running }: ResponsePaneProps) {
  const [section, setSection] = useState<ResponseSection>('body');
  const execution = result?.execution ?? null;
  const testTotal = execution?.assertions.length ?? 0;
  const testsPassed = execution?.assertions.filter((assertion) => assertion.ok).length ?? 0;
  const testsFailed = testTotal - testsPassed;
  const statusTone = execution ? executionStatusTone(execution) : 'unknown';
  const failedAssertionNames = new Set(
    execution?.assertions
      .filter((assertion) => !assertion.ok)
      .map((assertion) => assertion.name) ?? []
  );
  const runtimeFailures =
    result?.failures.filter((failure) => !failedAssertionNames.has(failure.name)) ?? [];

  return (
    <section className="response-pane">
      <div className="response-toolbar">
        <strong>Response</strong>
        {running && <span className="response-running">Running…</span>}
        {!running && execution && (
          <>
            <span
              className={`response-status status-${statusTone}`}
              title={
                testTotal > 0 && testsPassed === testTotal
                  ? `HTTP ${execution.code ?? '—'}; all ${testTotal} tests passed`
                  : testsFailed > 0
                    ? `HTTP ${execution.code ?? '—'}; ${testsFailed} test${
                        testsFailed === 1 ? '' : 's'
                      } failed`
                    : undefined
              }
            >
              {execution.code ?? '—'} {execution.status}
            </span>
            <span className="response-meta">
              {execution.responseTime != null ? `${execution.responseTime} ms` : '—'}
            </span>
            <span className="response-meta">{formatBytes(execution.responseSize)}</span>
            <span className="response-meta response-method">
              {execution.method}
            </span>
          </>
        )}
        {!running && result && !result.ok && (
          <span className="response-status status-error">
            {result.missingNewman ? 'Newman missing' : 'Failed'}
          </span>
        )}
      </div>

      {!result && !running && (
        <div className="response-empty">
          <p>Send a request to see the response.</p>
          <p className="response-empty-hint">
            Newman runs unsaved edits from memory — Save is not required.
          </p>
        </div>
      )}

      {running && (
        <div className="response-empty">
          <p>Calling Newman…</p>
        </div>
      )}

      {result && !running && result.missingNewman ? (
        <div className="response-errors">
          <NewmanMissingGuide />
        </div>
      ) : null}

      {result && !running && !result.missingNewman && (
        <>
          {(result.error || runtimeFailures.length > 0 || result.stderr.trim()) && (
            <div className="response-errors">
              {result.error ? <p>{result.error}</p> : null}
              {runtimeFailures.map((failure, index) => (
                <p key={`${failure.name}-${index}`}>
                  <strong>{failure.name}</strong>: {failure.message}
                </p>
              ))}
              {result.stderr.trim() ? (
                <pre className="response-stderr">{result.stderr.trim()}</pre>
              ) : null}
            </div>
          )}

          {execution && (
            <>
              <div className="response-section-tabs" role="tablist" aria-label="Response">
                {(
                  [
                    { key: 'body', label: 'Body' },
                    { key: 'headers', label: 'Headers', count: execution.headers.length },
                    {
                      key: 'tests',
                      label: 'Test results',
                      tests: true
                    }
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={section === tab.key}
                    className={section === tab.key ? 'active' : ''}
                    onClick={() => setSection(tab.key)}
                  >
                    {tab.label}
                    {'count' in tab && tab.count ? (
                      <span className="tab-count">{tab.count}</span>
                    ) : null}
                    {'tests' in tab && testTotal > 0 ? (
                      <>
                        <span
                          className={`test-result-dot ${
                            testsPassed === testTotal ? 'passed' : 'failed'
                          }`}
                          title={
                            testsPassed === testTotal
                              ? 'All tests passed'
                              : `${testTotal - testsPassed} test${
                                  testTotal - testsPassed === 1 ? '' : 's'
                                } failed`
                          }
                        />
                        <span className="test-result-count">
                          ({testsPassed}/{testTotal})
                        </span>
                      </>
                    ) : null}
                  </button>
                ))}
              </div>

              <div className="response-section-content">
                {section === 'body' && (
                  <pre className="response-body">{execution.body || '(empty body)'}</pre>
                )}
                {section === 'headers' && (
                  <table className="response-headers">
                    <thead>
                      <tr>
                        <th>Key</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {execution.headers.length === 0 ? (
                        <tr>
                          <td colSpan={2}>No response headers</td>
                        </tr>
                      ) : (
                        execution.headers.map((header, index) => (
                          <tr key={`${header.key}-${index}`}>
                            <td>{header.key}</td>
                            <td>{header.value}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
                {section === 'tests' && (
                  <ul className="response-assertions">
                    {execution.assertions.length === 0 ? (
                      <li className="muted">No test assertions ran.</li>
                    ) : (
                      execution.assertions.map((assertion, index) => (
                        <li
                          key={`${assertion.name}-${index}`}
                          className={assertion.ok ? 'pass' : 'fail'}
                        >
                          <span>{assertion.ok ? '✓' : '✕'}</span>
                          <div>
                            <strong>{assertion.name}</strong>
                            {assertion.error ? <p>{assertion.error}</p> : null}
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
