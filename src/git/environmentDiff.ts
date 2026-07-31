import type { PostmanEnvironment, PostmanEnvironmentValue } from '../postman/environment.ts';
import { computeKeyedDiff, type KeyedDiff } from './keyedDiff.ts';

function rowFromValue(value: PostmanEnvironmentValue, index: number) {
  const key = value.key ?? '';
  const fingerprint = JSON.stringify({
    key,
    value: value.value ?? '',
    enabled: value.enabled !== false,
    type: value.type ?? ''
  });
  return { key: key || `__empty__:${index}`, fingerprint };
}

export function computeEnvironmentDiff(
  current: PostmanEnvironment,
  base: PostmanEnvironment
): KeyedDiff {
  const currentRows = (current.values ?? []).map(rowFromValue);
  const baseRows = (base.values ?? []).map(rowFromValue);
  return computeKeyedDiff(currentRows, baseRows);
}

export function restoreEnvironmentValueFromBase(
  current: PostmanEnvironment,
  base: PostmanEnvironment,
  key: string
): PostmanEnvironment {
  const baseValues = base.values ?? [];
  const baseEntry = baseValues.find((entry) => (entry.key ?? '') === key);
  if (!baseEntry) {
    throw new Error(`Base environment has no key "${key}"`);
  }

  const values = [...(current.values ?? [])];
  const index = values.findIndex((entry) => (entry.key ?? '') === key);
  if (index === -1) {
    values.push(structuredClone(baseEntry));
  } else {
    values[index] = structuredClone(baseEntry);
  }
  return { ...current, values };
}

export function restoreAllEnvironmentValuesFromBase(
  current: PostmanEnvironment,
  base: PostmanEnvironment
): PostmanEnvironment {
  return {
    ...current,
    values: structuredClone(base.values ?? [])
  };
}
