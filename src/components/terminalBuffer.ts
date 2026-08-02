import type { TerminalEntry } from './TerminalPane.tsx';
import type { NewmanRunView } from '../newman/parseResult.ts';

/** Max run blocks kept while the Terminal panel is open. */
export const TERMINAL_MAX_ENTRIES = 20;

/** Soft cap per stdout/stderr chunk (characters). */
export const TERMINAL_MAX_CHUNK_CHARS = 256_000;

export function truncateTerminalText(
  text: string,
  maxChars = TERMINAL_MAX_CHUNK_CHARS
): string {
  if (text.length <= maxChars) {
    return text;
  }
  const omitted = text.length - maxChars;
  return `${text.slice(0, maxChars)}\n… [truncated ${omitted.toLocaleString()} characters]`;
}

export function buildTerminalEntry(
  label: string,
  result: Pick<NewmanRunView, 'command' | 'stdout' | 'stderr' | 'exitCode' | 'ok' | 'missingNewman'>
): TerminalEntry {
  return {
    id: crypto.randomUUID(),
    at: Date.now(),
    label,
    command: result.command,
    stdout: truncateTerminalText(result.stdout ?? ''),
    stderr: truncateTerminalText(result.stderr ?? ''),
    exitCode: result.exitCode,
    ok: result.ok && !result.missingNewman
  };
}

/**
 * Closed terminal = fresh session (replace). Open = append with a hard cap.
 */
export function nextTerminalEntries(
  current: TerminalEntry[],
  entry: TerminalEntry,
  open: boolean
): TerminalEntry[] {
  if (!open) {
    return [entry];
  }
  return [...current, entry].slice(-TERMINAL_MAX_ENTRIES);
}
