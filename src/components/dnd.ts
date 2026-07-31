/** Drag payload used when dropping a collection request onto the tab bar. */
export const ITEM_PATH_MIME = 'application/x-clara-item-path';

/** Drag payload used when reordering open request tabs. */
export const TAB_PATH_MIME = 'application/x-clara-tab-path';

/** A request drag identifies both the collection file and the item path inside it. */
export type ItemDragPayload = { collectionPath: string; path: string };

export function encodeItemDrag(payload: ItemDragPayload): string {
  return JSON.stringify(payload);
}

export function decodeItemDrag(raw: string): ItemDragPayload | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const candidate = parsed as Record<string, unknown>;
    if (
      typeof candidate.collectionPath !== 'string' ||
      typeof candidate.path !== 'string'
    ) {
      return null;
    }
    return { collectionPath: candidate.collectionPath, path: candidate.path };
  } catch {
    return null;
  }
}
