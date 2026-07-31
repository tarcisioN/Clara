import type { PostmanUrl, PostmanUrlObject, PostmanQueryParam } from './types.ts';

type ParsedUrl = {
  protocol?: string;
  host?: string[];
  port?: string;
  path?: string[];
  query: PostmanQueryParam[];
  hash?: string;
};

export function isUrlObject(url: PostmanUrl | undefined): url is PostmanUrlObject {
  return typeof url === 'object' && url !== null;
}

export function getUrlRaw(url: PostmanUrl | undefined): string {
  if (url === undefined || url === null) {
    return '';
  }
  if (typeof url === 'string') {
    return url;
  }
  if (typeof url.raw === 'string') {
    return url.raw;
  }
  return buildRaw(url);
}

/**
 * Rewrites a URL from its raw form. Postman's SDK (and therefore Newman) resolves requests
 * from the structured members, not from `raw`, so the parts are re-derived on every edit.
 * `variable` and query params flagged `disabled` are carried over: neither is representable
 * in `raw`.
 */
export function setUrlRaw(url: PostmanUrl | undefined, raw: string): PostmanUrl {
  if (!isUrlObject(url)) {
    return raw;
  }

  const parsed = parseUrlString(raw);
  const disabled = (url.query ?? []).filter((param) => param.disabled);
  const query = [...parsed.query, ...disabled];

  const next: PostmanUrlObject = { ...url, raw };
  applyOrDelete(next, 'protocol', parsed.protocol);
  applyOrDelete(next, 'host', parsed.host);
  applyOrDelete(next, 'port', parsed.port);
  applyOrDelete(next, 'path', parsed.path);
  applyOrDelete(next, 'hash', parsed.hash);

  if (query.length > 0) {
    next.query = query;
  } else if (Array.isArray(url.query)) {
    next.query = [];
  } else {
    delete next.query;
  }

  return next;
}

function applyOrDelete<K extends keyof PostmanUrlObject>(
  url: PostmanUrlObject,
  key: K,
  value: PostmanUrlObject[K] | undefined
): void {
  if (value === undefined) {
    delete url[key];
  } else {
    url[key] = value;
  }
}

export function parseUrlString(raw: string): ParsedUrl {
  let rest = raw.trim();

  let hash: string | undefined;
  const hashIndex = rest.indexOf('#');
  if (hashIndex !== -1) {
    hash = rest.slice(hashIndex + 1);
    rest = rest.slice(0, hashIndex);
  }

  let queryString = '';
  const queryIndex = rest.indexOf('?');
  if (queryIndex !== -1) {
    queryString = rest.slice(queryIndex + 1);
    rest = rest.slice(0, queryIndex);
  }

  let protocol: string | undefined;
  const protocolMatch = rest.match(/^([a-zA-Z][a-zA-Z0-9+\-.]*):\/\//);
  if (protocolMatch) {
    protocol = protocolMatch[1];
    rest = rest.slice(protocolMatch[0].length);
  }

  let hostPart = rest;
  let path: string[] | undefined;
  const slashIndex = rest.indexOf('/');
  if (slashIndex !== -1) {
    hostPart = rest.slice(0, slashIndex);
    path = rest.slice(slashIndex + 1).split('/');
  }

  let port: string | undefined;
  const portMatch = hostPart.match(/:(\d+)$/);
  if (portMatch) {
    port = portMatch[1];
    hostPart = hostPart.slice(0, hostPart.length - portMatch[0].length);
  }

  return {
    protocol,
    host: hostPart ? splitHost(hostPart) : undefined,
    port,
    path,
    query: parseQuery(queryString),
    hash
  };
}

/** Splits on dots, but keeps `{{variables}}` whole even when they contain dots. */
function splitHost(hostPart: string): string[] {
  const segments: string[] = [];
  let current = '';
  let depth = 0;

  for (let index = 0; index < hostPart.length; index += 1) {
    if (hostPart.startsWith('{{', index)) {
      depth += 1;
      current += '{{';
      index += 1;
      continue;
    }
    if (hostPart.startsWith('}}', index)) {
      depth = Math.max(0, depth - 1);
      current += '}}';
      index += 1;
      continue;
    }
    const char = hostPart[index];
    if (char === '.' && depth === 0) {
      segments.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  segments.push(current);
  return segments;
}

function parseQuery(queryString: string): PostmanQueryParam[] {
  if (!queryString) {
    return [];
  }

  return queryString.split('&').map((pair) => {
    const separator = pair.indexOf('=');
    if (separator === -1) {
      return { key: pair, value: null };
    }
    return { key: pair.slice(0, separator), value: pair.slice(separator + 1) };
  });
}

export function buildRaw(url: PostmanUrlObject): string {
  const protocol = url.protocol ? `${url.protocol}://` : '';
  const host = (url.host ?? []).join('.');
  const port = url.port ? `:${url.port}` : '';
  const path = url.path && url.path.length > 0 ? `/${url.path.join('/')}` : '';

  const enabled = (url.query ?? []).filter((param) => !param.disabled);
  const query =
    enabled.length > 0
      ? `?${enabled
          .map((param) =>
            param.value === null || param.value === undefined
              ? (param.key ?? '')
              : `${param.key ?? ''}=${param.value}`
          )
          .join('&')}`
      : '';

  const hash = url.hash ? `#${url.hash}` : '';

  return `${protocol}${host}${port}${path}${query}${hash}`;
}

/** Promote a string URL (or missing url) into a structured Postman URL object. */
export function ensureUrlObject(url: PostmanUrl | undefined): PostmanUrlObject {
  if (isUrlObject(url)) {
    return url;
  }
  return setUrlRaw({}, getUrlRaw(url)) as PostmanUrlObject;
}

/**
 * Replace `query[]` and rebuild `raw` from structured members so Newman and the raw
 * field stay aligned. `protocol` / `host` / `port` / `path` / `hash` / `variable` are kept.
 * Disabled params stay in `query` but are omitted from `raw` (same as Postman).
 */
export function setUrlQueryParams(
  url: PostmanUrlObject,
  query: PostmanQueryParam[]
): PostmanUrlObject {
  const next: PostmanUrlObject = { ...url, query };
  next.raw = buildRaw(next);
  return next;
}
