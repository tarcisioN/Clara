export type PostmanQueryParam = {
  key?: string;
  value?: string | null;
  disabled?: boolean;
  description?: string;
};

export type PostmanUrlObject = {
  raw?: string;
  protocol?: string;
  host?: string[];
  port?: string;
  path?: string[];
  hash?: string;
  query?: PostmanQueryParam[];
  variable?: Array<{ key?: string; value?: string }>;
  [key: string]: unknown;
};

export type PostmanUrl = string | PostmanUrlObject;

import type { PostmanBody } from './body.ts';
import type { PostmanAuth } from './auth.ts';

export type PostmanHeader = {
  key?: string;
  value?: string;
  disabled?: boolean;
  description?: string;
};

export type PostmanRequest = {
  method?: string;
  url?: PostmanUrl;
  header?: PostmanHeader[];
  body?: PostmanBody;
  auth?: PostmanAuth | null;
  description?: string;
};

export type PostmanItem = {
  name?: string;
  item?: PostmanItem[];
  request?: PostmanRequest | string;
  [key: string]: unknown;
};

export type PostmanCollection = {
  info?: {
    name?: string;
    schema?: string;
    description?: string;
    _postman_id?: string;
    [key: string]: unknown;
  };
  item?: PostmanItem[];
  variable?: unknown[];
  auth?: Record<string, unknown>;
  [key: string]: unknown;
};

const POSTMAN_V21_SCHEMA =
  'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';
const POSTMAN_V21_SCHEMA_ALT =
  'https://schema.postman.com/json/collection/v2.1.0/collection.json';

export type CollectionCounts = {
  folders: number;
  requests: number;
};

export function isPostmanCollection(value: unknown): value is PostmanCollection {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const collection = value as PostmanCollection;
  if (!collection.info || typeof collection.info !== 'object') {
    return false;
  }

  if (!Array.isArray(collection.item)) {
    return false;
  }

  return true;
}

export function assertPostmanCollection(value: unknown): PostmanCollection {
  if (!isPostmanCollection(value)) {
    throw new Error('File is not a Postman collection (missing info and/or item[])');
  }

  const schema = collectionSchema(value);
  if (schema && !isSupportedSchema(schema)) {
    throw new Error(`Unsupported Postman schema: ${schema}. Expected v2.1.`);
  }

  return value;
}

function collectionSchema(collection: PostmanCollection): string | undefined {
  return typeof collection.info?.schema === 'string' ? collection.info.schema : undefined;
}

function isSupportedSchema(schema: string): boolean {
  return (
    schema === POSTMAN_V21_SCHEMA ||
    schema === POSTMAN_V21_SCHEMA_ALT ||
    schema.includes('/collection/v2.1.0/')
  );
}

export function countItems(items: PostmanItem[] | undefined): CollectionCounts {
  let folders = 0;
  let requests = 0;

  const walk = (nodes: PostmanItem[]) => {
    for (const node of nodes) {
      const isFolder = Array.isArray(node.item);
      if (isFolder) {
        folders += 1;
        walk(node.item!);
      } else if (node.request !== undefined) {
        requests += 1;
      }
    }
  };

  walk(items ?? []);
  return { folders, requests };
}

/** Canonical on-disk format after edits: 2-space indent + trailing newline. */
export function serializeCollection(collection: PostmanCollection): string {
  return `${JSON.stringify(collection, null, 2)}\n`;
}
