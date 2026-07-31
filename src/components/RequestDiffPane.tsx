import type { ReactNode } from 'react';
import type { RequestSectionKey } from '../git/semanticDiff.ts';
import type {
  DiffAuth,
  DiffBody,
  DiffKeyedRow,
  DiffScalar,
  DiffTextBlock,
  RequestFieldDiff
} from '../git/requestFieldDiff.ts';
import './RequestDiffPane.css';

type RequestDiffPaneProps = {
  name: string;
  path: string;
  baseRef: string;
  fieldDiff: RequestFieldDiff;
  onSwitchToEdit: () => void;
  onRestoreRequest?: (() => void) | null;
  onRestoreSection?: ((section: RequestSectionKey) => void) | null;
};

const SECTION_LABELS: Record<RequestSectionKey, string> = {
  method: 'Method',
  url: 'URL',
  params: 'Params',
  headers: 'Headers',
  auth: 'Auth',
  body: 'Body',
  prerequest: 'Pre-request',
  tests: 'Tests'
};

function ChangeMark({ change }: { change: DiffKeyedRow['change'] | DiffScalar['kind'] }) {
  if (change === 'unchanged') {
    return null;
  }
  const label = change === 'added' ? '+' : change === 'removed' ? '−' : '~';
  return <span className={`request-diff-mark request-diff-mark-${change}`}>{label}</span>;
}

function StackedBars({
  label,
  base,
  current,
  baseMethod,
  currentMethod
}: {
  label: string;
  base: string;
  current: string;
  baseMethod?: string;
  currentMethod?: string;
}) {
  return (
    <div className="request-diff-stacked">
      <div className="request-diff-bar request-diff-bar-base" title={`Base (${label})`}>
        {baseMethod ? <span className="request-diff-method">{baseMethod}</span> : null}
        <span className="request-diff-bar-text">{base || '(empty)'}</span>
      </div>
      <div className="request-diff-bar request-diff-bar-current" title={`Current (${label})`}>
        {currentMethod ? <span className="request-diff-method">{currentMethod}</span> : null}
        <span className="request-diff-bar-text">{current || '(empty)'}</span>
      </div>
    </div>
  );
}

