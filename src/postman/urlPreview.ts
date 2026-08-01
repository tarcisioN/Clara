/**
 * Display-only {{var}} substitution for the URL bar.
 * Runtime interpolation still happens in Newman.
 */

const TOKEN = /\{\{\s*([^}]+?)\s*\}\}/g;

export type UrlPreviewResult = {
  preview: string;
  hasTokens: boolean;
  unresolved: string[];
};

export type UrlSegment = {
  text: string;
  /** Variable name when the segment is a `{{var}}` token. */
  key: string | null;
  /** Resolved value, or null when the token has no known variable. */
  value: string | null;
};

export function buildPreviewVariables(
  inherited: Array<{ key?: string; value?: string | null; disabled?: boolean }>,
  environmentValues?: Array<{
    key?: string;
    value?: string;
    enabled?: boolean;
  }>
): Map<string, string> {
  const map = new Map<string, string>();

  for (const variable of inherited) {
    if (variable.disabled) {
      continue;
    }
    const key = variable.key?.trim();
    if (!key) {
      continue;
    }
    map.set(key, variable.value ?? '');
  }

  for (const entry of environmentValues ?? []) {
    if (entry.enabled === false) {
      continue;
    }
    const key = entry.key?.trim();
    if (!key) {
      continue;
    }
    // Environment wins over collection/folder (Newman -e).
    map.set(key, entry.value ?? '');
  }

  return map;
}

export function interpolateUrlPreview(
  raw: string,
  variables: Map<string, string>
): UrlPreviewResult {
  const unresolved: string[] = [];
  let hasTokens = false;
  const preview = raw.replace(TOKEN, (_match, name: string) => {
    hasTokens = true;
    const key = name.trim();
    if (variables.has(key)) {
      return variables.get(key)!;
    }
    unresolved.push(key);
    return `{{${key}}}`;
  });
  return {
    preview,
    hasTokens,
    unresolved: [...new Set(unresolved)]
  };
}

/**
 * Split the raw URL into literal and `{{var}}` segments so the UI can render a
 * hover target per token while keeping the input's text intact.
 */
export function splitUrlSegments(
  raw: string,
  variables: Map<string, string>
): UrlSegment[] {
  const segments: UrlSegment[] = [];
  let cursor = 0;

  TOKEN.lastIndex = 0;
  let match = TOKEN.exec(raw);
  while (match) {
    if (match.index > cursor) {
      segments.push({ text: raw.slice(cursor, match.index), key: null, value: null });
    }
    const key = match[1].trim();
    segments.push({
      text: match[0],
      key,
      value: variables.has(key) ? variables.get(key)! : null
    });
    cursor = match.index + match[0].length;
    match = TOKEN.exec(raw);
  }

  if (cursor < raw.length) {
    segments.push({ text: raw.slice(cursor), key: null, value: null });
  }

  return segments;
}
