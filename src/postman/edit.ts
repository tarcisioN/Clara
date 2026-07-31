import type {
  PostmanCollection,
  PostmanHeader,
  PostmanItem,
  PostmanQueryParam,
  PostmanRequest
} from './types.ts';
import type { PostmanBody, PostmanBodyMode, PostmanUrlEncodedParam } from './body.ts';
import type { EditableAuthType, PostmanAuth } from './auth.ts';
import { setAuthAttributeValue } from './auth.ts';
import {
  scriptExecToSource,
  sourceToScriptExec,
  type PostmanEvent,
  type PostmanScriptListen
} from './scripts.ts';
import {
  normalizeVariables,
  type PostmanVariable
} from './variables.ts';
import { updateItemByPath, type ItemPath } from './tree.ts';
import { ensureUrlObject, isUrlObject, setUrlQueryParams, setUrlRaw } from './url.ts';

export function updateCollectionItem(
  collection: PostmanCollection,
  path: ItemPath,
  updater: (item: PostmanItem) => PostmanItem
): PostmanCollection {
  return {
    ...collection,
    item: updateItemByPath(collection.item, path, updater)
  };
}

/** Expand a string-form request (`"https://..."`) into an object so nested fields can exist. */
export function ensureRequestObject(item: PostmanItem): PostmanItem {
  if (typeof item.request === 'string') {
    return { ...item, request: { method: 'GET', url: item.request } };
  }
  return item;
}

function withRequest(
  item: PostmanItem,
  updater: (request: PostmanRequest) => PostmanRequest
): PostmanItem {
  const expanded = ensureRequestObject(item);
  const request: PostmanRequest =
    typeof expanded.request === 'object' && expanded.request !== null
      ? expanded.request
      : {};
  return { ...expanded, request: updater(request) };
}

function withBody(
  item: PostmanItem,
  updater: (body: PostmanBody) => PostmanBody
): PostmanItem {
  return withRequest(item, (request) => ({
    ...request,
    body: updater(request.body ?? {})
  }));
}

/** A request stored as a bare URL string stays a string — editing the URL alone won't expand it. */
export function setRequestUrl(item: PostmanItem, raw: string): PostmanItem {
  if (typeof item.request === 'string') {
    return { ...item, request: raw };
  }

  const request: PostmanRequest = item.request ?? {};
  return { ...item, request: { ...request, url: setUrlRaw(request.url, raw) } };
}

/** Setting a method on a string-form request expands it to an object: strings imply GET. */
export function setRequestMethod(item: PostmanItem, method: string): PostmanItem {
  const normalized = method.toUpperCase();

  if (typeof item.request === 'string') {
    return { ...item, request: { method: normalized, url: item.request } };
  }

  const request: PostmanRequest = item.request ?? {};
  return { ...item, request: { ...request, method: normalized } };
}

export function getRequestHeaders(item: PostmanItem): PostmanHeader[] {
  if (typeof item.request === 'string' || !item.request) {
    return [];
  }
  return item.request.header ?? [];
}

export function addRequestHeader(item: PostmanItem): PostmanItem {
  return withRequest(item, (request) => ({
    ...request,
    header: [...(request.header ?? []), { key: '', value: '' }]
  }));
}

export function updateRequestHeader(
  item: PostmanItem,
  index: number,
  patch: Pick<PostmanHeader, 'key' | 'value'>
): PostmanItem {
  return withRequest(item, (request) => {
    const headers = [...(request.header ?? [])];
    if (index < 0 || index >= headers.length) {
      throw new Error(`Header index out of range: ${index}`);
    }

    const current = headers[index];
    const next: PostmanHeader = { ...current };

    if (patch.key !== undefined) {
      next.key = patch.key;
    }
    if (patch.value !== undefined) {
      next.value = patch.value;
    }

    headers[index] = next;
    return { ...request, header: headers };
  });
}

/**
 * Enabled headers omit `disabled` (Postman export style). Disabled headers set
 * `disabled: true`. Other fields on the header object are left untouched.
 */
export function setRequestHeaderDisabled(
  item: PostmanItem,
  index: number,
  disabled: boolean
): PostmanItem {
  return withRequest(item, (request) => {
    const headers = [...(request.header ?? [])];
    if (index < 0 || index >= headers.length) {
      throw new Error(`Header index out of range: ${index}`);
    }

    const next: PostmanHeader = { ...headers[index] };
    if (disabled) {
      next.disabled = true;
    } else {
      delete next.disabled;
    }

    headers[index] = next;
    return { ...request, header: headers };
  });
}

export function removeRequestHeader(item: PostmanItem, index: number): PostmanItem {
  return withRequest(item, (request) => {
    const headers = [...(request.header ?? [])];
    if (index < 0 || index >= headers.length) {
      throw new Error(`Header index out of range: ${index}`);
    }
    headers.splice(index, 1);
    return { ...request, header: headers };
  });
}

export function getRequestBody(item: PostmanItem): PostmanBody | undefined {
  if (typeof item.request === 'string' || !item.request) {
    return undefined;
  }
  return item.request.body;
}

