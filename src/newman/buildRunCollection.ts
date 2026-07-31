import type { PostmanAuth } from '../postman/auth.ts';
import type { PostmanCollection, PostmanItem, PostmanRequest } from '../postman/types.ts';
import { getItemByPath, isRequest, parseItemPath, type ItemPath } from '../postman/tree.ts';

const POSTMAN_V21_SCHEMA =
  'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requestAuth(item: PostmanItem): PostmanAuth | null | undefined {
  if (typeof item.request === 'string' || !item.request) {
    return undefined;
  }
  return item.request.auth;
}

/**
 * Walk ancestors (folder → collection) and return the nearest auth the request
 * would inherit. Request-level `auth` (including explicit `noauth`) wins.
 */
export function resolveInheritedAuth(
  collection: PostmanCollection,
  path: ItemPath
): PostmanAuth | undefined {
  const item = getItemByPath(collection.item, path);
  if (!item || !isRequest(item)) {
    return undefined;
  }

  const own = requestAuth(item);
  if (own !== undefined) {
    return own ?? undefined;
  }

  const indexes = parseItemPath(path);
  for (let depth = indexes.length - 1; depth >= 1; depth -= 1) {
    const parentPath = indexes.slice(0, depth).join('.');
    const parent = getItemByPath(collection.item, parentPath);
    if (parent?.auth && typeof parent.auth === 'object') {
      return parent.auth as PostmanAuth;
    }
  }

  if (collection.auth && typeof collection.auth === 'object') {
    return collection.auth as PostmanAuth;
  }

  return undefined;
}

/**
 * Build a one-request collection for Newman. Uses in-memory edits; never writes
 * the user's repo file. Folder-level auth is copied onto the request when the
 * request itself has no `auth` (so inheritance still works outside the folder).
 */
export function buildSingleRequestCollection(
  collection: PostmanCollection,
  path: ItemPath
): PostmanCollection {
  const item = getItemByPath(collection.item, path);
  if (!item || !isRequest(item)) {
    throw new Error(`No request at path ${path}`);
  }

  const cloned: PostmanItem = cloneJson(item);
  // Folders are never selected as requests; strip accidental nested items.
  delete cloned.item;

  const inherited = resolveInheritedAuth(collection, path);
  if (inherited && requestAuth(cloned) === undefined) {
    if (typeof cloned.request === 'string') {
      cloned.request = {
        method: 'GET',
        url: cloned.request,
        auth: cloneJson(inherited)
      };
    } else {
      const request: PostmanRequest = { ...(cloned.request ?? {}), auth: cloneJson(inherited) };
      cloned.request = request;
    }
  }

  const runCollection: PostmanCollection = {
    info: {
      name: `Clara run — ${cloned.name ?? path}`,
      schema:
        typeof collection.info?.schema === 'string'
          ? collection.info.schema
          : POSTMAN_V21_SCHEMA,
      _postman_id: `clara-run-${path.replace(/\./g, '-')}`
    },
    item: [cloned]
  };

  if (Array.isArray(collection.variable)) {
    runCollection.variable = cloneJson(collection.variable);
  }

  return runCollection;
}
