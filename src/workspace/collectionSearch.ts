import { getItemScriptSource } from '../postman/edit.ts';
import { getUrlRaw, isUrlObject } from '../postman/url.ts';
import {
  childPath,
  isFolder,
  isRequest,
  type ItemPath
} from '../postman/tree.ts';
import type { PostmanCollection, PostmanItem, PostmanRequest } from '../postman/types.ts';
import type { PinnedRequest } from './pinnedRequest.ts';
import { tabKey, type WorkspaceTab } from './tabs.ts';

export type SearchSection =
  | 'params'
  | 'body'
  | 'headers'
  | 'auth'
  | 'prerequest'
  | 'tests';

export type SearchField =
  | 'name'
  | 'method'
  | 'url'
  | 'path'
  | 'header'
  | 'body'
  | 'auth'
  | 'prerequest'
  | 'tests';

export type CollectionSearchHit = {
  id: string;
  kind: 'request' | 'folder';
  collectionPath: string;
  collectionName: string;
  path: ItemPath;
  draftId?: string;
  name: string;
  method: string;
  breadcrumb: string;
  field: SearchField;
  fieldLabel: string;
  snippet: string;
  score: number;
  section: SearchSection;
};

type SearchableField = {
  field: SearchField;
  fieldLabel: string;
  text: string;
  section: SearchSection;
  /** Higher = more important when ranking. */
  weight: number;
};

const MAX_FIELD_CHARS = 40_000;
const MAX_HITS = 60;
const SNIPPET_RADIUS = 42;

function truncate(text: string): string {
  if (text.length <= MAX_FIELD_CHARS) {
    return text;
  }
  return text.slice(0, MAX_FIELD_CHARS);
}

function requestMethod(request: PostmanRequest | string | undefined): string {
  if (typeof request === 'string') {
    return 'GET';
  }
  return (request?.method ?? 'GET').toUpperCase();
}

function requestUrl(request: PostmanRequest | string | undefined): string {
  if (typeof request === 'string') {
    return request;
  }
  return getUrlRaw(request?.url);
}

