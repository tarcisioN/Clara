import {
  getItemScriptSource,
  getRequestAuth,
  getRequestBody,
  getRequestHeaders,
  getRequestQueryParams,
  setItemScriptSource,
  setRequestAuthType,
  setRequestMethod
} from '../postman/edit.ts';
import type { PostmanCollection, PostmanItem, PostmanRequest } from '../postman/types.ts';
import { isFolder, isRequest, updateItemByPath } from '../postman/tree.ts';
import { setUrlQueryParams } from '../postman/url.ts';
import { findPairedBaseItem } from './resolveBaseItem.ts';
import type { RequestSectionKey } from './semanticDiff.ts';

function cloneItem<T>(value: T): T {
  return structuredClone(value);
}

function withRequestObject(
  item: PostmanItem,
  updater: (request: PostmanRequest) => PostmanRequest
): PostmanItem {
  if (!isRequest(item)) {
    return item;
  }
  if (typeof item.request === 'string') {
    return {
      ...item,
      request: updater({ method: 'GET', url: item.request })
    };
  }
  return {
    ...item,
    request: updater(item.request ?? { method: 'GET', url: '' })
  };
}

/** Replace the current request/folder node with a deep clone of the paired base node. */
export function restoreItemFromBase(
  collection: PostmanCollection,
  path: string,
  baseCollection: PostmanCollection
): PostmanCollection {
  const baseItem = findPairedBaseItem(collection.item, baseCollection.item, path);
  if (!baseItem) {
    throw new Error('No paired base item to restore');
  }
  return {
    ...collection,
    item: updateItemByPath(collection.item, path, () => cloneItem(baseItem))
  };
}

/** Restore a single request section from the paired base request. */
export function restoreRequestSectionFromBase(
  current: PostmanItem,
  base: PostmanItem,
  section: RequestSectionKey
): PostmanItem {
  if (!isRequest(current) || !isRequest(base)) {
    throw new Error('Section restore requires request items');
  }

  switch (section) {
    case 'method': {
      const method =
        typeof base.request === 'string'
          ? 'GET'
          : (base.request?.method ?? 'GET');
      return setRequestMethod(current, method);
    }
    case 'url': {
      // Restore URL shell from base; keep current query params (Params is its own section).
      const currentParams = getRequestQueryParams(current);
      const next = withRequestObject(current, (request) => {
        if (typeof base.request === 'string') {
          return { ...request, url: base.request };
        }
        return {
          ...request,
          url: cloneItem(base.request?.url ?? '')
        };
      });
      return withRequestObject(next, (request) => {
        if (typeof request.url === 'string') {
          return request;
        }
        return {
          ...request,
          url: setUrlQueryParams(request.url ?? { raw: '' }, cloneItem(currentParams))
        };
      });
    }
    case 'params': {
      const params = getRequestQueryParams(base);
      return withRequestObject(current, (request) => {
        if (typeof request.url === 'string') {
          return request;
        }
        return {
          ...request,
          url: setUrlQueryParams(request.url ?? { raw: '' }, cloneItem(params))
        };
      });
    }
    case 'headers': {
      const headers = cloneItem(getRequestHeaders(base));
      return withRequestObject(current, (request) => ({
        ...request,
        header: headers
      }));
    }
    case 'body': {
      const body = getRequestBody(base);
      if (!body || !body.mode || body.mode === 'none') {
        return withRequestObject(current, (request) => {
          const next = { ...request };
          delete next.body;
          return next;
        });
      }
      return withRequestObject(current, (request) => ({
        ...request,
        body: cloneItem(body)
      }));
    }
    case 'auth': {
      const auth = getRequestAuth(base);
      if (!auth || auth.type === 'noauth') {
        return setRequestAuthType(current, 'noauth');
      }
      if (auth.type === 'bearer' || auth.type === 'basic' || auth.type === 'apikey') {
        let next = setRequestAuthType(current, auth.type);
        return withRequestObject(next, (request) => ({
          ...request,
          auth: cloneItem(auth)
        }));
      }
      return withRequestObject(current, (request) => ({
        ...request,
        auth: cloneItem(auth)
      }));
    }
    case 'prerequest':
      return setItemScriptSource(
        current,
        'prerequest',
        getItemScriptSource(base, 'prerequest')
      );
    case 'tests':
      return setItemScriptSource(current, 'test', getItemScriptSource(base, 'test'));
    default:
      return current;
  }
}

export function restoreFolderSubtreeFromBase(
  collection: PostmanCollection,
  path: string,
  baseCollection: PostmanCollection
): PostmanCollection {
  const baseItem = findPairedBaseItem(collection.item, baseCollection.item, path);
  if (!baseItem || !isFolder(baseItem)) {
    throw new Error('No paired base folder to restore');
  }
  return {
    ...collection,
    item: updateItemByPath(collection.item, path, () => cloneItem(baseItem))
  };
}

/** Replace collection-level `variable[]` with a deep clone from the base collection. */
export function restoreCollectionVariablesFromBase(
  collection: PostmanCollection,
  baseCollection: PostmanCollection
): PostmanCollection {
  if (baseCollection.variable === undefined) {
    const { variable: _removed, ...rest } = collection;
    return rest;
  }
  return {
    ...collection,
    variable: cloneItem(baseCollection.variable)
  };
}
