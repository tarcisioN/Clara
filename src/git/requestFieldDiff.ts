import {
  getItemScriptSource,
  getRequestAuth,
  getRequestBody,
  getRequestHeaders,
  getRequestQueryParams
} from '../postman/edit.ts';
import { getAuthAttributeValue, resolveEditableAuthType } from '../postman/auth.ts';
import type { PostmanItem } from '../postman/types.ts';
import { isRequest } from '../postman/tree.ts';
import { getUrlRaw } from '../postman/url.ts';
import type { KeyChangeKind } from './keyedDiff.ts';
import {
  computeSemanticDiff,
  type RequestSectionKey,
  type RequestSemanticDiff
} from './semanticDiff.ts';
import { diffLines, type DiffLine } from './textDiff.ts';

export type DiffScalar = {
  kind: 'unchanged' | 'modified' | 'added' | 'removed';
  base: string;
  current: string;
};

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

export type DiffTextBlock = {
  kind: 'text';
  base: string;
  current: string;
  lines: DiffLine[];
};

export type DiffBody =
  | { kind: 'none' }
  | { kind: 'mode-change'; baseMode: string; currentMode: string; baseSummary: string; currentSummary: string }
  | { kind: 'raw'; text: DiffTextBlock }
  | { kind: 'urlencoded'; list: DiffKeyedList }
  | { kind: 'other'; baseSummary: string; currentSummary: string };

export type DiffAuth =
  | { kind: 'unchanged'; typeLabel: string }
  | {
      kind: 'changed';
      baseType: string;
      currentType: string;
      rows: DiffKeyedRow[];
    };

export type RequestFieldDiff = {
  semantic: RequestSemanticDiff;
  name: DiffScalar;
  method: DiffScalar;
  url: DiffScalar;
  params: DiffKeyedList;
  headers: DiffKeyedList;
  body: DiffBody;
  auth: DiffAuth;
  prerequest: DiffTextBlock;
  tests: DiffTextBlock;
  /** Sections that actually differ, in display order. */
  changedSections: RequestSectionKey[];
};

const SECTION_ORDER: RequestSectionKey[] = [
  'method',
  'url',
  'params',
  'headers',
  'auth',
  'body',
  'prerequest',
  'tests'
];

function scalar(base: string, current: string): DiffScalar {
  if (base === current) {
    return { kind: 'unchanged', base, current };
  }
  if (!base && current) {
    return { kind: 'added', base, current };
  }
  if (base && !current) {
    return { kind: 'removed', base, current };
  }
  return { kind: 'modified', base, current };
}

function fingerprintKv(key: string, value: string, disabled: boolean): string {
  return JSON.stringify({ key, value, disabled });
}

