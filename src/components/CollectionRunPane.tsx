import { useState, type MouseEvent, type ReactNode } from 'react';
import {
  executionStatusTone,
  type NewmanExecutionView,
  type NewmanRunView
} from '../newman/parseResult.ts';
import NewmanMissingGuide from './NewmanMissingGuide.tsx';
import './CollectionRunPane.css';

type CollectionRunPaneProps = {
  title: string;
  subtitle: string;
  runLabel: string;
  requestCount: number;
  result: NewmanRunView | null;
  running: boolean;
  onRun: () => void;
  onNewRequest?: () => void;
  onNewmanReady?: (version: string) => void;
  /** Reveal the request for this run row in the sidebar tree. */
  onRevealRequest?: (execution: NewmanExecutionView, index: number) => void;
  /** Re-run a single row, replacing only that result. */
  onRerunRequest?: (execution: NewmanExecutionView, index: number) => void;
  /** Index of the row currently being re-run. */
  rerunningIndex?: number | null;
  onContextMenu?: (
    event: MouseEvent<HTMLElement>,
    execution: NewmanExecutionView,
    index: number
  ) => void;
  variablesSlot?: ReactNode;
};

type DetailSection = 'body' | 'headers' | 'tests';

function formatBytes(size: number | null): string {
  if (size == null) {
    return '—';
  }
  if (size < 1024) {
    return `${size} B`;
  }
  return `${(size / 1024).toFixed(1)} KB`;
}

function assertionSummary(execution: NewmanExecutionView): {
  passed: number;
  total: number;
} {
  const total = execution.assertions.length;
  const passed = execution.assertions.filter((assertion) => assertion.ok).length;
  return { passed, total };
}

