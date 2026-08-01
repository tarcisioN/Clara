import type { PostmanVariable } from '../postman/variables.ts';
import { normalizeVariables } from '../postman/variables.ts';
import { computeKeyedDiff, type KeyedDiff } from './keyedDiff.ts';

function rowFromVariable(variable: PostmanVariable, index: number) {
  const key = variable.key ?? '';
  const fingerprint = JSON.stringify({
    key,
    value: variable.value ?? '',
    disabled: Boolean(variable.disabled),
    type: variable.type ?? ''
  });
  return { key: key || `__empty__:${index}`, fingerprint };
}

export function computeVariableDiff(
  current: PostmanVariable[] | undefined,
  base: PostmanVariable[] | undefined
): KeyedDiff {
  return computeKeyedDiff(
    normalizeVariables(current).map(rowFromVariable),
    normalizeVariables(base).map(rowFromVariable)
  );
}

/** Insert or replace a variable by key using the base entry. */
export function restoreVariableFromBase(
  current: PostmanVariable[] | undefined,
  base: PostmanVariable[] | undefined,
  key: string
): PostmanVariable[] {
  const baseVars = normalizeVariables(base);
  const baseEntry = baseVars.find((entry) => (entry.key ?? '') === key);
  if (!baseEntry) {
    throw new Error(`Base variables have no key "${key}"`);
  }

  const values = [...normalizeVariables(current)];
  const index = values.findIndex((entry) => (entry.key ?? '') === key);
  if (index === -1) {
    values.push(structuredClone(baseEntry));
  } else {
    values[index] = structuredClone(baseEntry);
  }
  return values;
}

export function restoreAllVariablesFromBase(
  base: PostmanVariable[] | undefined
): PostmanVariable[] {
  return structuredClone(normalizeVariables(base));
}