function buildSnippet(text: string, query: string, index: number): string {
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(text.length, index + query.length + SNIPPET_RADIUS);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.slice(start, end).replace(/\s+/g, ' ')}${suffix}`;
}

function collectRequestFields(item: PostmanItem): SearchableField[] {
  const fields: SearchableField[] = [];
  const request = item.request;
  const method = requestMethod(request);
  const url = requestUrl(request);

  fields.push({
    field: 'name',
    fieldLabel: 'Name',
    text: item.name?.trim() || 'Untitled request',
    section: 'params',
    weight: 100
  });
  fields.push({
    field: 'method',
    fieldLabel: 'Method',
    text: method,
    section: 'params',
    weight: 40
  });
  if (url) {
    fields.push({
      field: 'url',
      fieldLabel: 'URL',
      text: truncate(url),
      section: 'params',
      weight: 80
    });
  }

  if (typeof request === 'object' && request) {
    for (const header of request.header ?? []) {
      const key = header.key ?? '';
      const value = header.value ?? '';
      if (!key && !value) {
        continue;
      }
      fields.push({
        field: 'header',
        fieldLabel: key ? `Header · ${key}` : 'Header',
        text: truncate(`${key}: ${value}`),
        section: 'headers',
        weight: 35
      });
    }

    const body = request.body;
    if (body?.raw) {
      fields.push({
        field: 'body',
        fieldLabel: 'Body',
        text: truncate(body.raw),
        section: 'body',
        weight: 50
      });
    }
    if (body?.urlencoded) {
      const encoded = body.urlencoded
        .map((param) => `${param.key ?? ''}=${param.value ?? ''}`)
        .join('&');
      if (encoded) {
        fields.push({
          field: 'body',
          fieldLabel: 'Body · urlencoded',
          text: truncate(encoded),
          section: 'body',
          weight: 45
        });
      }
    }

    if (isUrlObject(request.url) && request.url.query) {
      const query = request.url.query
        .map((param) => `${param.key ?? ''}=${param.value ?? ''}`)
        .join('&');
      if (query) {
        fields.push({
          field: 'url',
          fieldLabel: 'Params',
          text: truncate(query),
          section: 'params',
          weight: 55
        });
      }
    }

    if (request.auth && typeof request.auth === 'object') {
      fields.push({
        field: 'auth',
        fieldLabel: 'Auth',
        text: truncate(JSON.stringify(request.auth)),
        section: 'auth',
        weight: 30
      });
    }
  }

  const prerequest = getItemScriptSource(item, 'prerequest');
  if (prerequest.trim()) {
    fields.push({
      field: 'prerequest',
      fieldLabel: 'Pre-request',
      text: truncate(prerequest),
      section: 'prerequest',
      weight: 45
    });
  }
  const tests = getItemScriptSource(item, 'test');
  if (tests.trim()) {
    fields.push({
      field: 'tests',
      fieldLabel: 'Tests',
      text: truncate(tests),
      section: 'tests',
      weight: 45
    });
  }

  return fields;
}

function scoreMatch(
  text: string,
  query: string,
  weight: number,
  field: SearchField
): { score: number; index: number } | null {
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  if (!needle) {
    return null;
  }
  const index = haystack.indexOf(needle);
  if (index < 0) {
    return null;
  }
  let score = weight * 10;
  if (index === 0) {
    score += 25;
  }
  if (haystack === needle) {
    score += 40;
  }
  // Prefer shorter fields (name over huge body) when weights tie.
  score += Math.max(0, 20 - Math.floor(text.length / 80));
  if (field === 'name') {
    score += 15;
  }
  return { score, index };
}

type EntrySource = {
  kind: 'request' | 'folder';
  collectionPath: string;
  collectionName: string;
  path: ItemPath;
  draftId?: string;
  item: PostmanItem;
  breadcrumbParts: string[];
};

function walkCollection(
  collectionPath: string,
  collectionName: string,
  items: PostmanItem[] | undefined,
  parent: ItemPath | null,
  trail: string[],
  into: EntrySource[]
): void {
  (items ?? []).forEach((item, index) => {
    const path = childPath(parent, index);
    const name = item.name?.trim() || (isFolder(item) ? 'Folder' : 'Untitled request');
    const nextTrail = [...trail, name];
    if (isFolder(item)) {
      into.push({
        kind: 'folder',
        collectionPath,
        collectionName,
        path,
        item,
        breadcrumbParts: nextTrail
      });
      walkCollection(collectionPath, collectionName, item.item, path, nextTrail, into);
      return;
    }
    if (isRequest(item)) {
      into.push({
        kind: 'request',
        collectionPath,
        collectionName,
        path,
        item,
        breadcrumbParts: nextTrail
      });
    }
  });
}

export type SearchableCollection = {
  filePath: string;
  collection: PostmanCollection;
};

/**
 * Build ranked hits across open collections (and optional draft pins).
 * Empty query returns a short “browse” list of requests by name.
 */
export function searchCollections(
  collections: SearchableCollection[],
  query: string,
  options?: {
    drafts?: Array<{ tab: WorkspaceTab; pin: PinnedRequest }>;
    limit?: number;
  }
): CollectionSearchHit[] {
  const limit = options?.limit ?? MAX_HITS;
  const normalized = query.trim().toLowerCase();
  const sources: EntrySource[] = [];

  for (const entry of collections) {
    const collectionName =
      entry.collection.info?.name?.trim() || entry.filePath.split(/[/\\]/).pop() || 'Collection';
    walkCollection(
      entry.filePath,
      collectionName,
      entry.collection.item,
      null,
      [collectionName],
      sources
    );
  }

  for (const draft of options?.drafts ?? []) {
    if (draft.tab.kind !== 'request' || !draft.pin.draft) {
      continue;
    }
    const tab = draft.tab;
    const collectionName =
      collections.find((entry) => entry.filePath === tab.collectionPath)?.collection.info?.name ??
      'Collection';
    sources.push({
      kind: 'request',
      collectionPath: tab.collectionPath,
      collectionName,
      path: tab.path,
      draftId: tab.draftId,
      item: draft.pin.item,
      breadcrumbParts: [collectionName, draft.pin.item.name?.trim() || 'Untitled request']
    });
  }

  if (!normalized) {
    return sources
      .filter((source) => source.kind === 'request')
      .slice(0, Math.min(20, limit))
      .map((source, index) => ({
        id: `${tabKey({
          kind: 'request',
          collectionPath: source.collectionPath,
          path: source.path,
          draftId: source.draftId
        })}:browse:${index}`,
        kind: 'request' as const,
        collectionPath: source.collectionPath,
        collectionName: source.collectionName,
        path: source.path,
        draftId: source.draftId,
        name: source.item.name?.trim() || 'Untitled request',
        method: requestMethod(source.item.request),
        breadcrumb: source.breadcrumbParts.slice(0, -1).join(' / ') || source.collectionName,
        field: 'name' as const,
        fieldLabel: 'Request',
        snippet: requestUrl(source.item.request) || 'No URL',
        score: 0,
        section: 'params' as const
      }));
  }

  const hits: CollectionSearchHit[] = [];

  for (const source of sources) {
    const breadcrumb = source.breadcrumbParts.slice(0, -1).join(' / ') || source.collectionName;
    const name = source.item.name?.trim() || (source.kind === 'folder' ? 'Folder' : 'Untitled request');

    if (source.kind === 'folder') {
      const pathText = source.breadcrumbParts.join(' / ');
      for (const candidate of [
        { field: 'name' as const, label: 'Folder', text: name, weight: 90, section: 'params' as const },
        { field: 'path' as const, label: 'Path', text: pathText, weight: 50, section: 'params' as const }
      ]) {
        const matched = scoreMatch(candidate.text, normalized, candidate.weight, candidate.field);
        if (!matched) {
          continue;
        }
        hits.push({
          id: `${source.collectionPath}:${source.path}:${candidate.field}`,
          kind: 'folder',
          collectionPath: source.collectionPath,
          collectionName: source.collectionName,
          path: source.path,
          name,
          method: 'DIR',
          breadcrumb,
          field: candidate.field,
          fieldLabel: candidate.label,
          snippet: buildSnippet(candidate.text, normalized, matched.index),
          score: matched.score,
          section: candidate.section
        });
      }
      continue;
    }

    const pathText = source.breadcrumbParts.join(' / ');
    const fields = [
      ...collectRequestFields(source.item),
      {
        field: 'path' as const,
        fieldLabel: 'Path',
        text: pathText,
        section: 'params' as const,
        weight: 40
      }
    ];

    let best: CollectionSearchHit | null = null;
    for (const field of fields) {
      const matched = scoreMatch(field.text, normalized, field.weight, field.field);
      if (!matched) {
        continue;
      }
      const hit: CollectionSearchHit = {
        id: `${tabKey({
          kind: 'request',
          collectionPath: source.collectionPath,
          path: source.path,
          draftId: source.draftId
        })}:${field.field}:${matched.index}`,
        kind: 'request',
        collectionPath: source.collectionPath,
        collectionName: source.collectionName,
        path: source.path,
        draftId: source.draftId,
        name,
        method: requestMethod(source.item.request),
        breadcrumb,
        field: field.field,
        fieldLabel: field.fieldLabel,
        snippet: buildSnippet(field.text, normalized, matched.index),
        score: matched.score,
        section: field.section
      };
      if (!best || hit.score > best.score) {
        best = hit;
      }
    }
    if (best) {
      hits.push(best);
    }
  }

  hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return hits.slice(0, limit);
}
