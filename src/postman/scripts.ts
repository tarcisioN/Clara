export type PostmanScriptListen = 'prerequest' | 'test';

export type PostmanScript = {
  id?: string;
  type?: string;
  exec?: string[] | string;
  src?: unknown;
  [key: string]: unknown;
};

export type PostmanEvent = {
  listen?: string;
  script?: PostmanScript;
  disabled?: boolean;
  [key: string]: unknown;
};

/** Join Postman `script.exec` into a textarea-friendly source string. */
export function scriptExecToSource(exec: string[] | string | undefined): string {
  if (exec == null) {
    return '';
  }
  if (typeof exec === 'string') {
    return exec;
  }
  return exec.join('\n');
}

/** Split source into Postman `exec[]` lines (empty script → `[""]`). */
export function sourceToScriptExec(source: string): string[] {
  if (source === '') {
    return [''];
  }
  return source.split('\n');
}

export function hasScriptContent(source: string): boolean {
  return source.trim().length > 0;
}
