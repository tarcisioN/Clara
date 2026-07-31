export type ExternalChangeDecision = 'unchanged' | 'reload' | 'conflict';

/**
 * What to do when a file Clara has open changed on disk (editor, git checkout,
 * another Clara window). Unsaved edits win until the user asks for a reload.
 */
export function decideExternalChange(params: {
  diskRaw: string;
  loadedRaw: string;
  dirty: boolean;
  force?: boolean;
}): ExternalChangeDecision {
  const sameContent = params.diskRaw === params.loadedRaw;
  if (params.force) {
    // Explicit reload also discards unsaved edits, even when the file matches.
    return sameContent && !params.dirty ? 'unchanged' : 'reload';
  }
  if (sameContent) {
    return 'unchanged';
  }
  return params.dirty ? 'conflict' : 'reload';
}