function KeyedRows({ rows }: { rows: DiffKeyedRow[] }) {
  if (rows.length === 0) {
    return <p className="request-diff-empty">No changes</p>;
  }
  return (
    <ul className="request-diff-keyed">
      {rows.map((row, index) => (
        <li key={`${row.change}:${row.key}:${index}`} className={`request-diff-keyed-row ${row.change}`}>
          <ChangeMark change={row.change} />
          <span className="request-diff-keyed-key">{row.key}</span>
          <div className="request-diff-keyed-values">
            {row.change !== 'added' ? (
              <div className="request-diff-value request-diff-value-base">
                <span className="request-diff-value-label">base</span>
                <code>
                  {row.baseValue ?? ''}
                  {row.baseDisabled ? <em> · disabled</em> : null}
                </code>
              </div>
            ) : null}
            {row.change !== 'removed' ? (
              <div className="request-diff-value request-diff-value-current">
                <span className="request-diff-value-label">current</span>
                <code>
                  {row.currentValue ?? ''}
                  {row.currentDisabled ? <em> · disabled</em> : null}
                </code>
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function TextDiffView({ block }: { block: DiffTextBlock }) {
  if (block.lines.length === 0) {
    return <p className="request-diff-empty">(empty)</p>;
  }
  const changed = block.lines.some((line) => line.kind !== 'equal');
  if (!changed) {
    return <p className="request-diff-empty">No changes</p>;
  }
  return (
    <pre className="request-diff-unified" aria-label="Unified diff">
      {block.lines.map((line, index) => (
        <div key={index} className={`request-diff-line request-diff-line-${line.kind}`}>
          <span className="request-diff-gutter">
            {line.kind === 'insert' ? '+' : line.kind === 'delete' ? '−' : ' '}
          </span>
          <span className="request-diff-linenos">
            <span>{line.baseLine ?? ''}</span>
            <span>{line.currentLine ?? ''}</span>
          </span>
          <span className="request-diff-line-text">{line.text || ' '}</span>
        </div>
      ))}
    </pre>
  );
}

function BodyDiff({ body }: { body: DiffBody }) {
  if (body.kind === 'none') {
    return <p className="request-diff-empty">No body</p>;
  }
  if (body.kind === 'raw') {
    return <TextDiffView block={body.text} />;
  }
  if (body.kind === 'urlencoded') {
    return <KeyedRows rows={body.list.rows} />;
  }
  if (body.kind === 'mode-change') {
    return (
      <div className="request-diff-mode-change">
        <p>
          Body mode changed: <code>{body.baseMode}</code> → <code>{body.currentMode}</code>
        </p>
        <StackedBars label="body" base={body.baseSummary} current={body.currentSummary} />
      </div>
    );
  }
  return <StackedBars label="body" base={body.baseSummary} current={body.currentSummary} />;
}

function AuthDiff({ auth }: { auth: DiffAuth }) {
  if (auth.kind === 'unchanged') {
    return <p className="request-diff-empty">No changes ({auth.typeLabel})</p>;
  }
  return (
    <div>
      {auth.baseType !== auth.currentType ? (
        <p className="request-diff-auth-type">
          Type: <code className="request-diff-value-base">{auth.baseType || '(none)'}</code>
          {' → '}
          <code className="request-diff-value-current">{auth.currentType || '(none)'}</code>
        </p>
      ) : null}
      <KeyedRows rows={auth.rows.filter((row) => row.key !== 'type' || auth.baseType === auth.currentType)} />
    </div>
  );
}

function Section({
  title,
  section,
  onRestore,
  children
}: {
  title: string;
  section: RequestSectionKey;
  onRestore?: ((section: RequestSectionKey) => void) | null;
  children: ReactNode;
}) {
  return (
    <section className="request-diff-section" data-section={section}>
      <header className="request-diff-section-header">
        <h3>{title}</h3>
        {onRestore ? (
          <button type="button" className="request-diff-restore" onClick={() => onRestore(section)}>
            Restore
          </button>
        ) : null}
      </header>
      {children}
    </section>
  );
}

export default function RequestDiffPane({
  name,
  path,
  baseRef,
  fieldDiff,
  onSwitchToEdit,
  onRestoreRequest = null,
  onRestoreSection = null
}: RequestDiffPaneProps) {
  const { semantic, changedSections } = fieldDiff;
  const canRestoreSection = Boolean(onRestoreSection) && !semantic.isAdded;

  return (
    <div className="request-diff-pane">
      <div className="request-diff-header">
        <div className="request-diff-title">
          <h2>{name}</h2>
          <span className="request-path">{path}</span>
        </div>
        <div className="request-diff-actions">
          <div className="request-diff-mode" role="group" aria-label="Request view">
            <button type="button" className="active" disabled>
              Diff
            </button>
            <button type="button" onClick={onSwitchToEdit}>
              Edit
            </button>
          </div>
          {onRestoreRequest && !semantic.isAdded ? (
            <button type="button" className="request-diff-restore-all" onClick={onRestoreRequest}>
              Restore request
            </button>
          ) : null}
        </div>
      </div>

      <p className="request-diff-banner" role="status">
        {semantic.isAdded
          ? `New request — not in ${baseRef}`
          : changedSections.length === 0
            ? `No field differences vs ${baseRef}`
            : `Comparing vs ${baseRef} · ${changedSections.length} section${
                changedSections.length === 1 ? '' : 's'
              }`}
      </p>

      {(semantic.sections.method || semantic.sections.url || semantic.isAdded) && (
        <section className="request-diff-section" data-section="url">
          <header className="request-diff-section-header">
            <h3>Method &amp; URL</h3>
            {canRestoreSection ? (
              <span className="request-diff-section-actions">
                {semantic.sections.method && onRestoreSection ? (
                  <button
                    type="button"
                    className="request-diff-restore"
                    onClick={() => onRestoreSection('method')}
                  >
                    Restore method
                  </button>
                ) : null}
                {semantic.sections.url && onRestoreSection ? (
                  <button
                    type="button"
                    className="request-diff-restore"
                    onClick={() => onRestoreSection('url')}
                  >
                    Restore URL
                  </button>
                ) : null}
              </span>
            ) : null}
          </header>
          <StackedBars
            label="url"
            base={fieldDiff.url.base}
            current={fieldDiff.url.current}
            baseMethod={fieldDiff.method.base || undefined}
            currentMethod={fieldDiff.method.current || undefined}
          />
        </section>
      )}

      {changedSections.includes('params') ? (
        <Section
          title={SECTION_LABELS.params}
          section="params"
          onRestore={canRestoreSection ? onRestoreSection : null}
        >
          <KeyedRows rows={fieldDiff.params.rows} />
        </Section>
      ) : null}

      {changedSections.includes('headers') ? (
        <Section
          title={SECTION_LABELS.headers}
          section="headers"
          onRestore={canRestoreSection ? onRestoreSection : null}
        >
          <KeyedRows rows={fieldDiff.headers.rows} />
        </Section>
      ) : null}

      {changedSections.includes('auth') ? (
        <Section
          title={SECTION_LABELS.auth}
          section="auth"
          onRestore={canRestoreSection ? onRestoreSection : null}
        >
          <AuthDiff auth={fieldDiff.auth} />
        </Section>
      ) : null}

      {changedSections.includes('body') ? (
        <Section
          title={SECTION_LABELS.body}
          section="body"
          onRestore={canRestoreSection ? onRestoreSection : null}
        >
          <BodyDiff body={fieldDiff.body} />
        </Section>
      ) : null}

      {changedSections.includes('prerequest') ? (
        <Section
          title={SECTION_LABELS.prerequest}
          section="prerequest"
          onRestore={canRestoreSection ? onRestoreSection : null}
        >
          <TextDiffView block={fieldDiff.prerequest} />
        </Section>
      ) : null}

      {changedSections.includes('tests') ? (
        <Section
          title={SECTION_LABELS.tests}
          section="tests"
          onRestore={canRestoreSection ? onRestoreSection : null}
        >
          <TextDiffView block={fieldDiff.tests} />
        </Section>
      ) : null}

      {!semantic.isAdded && changedSections.length === 0 ? (
        <p className="request-diff-empty">This request matches {baseRef}.</p>
      ) : null}
    </div>
  );
}
