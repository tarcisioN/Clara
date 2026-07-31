export type KeyChangeKind = 'added' | 'removed' | 'modified' | 'unchanged';

export type KeyedDiffEntry = {
  key: string;
  kind: KeyChangeKind;
  /** Index in the current array when present. */
  currentIndex: number | null;
  /** Index in the base array when present. */
  baseIndex: number | null;
};

export type KeyedDiff = {
  byKey: Map<string, KeyChangeKind>;
  /** Status for each current-row index (added/modified/unchanged). */
  byCurrentIndex: Map<number, KeyChangeKind>;
  /** Base-only keys (removed), ordered by base index. */
  removed: Array<{ key: string; baseIndex: number }>;
  added: number;
  removedCount: number;
  modified: number;
  changedCount: number;
};

type KeyedRow = {
  key: string;
  fingerprint: string;
};

/**
 * Diff two lists by unique key. Duplicate keys match in encounter order.
 * Value-only changes are `modified`, not removed+added.
 */
export function computeKeyedDiff(
  currentRows: KeyedRow[],
  baseRows: KeyedRow[]
): KeyedDiff {
  const byKey = new Map<string, KeyChangeKind>();
  const byCurrentIndex = new Map<number, KeyChangeKind>();
  const removed: Array<{ key: string; baseIndex: number }> = [];
  let added = 0;
  let removedCount = 0;
  let modified = 0;

  const baseUsed = new Set<number>();

  currentRows.forEach((row, currentIndex) => {
    const key = row.key;
    let matched = -1;
    for (let i = 0; i < baseRows.length; i += 1) {
      if (baseUsed.has(i)) {
        continue;
      }
      if (baseRows[i]!.key === key) {
        matched = i;
        break;
      }
    }

    if (matched < 0) {
      byKey.set(key || `__added__:${currentIndex}`, 'added');
      byCurrentIndex.set(currentIndex, 'added');
      added += 1;
      return;
    }

    baseUsed.add(matched);
    const kind =
      row.fingerprint === baseRows[matched]!.fingerprint ? 'unchanged' : 'modified';
    byKey.set(key || `__idx__:${currentIndex}`, kind);
    byCurrentIndex.set(currentIndex, kind);
    if (kind === 'modified') {
      modified += 1;
    }
  });

  baseRows.forEach((row, baseIndex) => {
    if (baseUsed.has(baseIndex)) {
      return;
    }
    removed.push({ key: row.key, baseIndex });
    byKey.set(row.key || `__removed__:${baseIndex}`, 'removed');
    removedCount += 1;
  });

  return {
    byKey,
    byCurrentIndex,
    removed,
    added,
    removedCount,
    modified,
    changedCount: added + removedCount + modified
  };
}
