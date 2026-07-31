export type DiffLineKind = 'equal' | 'insert' | 'delete';

export type DiffSegment = {
  kind: DiffLineKind;
  text: string;
};

export type DiffLine = {
  kind: DiffLineKind;
  text: string;
  /** 1-based line number in the base text, when present. */
  baseLine: number | null;
  /** 1-based line number in the current text, when present. */
  currentLine: number | null;
  /** Intra-line segments when paired with a counterpart for char highlight. */
  segments?: DiffSegment[];
};

/** Skip char LCS when the product of lengths would be too expensive. */
const CHAR_DIFF_COST_LIMIT = 250_000;

/**
 * Myers-inspired LCS line diff. Good enough for request bodies/scripts without a dependency.
 * Returns a flat list of equal/insert/delete lines (unified view).
 */
export function diffLines(baseText: string, currentText: string): DiffLine[] {
  const base = splitLines(baseText);
  const current = splitLines(currentText);
  const raw = lcsDiff(base, current).map((entry) => ({
    kind: entry.kind,
    text: entry.text,
    baseLine: null as number | null,
    currentLine: null as number | null
  }));

  let baseLine = 1;
  let currentLine = 1;
  for (const line of raw) {
    if (line.kind === 'equal') {
      line.baseLine = baseLine;
      line.currentLine = currentLine;
      baseLine += 1;
      currentLine += 1;
    } else if (line.kind === 'delete') {
      line.baseLine = baseLine;
      baseLine += 1;
    } else {
      line.currentLine = currentLine;
      currentLine += 1;
    }
  }

  return enrichLineDiffWithChars(raw);
}

/**
 * Character-level LCS diff. Prefer `highlightPair` for dual-rail UI.
 */
export function diffChars(baseText: string, currentText: string): DiffSegment[] {
  if (baseText === currentText) {
    return baseText.length === 0 ? [] : [{ kind: 'equal', text: baseText }];
  }
  if (baseText.length * currentText.length > CHAR_DIFF_COST_LIMIT) {
    const segments: DiffSegment[] = [];
    if (baseText) segments.push({ kind: 'delete', text: baseText });
    if (currentText) segments.push({ kind: 'insert', text: currentText });
    return segments;
  }
  return lcsDiff(Array.from(baseText), Array.from(currentText)).map((entry) => ({
    kind: entry.kind,
    text: entry.text
  }));
}

/** Split a char diff into the base rail (equal+delete) and current rail (equal+insert). */
export function highlightPair(
  baseText: string,
  currentText: string
): { base: DiffSegment[]; current: DiffSegment[] } {
  if (!baseText && !currentText) {
    return { base: [], current: [] };
  }
  if (baseText === currentText) {
    const equal = baseText ? [{ kind: 'equal' as const, text: baseText }] : [];
    return { base: equal, current: equal };
  }
  const segments = diffChars(baseText, currentText);
  return {
    base: mergeAdjacent(segments.filter((segment) => segment.kind !== 'insert')),
    current: mergeAdjacent(segments.filter((segment) => segment.kind !== 'delete'))
  };
}

export function hasTextChanges(lines: DiffLine[]): boolean {
  return lines.some((line) => line.kind !== 'equal');
}

/**
 * Pair consecutive delete/insert runs and attach char-level segments for highlight.
 */
export function enrichLineDiffWithChars(lines: DiffLine[]): DiffLine[] {
  const result = lines.map((line) => ({ ...line }));
  let index = 0;
  while (index < result.length) {
    if (result[index]!.kind !== 'delete') {
      index += 1;
      continue;
    }
    let deleteEnd = index;
    while (deleteEnd < result.length && result[deleteEnd]!.kind === 'delete') {
      deleteEnd += 1;
    }
    let insertEnd = deleteEnd;
    while (insertEnd < result.length && result[insertEnd]!.kind === 'insert') {
      insertEnd += 1;
    }
    const paired = Math.min(deleteEnd - index, insertEnd - deleteEnd);
    for (let offset = 0; offset < paired; offset += 1) {
      const deleteLine = result[index + offset]!;
      const insertLine = result[deleteEnd + offset]!;
      const pair = highlightPair(deleteLine.text, insertLine.text);
      deleteLine.segments = pair.base;
      insertLine.segments = pair.current;
    }
    index = insertEnd > deleteEnd ? insertEnd : deleteEnd;
  }
  return result;
}

type TokenDiff = { kind: DiffLineKind; text: string };

function lcsDiff(base: string[], current: string[]): TokenDiff[] {
  const n = base.length;
  const m = current.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: m + 1 }, () => 0)
  );
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      if (base[i] === current[j]) {
        dp[i]![j] = dp[i + 1]![j + 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
      }
    }
  }

  const raw: TokenDiff[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (base[i] === current[j]) {
      raw.push({ kind: 'equal', text: base[i]! });
      i += 1;
      j += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      raw.push({ kind: 'delete', text: base[i]! });
      i += 1;
    } else {
      raw.push({ kind: 'insert', text: current[j]! });
      j += 1;
    }
  }
  while (i < n) {
    raw.push({ kind: 'delete', text: base[i]! });
    i += 1;
  }
  while (j < m) {
    raw.push({ kind: 'insert', text: current[j]! });
    j += 1;
  }
  return mergeAdjacent(raw);
}

function mergeAdjacent(segments: TokenDiff[]): TokenDiff[] {
  if (segments.length === 0) {
    return [];
  }
  const merged: TokenDiff[] = [{ ...segments[0]! }];
  for (let index = 1; index < segments.length; index += 1) {
    const segment = segments[index]!;
    const last = merged[merged.length - 1]!;
    if (last.kind === segment.kind) {
      last.text += segment.text;
    } else {
      merged.push({ ...segment });
    }
  }
  return merged;
}

/** Split preserving empty trailing line semantics of a final newline. */
function splitLines(text: string): string[] {
  if (text.length === 0) {
    return [];
  }
  return text.split('\n');
}