function keyedList(
  current: Array<{ key: string; value: string; disabled: boolean }>,
  base: Array<{ key: string; value: string; disabled: boolean }>
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

function textBlock(base: string, current: string): DiffTextBlock {
  return {
    kind: 'text',
    base,
    current,
    lines: diffLines(base, current)
  };
}

function summarizeBody(item: PostmanItem): { mode: string; summary: string; raw?: string; urlencoded?: DiffKeyedList } {
  const body = getRequestBody(item);
  if (!body || body.mode === 'none' || !body.mode) {
    return { mode: 'none', summary: '(none)' };
  }
  if (body.mode === 'raw') {
    const raw = body.raw ?? '';
    return { mode: 'raw', summary: raw, raw };
  }
  if (body.mode === 'urlencoded') {
    const rows = (body.urlencoded ?? []).map((param) => ({
      key: param.key ?? '',
      value: param.value ?? '',
      disabled: Boolean(param.disabled)
    }));
    return {
      mode: 'urlencoded',
      summary: rows.map((row) => `${row.key}=${row.value}`).join('&') || '(empty)',
      urlencoded: keyedList(rows, rows)
    };
  }
  return { mode: body.mode, summary: JSON.stringify(body) };
}

function buildBody(current: PostmanItem, base: PostmanItem | null): DiffBody {
  const currentInfo = summarizeBody(current);
  const baseInfo = base ? summarizeBody(base) : { mode: 'none', summary: '' };

  if (!base) {
    if (currentInfo.mode === 'none') {
      return { kind: 'none' };
    }
    if (currentInfo.mode === 'raw') {
      return { kind: 'raw', text: textBlock('', currentInfo.raw ?? '') };
    }
    if (currentInfo.mode === 'urlencoded') {
      const currentRows = (getRequestBody(current)?.urlencoded ?? []).map((param) => ({
        key: param.key ?? '',
        value: param.value ?? '',
        disabled: Boolean(param.disabled)
      }));
      return { kind: 'urlencoded', list: keyedList(currentRows, []) };
    }
    return {
      kind: 'other',
      baseSummary: '',
      currentSummary: currentInfo.summary
    };
  }

  if (currentInfo.mode === baseInfo.mode) {
    if (currentInfo.mode === 'none') {
      return { kind: 'none' };
    }
    if (currentInfo.mode === 'raw') {
      return {
        kind: 'raw',
        text: textBlock(baseInfo.raw ?? '', currentInfo.raw ?? '')
      };
    }
    if (currentInfo.mode === 'urlencoded') {
      const currentRows = (getRequestBody(current)?.urlencoded ?? []).map((param) => ({
        key: param.key ?? '',
        value: param.value ?? '',
        disabled: Boolean(param.disabled)
      }));
      const baseRows = (getRequestBody(base)?.urlencoded ?? []).map((param) => ({
        key: param.key ?? '',
        value: param.value ?? '',
        disabled: Boolean(param.disabled)
      }));
      return { kind: 'urlencoded', list: keyedList(currentRows, baseRows) };
    }
    if (currentInfo.summary === baseInfo.summary) {
      return { kind: 'none' };
    }
    return {
      kind: 'other',
      baseSummary: baseInfo.summary,
      currentSummary: currentInfo.summary
    };
  }

  return {
    kind: 'mode-change',
    baseMode: baseInfo.mode,
    currentMode: currentInfo.mode,
    baseSummary: baseInfo.summary,
    currentSummary: currentInfo.summary
  };
}

function authRows(item: PostmanItem): Array<{ key: string; value: string; disabled: boolean }> {
  const auth = getRequestAuth(item);
  const type = resolveEditableAuthType(auth);
  if (type === 'inherit' || type === 'noauth' || !auth || typeof auth !== 'object') {
    return [{ key: 'type', value: String(type), disabled: false }];
  }
  const rows: Array<{ key: string; value: string; disabled: boolean }> = [
    { key: 'type', value: String(type), disabled: false }
  ];
  if (type === 'bearer') {
    rows.push({
      key: 'token',
      value: getAuthAttributeValue(auth.bearer, 'token'),
      disabled: false
    });
  } else if (type === 'basic') {
    rows.push(
      {
        key: 'username',
        value: getAuthAttributeValue(auth.basic, 'username'),
        disabled: false
      },
      {
        key: 'password',
        value: getAuthAttributeValue(auth.basic, 'password'),
        disabled: false
      }
    );
  } else if (type === 'apikey') {
    rows.push(
      {
        key: 'key',
        value: getAuthAttributeValue(auth.apikey, 'key'),
        disabled: false
      },
      {
        key: 'value',
        value: getAuthAttributeValue(auth.apikey, 'value'),
        disabled: false
      },
      {
        key: 'in',
        value: getAuthAttributeValue(auth.apikey, 'in') || 'header',
        disabled: false
      }
    );
  } else {
    rows.push({
      key: 'details',
      value: JSON.stringify(auth),
      disabled: false
    });
  }
  return rows;
}

function buildAuth(current: PostmanItem, base: PostmanItem | null): DiffAuth {
  const currentType = String(resolveEditableAuthType(getRequestAuth(current)));
  if (!base) {
    return {
      kind: 'changed',
      baseType: '',
      currentType,
      rows: keyedList(authRows(current), []).rows
    };
  }
  const baseType = String(resolveEditableAuthType(getRequestAuth(base)));
  const list = keyedList(authRows(current), authRows(base));
  if (!list.hasChanges && currentType === baseType) {
    return { kind: 'unchanged', typeLabel: currentType };
  }
  return {
    kind: 'changed',
    baseType,
    currentType,
    rows: list.rows
  };
}

function requestMethod(item: PostmanItem): string {
  if (!isRequest(item)) {
    return 'GET';
  }
  if (typeof item.request === 'string') {
    return 'GET';
  }
  return (item.request?.method ?? 'GET').toUpperCase();
}

function requestUrl(item: PostmanItem): string {
  if (!isRequest(item)) {
    return '';
  }
  if (typeof item.request === 'string') {
    return item.request;
  }
  return getUrlRaw(item.request?.url);
}

function kvRows(
  item: PostmanItem,
  which: 'headers' | 'params'
): Array<{ key: string; value: string; disabled: boolean }> {
  const list =
    which === 'headers' ? getRequestHeaders(item) : getRequestQueryParams(item);
  return list.map((entry) => ({
    key: entry.key ?? '',
    value: entry.value ?? '',
    disabled: Boolean(entry.disabled)
  }));
}

/**
 * Build the read-only field-level diff model for the Diff pane.
 * - `base` null → added
 * - `current` null → removed
 */
export function computeRequestFieldDiff(
  current: PostmanItem | null,
  base: PostmanItem | null
): RequestFieldDiff {
  const semantic = computeSemanticDiff(current, base);
  const currentItem = current && isRequest(current) ? current : null;
  const baseItem = base && isRequest(base) ? base : null;

  const method = scalar(
    baseItem ? requestMethod(baseItem) : '',
    currentItem ? requestMethod(currentItem) : ''
  );
  const url = scalar(
    baseItem ? requestUrl(baseItem) : '',
    currentItem ? requestUrl(currentItem) : ''
  );
  const name = scalar(
    baseItem ? (baseItem.name?.trim() || '') : '',
    currentItem ? currentItem.name?.trim() || '' : ''
  );
  const params = keyedList(
    currentItem ? kvRows(currentItem, 'params') : [],
    baseItem ? kvRows(baseItem, 'params') : []
  );
  const headers = keyedList(
    currentItem ? kvRows(currentItem, 'headers') : [],
    baseItem ? kvRows(baseItem, 'headers') : []
  );
  const body = currentItem
    ? buildBody(currentItem, baseItem)
    : baseItem
      ? buildBodyRemoved(baseItem)
      : { kind: 'none' as const };
  const auth = currentItem
    ? buildAuth(currentItem, baseItem)
    : baseItem
      ? buildAuthRemoved(baseItem)
      : { kind: 'unchanged' as const, typeLabel: 'inherit' };
  const prerequest = textBlock(
    baseItem ? getItemScriptSource(baseItem, 'prerequest') : '',
    currentItem ? getItemScriptSource(currentItem, 'prerequest') : ''
  );
  const tests = textBlock(
    baseItem ? getItemScriptSource(baseItem, 'test') : '',
    currentItem ? getItemScriptSource(currentItem, 'test') : ''
  );

  const collectExtras = (): RequestSectionKey[] => {
    const extras: RequestSectionKey[] = ['method', 'url'];
    if (params.hasChanges || params.rows.some((row) => row.change !== 'unchanged')) {
      extras.push('params');
    }
    if (headers.hasChanges || headers.rows.some((row) => row.change !== 'unchanged')) {
      extras.push('headers');
    }
    if (auth.kind === 'changed') extras.push('auth');
    if (body.kind !== 'none') extras.push('body');
    if (prerequest.lines.some((line) => line.kind !== 'equal')) extras.push('prerequest');
    if (tests.lines.some((line) => line.kind !== 'equal')) extras.push('tests');
    return extras;
  };

  if (semantic.isAdded || semantic.isRemoved) {
    const unique = [...new Set(collectExtras())];
    return {
      semantic,
      name,
      method,
      url,
      params,
      headers,
      body,
      auth,
      prerequest,
      tests,
      changedSections: SECTION_ORDER.filter((key) => unique.includes(key))
    };
  }

  const changedSections = SECTION_ORDER.filter((key) => semantic.sections[key]);

  return {
    semantic,
    name,
    method,
    url,
    params,
    headers,
    body,
    auth,
    prerequest,
    tests,
    changedSections
  };
}

function buildBodyRemoved(base: PostmanItem): DiffBody {
  const info = summarizeBody(base);
  if (info.mode === 'none') {
    return { kind: 'none' };
  }
  if (info.mode === 'raw') {
    return { kind: 'raw', text: textBlock(info.raw ?? '', '') };
  }
  if (info.mode === 'urlencoded') {
    const baseRows = (getRequestBody(base)?.urlencoded ?? []).map((param) => ({
      key: param.key ?? '',
      value: param.value ?? '',
      disabled: Boolean(param.disabled)
    }));
    return { kind: 'urlencoded', list: keyedList([], baseRows) };
  }
  return {
    kind: 'other',
    baseSummary: info.summary,
    currentSummary: ''
  };
}

function buildAuthRemoved(base: PostmanItem): DiffAuth {
  const baseType = String(resolveEditableAuthType(getRequestAuth(base)));
  return {
    kind: 'changed',
    baseType,
    currentType: '',
    rows: keyedList([], authRows(base)).rows
  };
}
