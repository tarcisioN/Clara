export type PostmanUrlEncodedParam = {
  key?: string;
  value?: string | null;
  disabled?: boolean;
  description?: string;
  type?: string;
};

export type PostmanFormdataParam = {
  key?: string;
  value?: string | null;
  disabled?: boolean;
  description?: string;
  type?: 'text' | 'file' | string;
  src?: string | string[] | null;
};

export type PostmanBodyMode = 'raw' | 'urlencoded' | 'formdata' | 'file' | 'graphql' | 'none';

export type RawBodyLanguage = 'json' | 'javascript' | 'text';

export type PostmanBody = {
  mode?: PostmanBodyMode | string;
  raw?: string;
  urlencoded?: PostmanUrlEncodedParam[];
  formdata?: PostmanFormdataParam[];
  file?: { src?: string | null };
  graphql?: { query?: string; variables?: string };
  options?: {
    raw?: { language?: string; [key: string]: unknown };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

/**
 * Highlighting language for a raw body: the language declared by Postman wins, and an
 * undeclared body falls back to sniffing so JSON payloads still highlight.
 */
export function resolveRawLanguage(body: PostmanBody | undefined): RawBodyLanguage {
  const declared = body?.options?.raw?.language;
  if (typeof declared === 'string' && declared.trim()) {
    const normalized = declared.trim().toLowerCase();
    if (normalized === 'json') {
      return 'json';
    }
    if (normalized === 'javascript') {
      return 'javascript';
    }
    return 'text';
  }

  const raw = (body?.raw ?? '').trimStart();
  return raw.startsWith('{') || raw.startsWith('[') ? 'json' : 'text';
}