function ExecutionDetail({ execution }: { execution: NewmanExecutionView }) {
  const [section, setSection] = useState<DetailSection>('body');

  return (
    <div className="collection-run-detail">
      <div className="collection-run-detail-meta">
        <span className="collection-run-url" title={execution.url}>
          {execution.url || '(no url)'}
        </span>
        <span>{formatBytes(execution.responseSize)}</span>
      </div>

      <div className="collection-run-detail-tabs" role="tablist">
        {(
          [
            { key: 'body', label: 'Body' },
            { key: 'headers', label: 'Headers', count: execution.headers.length },
            {
              key: 'tests',
              label: 'Tests',
              count: execution.assertions.length
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
          </button>
        ))}
      </div>

      <div className="collection-run-detail-body">
        {section === 'body' && (
          <pre>{execution.body || '(empty body)'}</pre>
        )}
        {section === 'headers' && (
          <table>
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
          <ul className="collection-run-assertions">
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
    </div>
  );
}

export default function CollectionRunPane({
  title,
  subtitle,
  runLabel,
  requestCount,
  result,
  running,
  onRun,
  onNewRequest,
  onNewmanReady,
  onRevealRequest,
  onRerunRequest,
  rerunningIndex = null,
  onContextMenu,
  variablesSlot
}: CollectionRunPaneProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const executions = result?.executions ?? [];
  const totalAssertions = executions.reduce(
    (sum, execution) => sum + execution.assertions.length,
    0
  );
  const passedAssertions = executions.reduce(
    (sum, execution) =>
      sum + execution.assertions.filter((assertion) => assertion.ok).length,
    0
  );
  const scriptRequests = executions.reduce(
    (sum, execution) => sum + execution.scriptRequests,
    0
  );
  const failedRequests = executions.filter((execution) => {
    const { passed, total } = assertionSummary(execution);
    return (
      (total > 0 && passed < total) ||
      (execution.code != null && execution.code >= 400 && total === 0)
    );
  }).length;

  return (
    <section className="collection-run-pane">
      <header className="collection-run-header">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <div className="collection-run-actions">
          {onNewRequest ? (
            <button
              type="button"
              className="collection-run-button secondary"
              onClick={onNewRequest}
              title="New Request"
            >
              New Request
            </button>
          ) : null}
          <button
            type="button"
            className="collection-run-button"
            disabled={running || rerunningIndex != null || requestCount === 0}
            onClick={onRun}
            title={runLabel}
          >
            {running ? 'Running…' : runLabel}
          </button>
        </div>
      </header>

      {variablesSlot}

      {running && (
        <div className="collection-run-banner running">Calling Newman…</div>
      )}

      {result && !running && result.missingNewman ? (
        <NewmanMissingGuide compact onReady={onNewmanReady} />
      ) : null}

      {result && !running && !result.missingNewman && (
        <div
          className={`collection-run-banner ${result.ok ? 'ok' : 'failed'}`}
        >
          <span>
            {executions.length} request{executions.length === 1 ? '' : 's'}
            {scriptRequests > 0 ? ` (+${scriptRequests} from scripts)` : ''}
            {totalAssertions > 0
              ? ` · tests ${passedAssertions}/${totalAssertions}`
              : ''}
            {failedRequests > 0 ? ` · ${failedRequests} with issues` : ''}
          </span>
          {result.error ? <span>{result.error}</span> : null}
        </div>
      )}

      {result?.stderr.trim() && !running && !result.missingNewman ? (
        <pre className="collection-run-stderr">{result.stderr.trim()}</pre>
      ) : null}

      {!result && !running && (
        <div className="collection-run-empty">
          <p>No run yet.</p>
          <p>Click Run collection to execute every request in order.</p>
        </div>
      )}

      {executions.length > 0 && !running && (
        <ul className="collection-run-list">
          {executions.map((execution, index) => {
            const { passed, total } = assertionSummary(execution);
            const tone = executionStatusTone(execution);
            const open = expandedIndex === index;
            const rerunning = rerunningIndex === index;
            return (
              <li key={`${execution.name}-${index}`} className={open ? 'open' : ''}>
                <div
                  className={`collection-run-row-wrap ${rerunning ? 'rerunning' : ''}`.trim()}
                  onContextMenu={(event) => onContextMenu?.(event, execution, index)}
                >
                  <button
                    type="button"
                    className="collection-run-row"
                    onClick={() => {
                      setExpandedIndex(open ? null : index);
                      onRevealRequest?.(execution, index);
                    }}
                    aria-expanded={open}
                  >
                    <span
                      className={`collection-run-method method-${execution.method.toLowerCase()}`}
                    >
                      {execution.method}
                    </span>
                    <span className="collection-run-label">
                      <span className="collection-run-name" title={execution.name}>
                        {execution.name}
                      </span>
                      {execution.scriptRequests > 0 ? (
                        <span
                          className="collection-run-script-requests"
                          title={`${execution.scriptRequests} extra request${
                            execution.scriptRequests === 1 ? '' : 's'
                          } sent by pm.sendRequest in this item's scripts`}
                        >
                          +{execution.scriptRequests}
                        </span>
                      ) : null}
                    </span>
                    <span className={`collection-run-status status-${tone}`}>
                      {execution.code ?? '—'} {execution.status}
                    </span>
                    <span className="collection-run-time">
                      {execution.responseTime != null
                        ? `${execution.responseTime} ms`
                        : '—'}
                    </span>
                    {total > 0 ? (
                      <span className="collection-run-tests">
                        <span
                          className={`test-result-dot ${
                            passed === total ? 'passed' : 'failed'
                          }`}
                        />
                        ({passed}/{total})
                      </span>
                    ) : (
                      <span className="collection-run-tests muted">—</span>
                    )}
                    <span className="collection-run-chevron" aria-hidden>
                      {open ? '▾' : '▸'}
                    </span>
                  </button>
                  {onRerunRequest ? (
                    <button
                      type="button"
                      className="collection-run-rerun"
                      disabled={running || rerunningIndex != null}
                      aria-label={`Run ${execution.name} again`}
                      title={`Run ${execution.name} again — keeps the rest of this run`}
                      onClick={() => onRerunRequest(execution, index)}
                    >
                      <span aria-hidden>{rerunning ? '⟳' : '↻'}</span>
                    </button>
                  ) : null}
                </div>
                {open ? <ExecutionDetail execution={execution} /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
