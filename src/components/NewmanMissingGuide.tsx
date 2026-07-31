import { useState } from 'react';
import {
  NEWMAN_BREW_INSTALL_COMMAND,
  NEWMAN_DOCS_URL,
  NEWMAN_INSTALL_COMMAND
} from '../newman/missing.ts';
import './NewmanMissingGuide.css';

type NewmanMissingGuideProps = {
  compact?: boolean;
  /** Called after Newman becomes visible so the parent can clear the missing state / retry. */
  onReady?: (version: string) => void;
};

type GuidePhase =
  | { kind: 'idle' }
  | { kind: 'installing' }
  | { kind: 'checking' }
  | { kind: 'ready'; version: string }
  | { kind: 'needs-relaunch' }
  | { kind: 'error'; message: string };

export default function NewmanMissingGuide({
  compact = false,
  onReady
}: NewmanMissingGuideProps) {
  const [phase, setPhase] = useState<GuidePhase>({ kind: 'idle' });
  const [copied, setCopied] = useState<'npm' | 'brew' | null>(null);
  const busy = phase.kind === 'installing' || phase.kind === 'checking';

  const copyCommand = async (which: 'npm' | 'brew') => {
    const command = which === 'npm' ? NEWMAN_INSTALL_COMMAND : NEWMAN_BREW_INSTALL_COMMAND;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setPhase({ kind: 'error', message: 'Could not copy to the clipboard' });
    }
  };

  const markReady = (version: string) => {
    setPhase({ kind: 'ready', version });
    onReady?.(version);
  };

  const installWithNpm = async () => {
    setPhase({ kind: 'installing' });
    try {
      const result = await window.clara.installNewman();
      if (result.ok && result.version) {
        markReady(result.version);
        return;
      }
      if (result.needsRelaunch) {
        setPhase({ kind: 'needs-relaunch' });
        return;
      }
      setPhase({
        kind: 'error',
        message: result.error ?? 'Install failed'
      });
    } catch (error) {
      setPhase({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  };

  const checkAgain = async () => {
    setPhase({ kind: 'checking' });
    try {
      const presence = await window.clara.checkNewman();
      if (presence.ok) {
        markReady(presence.version);
        return;
      }
      setPhase({
        kind: 'error',
        message: presence.error || 'Newman is still not on PATH'
      });
    } catch (error) {
      setPhase({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  };

  return (
    <div className={`newman-missing ${compact ? 'compact' : ''}`} role="alert">
      <strong>
        {phase.kind === 'ready' ? 'Newman is ready' : 'Newman is not installed'}
      </strong>

      {phase.kind === 'ready' ? (
        <p className="newman-missing-status ok">
          Found newman {phase.version}. Send / Run again to execute the request.
        </p>
      ) : (
        <>
          <p className="newman-missing-lead">
            Clara runs requests through the Newman CLI. Install it once, then try Send
            again.
          </p>

          <div className="newman-missing-cmd-row">
            <code>{NEWMAN_INSTALL_COMMAND}</code>
            <button
              type="button"
              className="newman-missing-btn"
              disabled={busy}
              onClick={() => void copyCommand('npm')}
            >
              {copied === 'npm' ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div className="newman-missing-actions">
            <button
              type="button"
              className="newman-missing-btn primary"
              disabled={busy}
              onClick={() => void installWithNpm()}
            >
              {phase.kind === 'installing' ? 'Installing…' : 'Install with npm'}
            </button>
            <button
              type="button"
              className="newman-missing-btn"
              disabled={busy}
              onClick={() => void checkAgain()}
            >
              {phase.kind === 'checking' ? 'Checking…' : 'Check again'}
            </button>
            <button
              type="button"
              className="newman-missing-btn"
              disabled={busy}
              onClick={() => void window.clara.openExternal(NEWMAN_DOCS_URL)}
            >
              Docs
            </button>
          </div>

          <details className="newman-missing-alt">
            <summary>Other options</summary>
            <div className="newman-missing-cmd-row">
              <code>{NEWMAN_BREW_INSTALL_COMMAND}</code>
              <button
                type="button"
                className="newman-missing-btn"
                disabled={busy}
                onClick={() => void copyCommand('brew')}
              >
                {copied === 'brew' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p>
              After installing outside Clara, click <em>Check again</em>. If it still
              fails on macOS, quit and reopen Clara so the GUI picks up PATH changes.
            </p>
          </details>
        </>
      )}

      {phase.kind === 'needs-relaunch' ? (
        <p className="newman-missing-status warn">
          npm finished, but Clara still cannot see newman. Quit and reopen Clara, then
          click Check again.
        </p>
      ) : null}

      {phase.kind === 'error' ? (
        <p className="newman-missing-status error">{phase.message}</p>
      ) : null}
    </div>
  );
}
