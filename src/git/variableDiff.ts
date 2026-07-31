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
