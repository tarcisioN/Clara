export type PostmanVariable = {
  key?: string;
  value?: string;
  type?: string;
  disabled?: boolean;
  description?: string;
  [key: string]: unknown;
};

export function normalizeVariables(value: unknown): PostmanVariable[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry) => entry && typeof entry === 'object') as PostmanVariable[];
}

export function addVariable(variables: PostmanVariable[]): PostmanVariable[] {
  return [...variables, { key: '', value: '', type: 'string' }];
}

export function updateVariable(
  variables: PostmanVariable[],
  index: number,
  patch: Pick<PostmanVariable, 'key' | 'value'>
): PostmanVariable[] {
  if (index < 0 || index >= variables.length) {
    throw new Error(`Variable index out of range: ${index}`);
  }
  const next = variables.slice();
  next[index] = { ...next[index], ...patch };
  return next;
}

export function setVariableDisabled(
  variables: PostmanVariable[],
  index: number,
  disabled: boolean
): PostmanVariable[] {
  if (index < 0 || index >= variables.length) {
    throw new Error(`Variable index out of range: ${index}`);
  }
  const next = variables.slice();
  const entry = { ...next[index] };
  if (disabled) {
    entry.disabled = true;
  } else {
    delete entry.disabled;
  }
  next[index] = entry;
  return next;
}

export function removeVariable(variables: PostmanVariable[], index: number): PostmanVariable[] {
  if (index < 0 || index >= variables.length) {
    throw new Error(`Variable index out of range: ${index}`);
  }
  const next = variables.slice();
  next.splice(index, 1);
  return next;
}