/**
 * Switch active body mode. Other mode payloads (`raw`, `urlencoded`, `formdata`,
 * `options`, …) stay on the object so a later switchback does not lose data.
 */
export function setRequestBodyMode(item: PostmanItem, mode: PostmanBodyMode): PostmanItem {
  return withBody(item, (body) => ({ ...body, mode }));
}

/** Update raw text only — `options` / language and sibling mode payloads are preserved. */
export function setRequestBodyRaw(item: PostmanItem, raw: string): PostmanItem {
  return withBody(item, (body) => ({
    ...body,
    mode: body.mode ?? 'raw',
    raw
  }));
}

export function addRequestUrlEncodedParam(item: PostmanItem): PostmanItem {
  return withBody(item, (body) => ({
    ...body,
    mode: body.mode ?? 'urlencoded',
    urlencoded: [...(body.urlencoded ?? []), { key: '', value: '' }]
  }));
}

export function updateRequestUrlEncodedParam(
  item: PostmanItem,
  index: number,
  patch: Pick<PostmanUrlEncodedParam, 'key' | 'value'>
): PostmanItem {
  return withBody(item, (body) => {
    const params = [...(body.urlencoded ?? [])];
    if (index < 0 || index >= params.length) {
      throw new Error(`Urlencoded index out of range: ${index}`);
    }

    const next: PostmanUrlEncodedParam = { ...params[index] };
    if (patch.key !== undefined) {
      next.key = patch.key;
    }
    if (patch.value !== undefined) {
      next.value = patch.value;
    }

    params[index] = next;
    return { ...body, mode: body.mode ?? 'urlencoded', urlencoded: params };
  });
}

export function setRequestUrlEncodedParamDisabled(
  item: PostmanItem,
  index: number,
  disabled: boolean
): PostmanItem {
  return withBody(item, (body) => {
    const params = [...(body.urlencoded ?? [])];
    if (index < 0 || index >= params.length) {
      throw new Error(`Urlencoded index out of range: ${index}`);
    }

    const next: PostmanUrlEncodedParam = { ...params[index] };
    if (disabled) {
      next.disabled = true;
    } else {
      delete next.disabled;
    }

    params[index] = next;
    return { ...body, mode: body.mode ?? 'urlencoded', urlencoded: params };
  });
}

export function removeRequestUrlEncodedParam(item: PostmanItem, index: number): PostmanItem {
  return withBody(item, (body) => {
    const params = [...(body.urlencoded ?? [])];
    if (index < 0 || index >= params.length) {
      throw new Error(`Urlencoded index out of range: ${index}`);
    }
    params.splice(index, 1);
    return { ...body, mode: body.mode ?? 'urlencoded', urlencoded: params };
  });
}

export function getRequestAuth(item: PostmanItem): PostmanAuth | null | undefined {
  if (typeof item.request === 'string' || !item.request) {
    return undefined;
  }
  return item.request.auth;
}

/**
 * Set request auth type.
 * - `inherit` removes `request.auth` so Newman/Postman fall back to folder/collection auth.
 * - `noauth` / `bearer` / `basic` / `apikey` set `type` and keep sibling type arrays intact.
 */
export function setRequestAuthType(item: PostmanItem, type: EditableAuthType): PostmanItem {
  if (type === 'inherit') {
    return withRequest(item, (request) => {
      const next = { ...request };
      delete next.auth;
      return next;
    });
  }

  return withRequest(item, (request) => {
    const auth: PostmanAuth = { ...(request.auth ?? {}), type };
    if (type === 'bearer' && !auth.bearer) {
      auth.bearer = [{ key: 'token', value: '', type: 'string' }];
    }
    if (type === 'basic' && !auth.basic) {
      auth.basic = [
        { key: 'username', value: '', type: 'string' },
        { key: 'password', value: '', type: 'string' }
      ];
    }
    if (type === 'apikey' && !auth.apikey) {
      auth.apikey = [
        { key: 'key', value: '', type: 'string' },
        { key: 'value', value: '', type: 'string' },
        { key: 'in', value: 'header', type: 'string' }
      ];
    }
    return { ...request, auth };
  });
}

export function setRequestBearerToken(item: PostmanItem, token: string): PostmanItem {
  return withRequest(item, (request) => {
    const auth: PostmanAuth = {
      ...(request.auth ?? {}),
      type: 'bearer',
      bearer: setAuthAttributeValue(request.auth?.bearer, 'token', token)
    };
    return { ...request, auth };
  });
}

export function setRequestBasicAuth(
  item: PostmanItem,
  patch: { username?: string; password?: string }
): PostmanItem {
  return withRequest(item, (request) => {
    let basic = request.auth?.basic;
    if (patch.username !== undefined) {
      basic = setAuthAttributeValue(basic, 'username', patch.username);
    }
    if (patch.password !== undefined) {
      basic = setAuthAttributeValue(basic, 'password', patch.password);
    }
    const auth: PostmanAuth = {
      ...(request.auth ?? {}),
      type: 'basic',
      basic: basic ?? []
    };
    return { ...request, auth };
  });
}

