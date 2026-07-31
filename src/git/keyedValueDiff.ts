import type { KeyChangeKind } from './keyedDiff.ts';

export type DiffKeyedRow = {
  key: string;
  change: KeyChangeKind;
  baseValue: string | null;
  currentValue: string | null;
  baseDisabled: boolean;
  currentDisabled: boolean;
};

export type DiffKeyedList = {
  rows: DiffKeyedRow[];
  /** True when at least one row is not unchanged. */
  hasChanges: boolean;
};

export type KeyValueRow = {
  key: string;
  value: string;
  disabled: boolean;
};

function fingerprintKv(key: string, value: string, disabled: boolean): string {
  return JSON.stringify({ key, value, disabled });
}

/**
 * Pair key/value rows by key (encounter order for duplicates).
 * Includes unchanged rows so the UI can offer "Show unchanged".
 */
export function computeKeyedValueDiff(
  current: KeyValueRow[],
  base: KeyValueRow[]
): DiffKeyedList {
  const baseUsed = new Set<number>();
  const rows: DiffKeyedRow[] = [];
  let changed = 0;

  current.forEach((row) => {
    let matched = -1;
    for (let i = 0; i < base.length; i += 1) {
      if (baseUsed.has(i)) {
        continue;
      }
      if (base[i]!.key === row.key) {
        matched = i;
        break;
      }
    }

    if (matched < 0) {
      changed += 1;
      rows.push({
        key: row.key || '(empty)',
        change: 'added',
        baseValue: null,
        currentValue: row.value,
        baseDisabled: false,
        currentDisabled: row.disabled
      });
      return;
    }

    baseUsed.add(matched);
    const baseRow = base[matched]!;
    const same =
      fingerprintKv(row.key, row.value, row.disabled) ===
      fingerprintKv(baseRow.key, baseRow.value, baseRow.disabled);
    if (same) {
      rows.push({
        key: row.key || '(empty)',
        change: 'unchanged',
        baseValue: baseRow.value,
        currentValue: row.value,
        baseDisabled: baseRow.disabled,
        currentDisabled: row.disabled
      });
      return;
    }
    changed += 1;
    rows.push({
      key: row.key || '(empty)',
      change: 'modified',
      baseValue: baseRow.value,
      currentValue: row.value,
      baseDisabled: baseRow.disabled,
      currentDisabled: row.disabled
    });
  });

  base.forEach((row, baseIndex) => {
    if (baseUsed.has(baseIndex)) {
      return;
    }
    changed += 1;
    rows.push({
      key: row.key || '(empty)',
      change: 'removed',
      baseValue: row.value,
      currentValue: null,
      baseDisabled: row.disabled,
      currentDisabled: false
    });
  });

  return { rows, hasChanges: changed > 0 };
}
