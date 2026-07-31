import {
  getItemScriptSource,
  getRequestAuth,
  getRequestBody,
  getRequestHeaders,
  getRequestQueryParams
} from '../postman/edit.ts';
import type { PostmanItem } from '../postman/types.ts';
import { isRequest } from '../postman/tree.ts';
import { getUrlRaw } from '../postman/url.ts';

export type RequestSectionKey =
  | 'method'
  | 'url'
  | 'params'
  | 'headers'
  | 'body'
  | 'auth'
  | 'prerequest'
  | 'tests';

export type RequestSemanticDiff = {
  active: boolean;
  /** True when the current request has no base counterpart. */
  isAdded: boolean;
  /** True when the request exists in base but was removed from current. */
  isRemoved: boolean;
  sections: Record<RequestSectionKey, boolean>;
  hasChanges: boolean;
};

const EMPTY_SECTIONS: Record<RequestSectionKey, boolean> = {
  method: false,
  url: false,
  params: false,
  headers: false,
  body: false,
  auth: false,
  prerequest: false,
  tests: false
};

function stable(value: unknown): string {
  return JSON.stringify(value);
}

function requestPayload(item: PostmanItem) {
  if (!isRequest(item)) {
    return null;
  }
  if (typeof item.request === 'string') {
    return { method: 'GET', url: item.request };
  }
  return item.request ?? null;
}

function normalizeHeaders(item: PostmanItem) {
  return getRequestHeaders(item).map((header) => ({
    key: header.key ?? '',
    value: header.value ?? '',
    disabled: Boolean(header.disabled)
  }));
}

function normalizeParams(item: PostmanItem) {
  return getRequestQueryParams(item).map((param) => ({
    key: param.key ?? '',
    value: param.value ?? '',
    disabled: Boolean(param.disabled)
  }));
}

function normalizeBody(item: PostmanItem) {
  const body = getRequestBody(item);
  if (!body || body.mode === 'none' || !body.mode) {
    return { mode: 'none' as const };
  }
  if (body.mode === 'raw') {
    return {
      mode: 'raw' as const,
      raw: body.raw ?? '',
      options: body.options ?? undefined
    };
  }
  if (body.mode === 'urlencoded') {
    return {
      mode: 'urlencoded' as const,
      urlencoded: (body.urlencoded ?? []).map((param) => ({
        key: param.key ?? '',
        value: param.value ?? '',
        disabled: Boolean(param.disabled)
      }))
    };
  }
  return body;
}

function normalizeAuth(item: PostmanItem) {
  const auth = getRequestAuth(item);
  if (!auth || auth.type === 'noauth') {
    return null;
  }
  return auth;
}

function sectionSnapshot(item: PostmanItem): Record<RequestSectionKey, string> {
  const request = requestPayload(item);
  const method = (request?.method ?? 'GET').toUpperCase();
  const url = request ? getUrlRaw(request.url) : '';
  return {
    method,
    url,
    params: stable(normalizeParams(item)),
    headers: stable(normalizeHeaders(item)),
    body: stable(normalizeBody(item)),
    auth: stable(normalizeAuth(item)),
    prerequest: getItemScriptSource(item, 'prerequest'),
    tests: getItemScriptSource(item, 'test')
  };
}

/**
 * Field-level diff for an open request vs its paired base item.
 * When `base` is null the request is treated as added (banner only, no section badges).
 */
export function computeSemanticDiff(
  current: PostmanItem | null,
  base: PostmanItem | null
): RequestSemanticDiff {
  if (current && isRequest(current) && (!base || !isRequest(base))) {
    return {
      active: true,
      isAdded: true,
      isRemoved: false,
      sections: { ...EMPTY_SECTIONS },
      hasChanges: true
    };
  }

  if (base && isRequest(base) && (!current || !isRequest(current))) {
    return {
      active: true,
      isAdded: false,
      isRemoved: true,
      sections: { ...EMPTY_SECTIONS },
      hasChanges: true
    };
  }

  if (!current || !isRequest(current) || !base || !isRequest(base)) {
    return {
      active: false,
      isAdded: false,
      isRemoved: false,
      sections: { ...EMPTY_SECTIONS },
      hasChanges: false
    };
  }

  const currentSnap = sectionSnapshot(current);
  const baseSnap = sectionSnapshot(base);
  const sections = { ...EMPTY_SECTIONS };
  let hasChanges = false;
  (Object.keys(sections) as RequestSectionKey[]).forEach((key) => {
    const changed = currentSnap[key] !== baseSnap[key];
    sections[key] = changed;
    if (changed) {
      hasChanges = true;
    }
  });

  return {
    active: true,
    isAdded: false,
    isRemoved: false,
    sections,
    hasChanges
  };
}
