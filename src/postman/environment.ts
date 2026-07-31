export type PostmanEnvironmentValue = {
  key?: string;
  value?: string;
  enabled?: boolean;
  type?: string;
  [key: string]: unknown;
};

export type PostmanEnvironment = {
  id?: string;
  name?: string;
  values?: PostmanEnvironmentValue[];
  [key: string]: unknown;
};

export type LoadedEnvironment = {
  filePath: string;
  /** Original file bytes as text — used for dirty-free save. */
  originalRaw: string;
  environment: PostmanEnvironment;
};

export function isPostmanEnvironment(value: unknown): value is PostmanEnvironment {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.values);
}

export function assertPostmanEnvironment(value: unknown): PostmanEnvironment {
  if (!isPostmanEnvironment(value)) {
    throw new Error('File is not a Postman environment (missing values[])');
  }
  return value;
}

/** Canonical on-disk format after edits: 2-space indent + trailing newline. */
export function serializeEnvironment(environment: PostmanEnvironment): string {
  return `${JSON.stringify(environment, null, 2)}\n`;
}

function normalizeValue(value: PostmanEnvironmentValue): {
  key: string;
  value: string;
  enabled: boolean;
  type?: string;
} {
  return {
    key: value.key ?? '',
    value: value.value ?? '',
    enabled: value.enabled !== false,
    ...(typeof value.type === 'string' ? { type: value.type } : {})
  };
}

/** Semantic equality for dirty detection (ignores unknown extra fields order). */
export function environmentsEqual(a: PostmanEnvironment, b: PostmanEnvironment): boolean {
  if ((a.name ?? '') !== (b.name ?? '')) {
    return false;
  }
  if ((a.id ?? '') !== (b.id ?? '')) {
    return false;
  }
  const aValues = a.values ?? [];
  const bValues = b.values ?? [];
  if (aValues.length !== bValues.length) {
    return false;
  }
  for (let i = 0; i < aValues.length; i += 1) {
    const left = normalizeValue(aValues[i]!);
    const right = normalizeValue(bValues[i]!);
    if (
      left.key !== right.key ||
      left.value !== right.value ||
      left.enabled !== right.enabled ||
      (left.type ?? '') !== (right.type ?? '')
    ) {
      return false;
    }
  }
  return true;
}

export function isEnvironmentDirty(
  environment: PostmanEnvironment,
  originalRaw: string
): boolean {
  try {
    const baseline = assertPostmanEnvironment(JSON.parse(originalRaw));
    return !environmentsEqual(environment, baseline);
  } catch {
    return true;
  }
}

export function getEnvironmentValues(
  environment: PostmanEnvironment
): PostmanEnvironmentValue[] {
  return environment.values ?? [];
}

export function setEnvironmentValues(
  environment: PostmanEnvironment,
  values: PostmanEnvironmentValue[]
): PostmanEnvironment {
  return { ...environment, values };
}

export function renameEnvironment(
  environment: PostmanEnvironment,
  name: string
): PostmanEnvironment {
  return { ...environment, name };
}

export function addEnvironmentValue(
  values: PostmanEnvironmentValue[]
): PostmanEnvironmentValue[] {
  return [...values, { key: '', value: '', enabled: true, type: 'default' }];
}

export function updateEnvironmentValue(
  values: PostmanEnvironmentValue[],
  index: number,
  patch: Pick<PostmanEnvironmentValue, 'key' | 'value'>
): PostmanEnvironmentValue[] {
  return values.map((entry, i) => (i === index ? { ...entry, ...patch } : entry));
}

export function setEnvironmentValueEnabled(
  values: PostmanEnvironmentValue[],
  index: number,
  enabled: boolean
): PostmanEnvironmentValue[] {
  return values.map((entry, i) => (i === index ? { ...entry, enabled } : entry));
}

export function removeEnvironmentValue(
  values: PostmanEnvironmentValue[],
  index: number
): PostmanEnvironmentValue[] {
  return values.filter((_, i) => i !== index);
}
