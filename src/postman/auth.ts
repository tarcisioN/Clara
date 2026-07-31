export type PostmanAuthAttribute = {
  key?: string;
  value?: string;
  type?: string;
  [key: string]: unknown;
};

export type PostmanAuthType =
  | 'noauth'
  | 'bearer'
  | 'basic'
  | 'apikey'
  | 'digest'
  | 'oauth1'
  | 'oauth2'
  | 'hawkeye'
  | 'awsv4'
  | 'ntlm'
  | 'edgegrid'
  | 'asap'
  | string;

/**
 * Postman request/folder/collection auth. Active type is `type`; credentials live in a
 * sibling array named after that type (`bearer`, `basic`, `apikey`, …).
 */
export type PostmanAuth = {
  type?: PostmanAuthType;
  bearer?: PostmanAuthAttribute[];
  basic?: PostmanAuthAttribute[];
  apikey?: PostmanAuthAttribute[];
  [key: string]: unknown;
};

export type EditableAuthType = 'inherit' | 'noauth' | 'bearer' | 'basic' | 'apikey';

export function getAuthAttributeValue(
  attributes: PostmanAuthAttribute[] | undefined,
  key: string
): string {
  const found = attributes?.find((attribute) => attribute.key === key);
  return typeof found?.value === 'string' ? found.value : '';
}

/**
 * Upserts `{ key, value }` in the attribute array. Existing `type` / unknown fields on the
 * matching attribute are preserved; missing attributes are appended as `{ key, value, type: "string" }`.
 */
export function setAuthAttributeValue(
  attributes: PostmanAuthAttribute[] | undefined,
  key: string,
  value: string
): PostmanAuthAttribute[] {
  const next = [...(attributes ?? [])];
  const index = next.findIndex((attribute) => attribute.key === key);

  if (index === -1) {
    next.push({ key, value, type: 'string' });
    return next;
  }

  next[index] = { ...next[index], key, value };
  return next;
}

/**
 * Resolve the UI auth mode. Missing/`null` auth means inherit from folder/collection.
 * Unknown Postman types are returned as-is so the UI can treat them as read-only.
 */
export function resolveEditableAuthType(
  auth: PostmanAuth | null | undefined
): EditableAuthType | string {
  if (auth === undefined || auth === null || !auth.type) {
    return 'inherit';
  }
  if (
    auth.type === 'noauth' ||
    auth.type === 'bearer' ||
    auth.type === 'basic' ||
    auth.type === 'apikey'
  ) {
    return auth.type;
  }
  return auth.type;
}
