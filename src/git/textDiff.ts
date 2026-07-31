export type DiffLineKind = 'equal' | 'insert' | 'delete';

export type DiffLine = {
  kind: DiffLineKind;
  text: string;
  /** 1-based line number in the base text, when present. */
  baseLine: number | null;
  /** 1-based line number in the current text, when present. */
  currentLine: number | null;
};

/**
 * Myers-inspired LCS line diff. Good enough for request bodies/scripts without a dependency.
 * Returns a flat list of equal/insert/delete lines (unified view).
 */
export function diffLines(baseText: string, currentText: string): DiffLine[] {
  const base = splitLines(baseText);
  const current = splitLines(currentText);
  const n = base.length;
  const m = current.length;

  // dp[i][j] = LCS length of base[i..] and current[j..]
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

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let baseLine = 1;
  let currentLine = 1;
  while (i < n && j < m) {
    if (base[i] === current[j]) {
      lines.push({
        kind: 'equal',
        text: base[i]!,
        baseLine,
        currentLine
      });
      i += 1;
      j += 1;
      baseLine += 1;
      currentLine += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      lines.push({
        kind: 'delete',
        text: base[i]!,
        baseLine,
        currentLine: null
      });
      i += 1;
      baseLine += 1;
    } else {
      lines.push({
        kind: 'insert',
        text: current[j]!,
        baseLine: null,
        currentLine
      });
      j += 1;
      currentLine += 1;
    }
  }
  while (i < n) {
    lines.push({
      kind: 'delete',
      text: base[i]!,
      baseLine,
      currentLine: null
    });
    i += 1;
    baseLine += 1;
  }
  while (j < m) {
    lines.push({
      kind: 'insert',
      text: current[j]!,
      baseLine: null,
      currentLine
    });
    j += 1;
    currentLine += 1;
  }

  return lines;
}

/** Split preserving empty trailing line semantics of a final newline. */
function splitLines(text: string): string[] {
  if (text.length === 0) {
    return [];
  }
  const parts = text.split('\n');
  // "a\n" → ["a", ""] so the trailing empty line is visible in the diff.
  return parts;
}

export function hasTextChanges(lines: DiffLine[]): boolean {
  return lines.some((line) => line.kind !== 'equal');
}