export function setRequestApiKeyAuth(
  item: PostmanItem,
  patch: { key?: string; value?: string; in?: string }
): PostmanItem {
  return withRequest(item, (request) => {
    let apikey = request.auth?.apikey;
    if (patch.key !== undefined) {
      apikey = setAuthAttributeValue(apikey, 'key', patch.key);
    }
    if (patch.value !== undefined) {
      apikey = setAuthAttributeValue(apikey, 'value', patch.value);
    }
    if (patch.in !== undefined) {
      apikey = setAuthAttributeValue(apikey, 'in', patch.in);
    }
    const auth: PostmanAuth = {
      ...(request.auth ?? {}),
      type: 'apikey',
      apikey: apikey ?? []
    };
    return { ...request, auth };
  });
}

function withUrlObject(
  item: PostmanItem,
  updater: (url: ReturnType<typeof ensureUrlObject>) => ReturnType<typeof ensureUrlObject>
): PostmanItem {
  return withRequest(item, (request) => {
    const url = ensureUrlObject(request.url);
    return { ...request, url: updater(url) };
  });
}

export function getRequestQueryParams(item: PostmanItem): PostmanQueryParam[] {
  if (typeof item.request === 'string' || !item.request) {
    return [];
  }
  if (!isUrlObject(item.request.url)) {
    return [];
  }
  return item.request.url.query ?? [];
}

/** Expand a string URL into an object so `query[]` can be edited. */
export function promoteRequestUrlToObject(item: PostmanItem): PostmanItem {
  return withUrlObject(item, (url) => url);
}

export function addRequestQueryParam(item: PostmanItem): PostmanItem {
  return withUrlObject(item, (url) =>
    setUrlQueryParams(url, [...(url.query ?? []), { key: '', value: '' }])
  );
}

export function updateRequestQueryParam(
  item: PostmanItem,
  index: number,
  patch: Pick<PostmanQueryParam, 'key' | 'value'>
): PostmanItem {
  return withUrlObject(item, (url) => {
    const params = [...(url.query ?? [])];
    if (index < 0 || index >= params.length) {
      throw new Error(`Query index out of range: ${index}`);
    }

    const next: PostmanQueryParam = { ...params[index] };
    if (patch.key !== undefined) {
      next.key = patch.key;
    }
    if (patch.value !== undefined) {
      next.value = patch.value;
    }
    params[index] = next;
    return setUrlQueryParams(url, params);
  });
}

export function setRequestQueryParamDisabled(
  item: PostmanItem,
  index: number,
  disabled: boolean
): PostmanItem {
  return withUrlObject(item, (url) => {
    const params = [...(url.query ?? [])];
    if (index < 0 || index >= params.length) {
      throw new Error(`Query index out of range: ${index}`);
    }

    const next: PostmanQueryParam = { ...params[index] };
    if (disabled) {
      next.disabled = true;
    } else {
      delete next.disabled;
    }
    params[index] = next;
    return setUrlQueryParams(url, params);
  });
}

export function removeRequestQueryParam(item: PostmanItem, index: number): PostmanItem {
  return withUrlObject(item, (url) => {
    const params = [...(url.query ?? [])];
    if (index < 0 || index >= params.length) {
      throw new Error(`Query index out of range: ${index}`);
    }
    params.splice(index, 1);
    return setUrlQueryParams(url, params);
  });
}

function getItemEvents(item: PostmanItem): PostmanEvent[] {
  return Array.isArray(item.event) ? item.event : [];
}

export function getItemScriptSource(
  item: PostmanItem,
  listen: PostmanScriptListen
): string {
  const event = getItemEvents(item).find((entry) => entry.listen === listen);
  return scriptExecToSource(event?.script?.exec);
}

/**
 * Upsert `item.event[]` for prerequest/test. Preserves sibling events and
 * unknown script fields (`id`, `src`, …). Empty source still writes
 * `exec: [""]` so Newman/Postman round-trips stay valid.
 */
export function setItemScriptSource(
  item: PostmanItem,
  listen: PostmanScriptListen,
  source: string
): PostmanItem {
  const events = [...getItemEvents(item)];
  const index = events.findIndex((entry) => entry.listen === listen);
  const exec = sourceToScriptExec(source);

  if (index === -1) {
    events.push({
      listen,
      script: {
        type: 'text/javascript',
        exec
      }
    });
  } else {
    const current = events[index]!;
    events[index] = {
      ...current,
      listen,
      script: {
        ...(current.script ?? {}),
        type: current.script?.type ?? 'text/javascript',
        exec
      }
    };
  }

  return { ...item, event: events };
}

export function getCollectionVariables(collection: PostmanCollection): PostmanVariable[] {
  return normalizeVariables(collection.variable);
}

export function setCollectionVariables(
  collection: PostmanCollection,
  variables: PostmanVariable[]
): PostmanCollection {
  return { ...collection, variable: variables };
}

export function getItemVariables(item: PostmanItem): PostmanVariable[] {
  return normalizeVariables(item.variable);
}

export function setItemVariables(item: PostmanItem, variables: PostmanVariable[]): PostmanItem {
  return { ...item, variable: variables };
}
