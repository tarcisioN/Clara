export type SessionSidebar = {
  collectionsExpanded: boolean;
  environmentsExpanded: boolean;
  /** When false, only the Changes header stays visible in the sidebar. */
  changesExpanded: boolean;
  width: number;
  /**
   * Ephemeral UI toggle — not restored across app launches.
   * When true, selecting a main-panel tab reveals it in the sidebar.
   */
  followActiveTab: boolean;
  /**
   * Ephemeral UI toggle — not restored across app launches.
   * When true and git compare is active, hide unchanged tree nodes.
   */
  changedOnly: boolean;
};

export const SIDEBAR_MIN_WIDTH = 220;
export const SIDEBAR_MAX_WIDTH = 520;
export const SIDEBAR_DEFAULT_WIDTH = 270;

/** Default pixel height for the Changes panel when expanded. */
export const CHANGES_DEFAULT_HEIGHT = 220;
export const CHANGES_MIN_HEIGHT = 120;
/** Dragging the resize handle below this height collapses the panel. */
export const CHANGES_COLLAPSE_HEIGHT = 56;

export const DEFAULT_SIDEBAR: SessionSidebar = {
  collectionsExpanded: true,
  environmentsExpanded: true,
  changesExpanded: true,
  width: SIDEBAR_DEFAULT_WIDTH,
  followActiveTab: false,
  changedOnly: false
};

export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) {
    return SIDEBAR_DEFAULT_WIDTH;
  }
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

export function clampChangesHeight(height: number, maxHeight?: number): number {
  if (!Number.isFinite(height)) {
    return CHANGES_DEFAULT_HEIGHT;
  }
  const ceiling =
    typeof maxHeight === 'number' && Number.isFinite(maxHeight)
      ? Math.max(CHANGES_MIN_HEIGHT, Math.round(maxHeight))
      : Number.POSITIVE_INFINITY;
  return Math.min(ceiling, Math.max(CHANGES_MIN_HEIGHT, Math.round(height)));
}

export function normalizeSidebar(value: unknown): SessionSidebar {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_SIDEBAR };
  }
  const candidate = value as Record<string, unknown>;
  return {
    collectionsExpanded:
      typeof candidate.collectionsExpanded === 'boolean'
        ? candidate.collectionsExpanded
        : DEFAULT_SIDEBAR.collectionsExpanded,
    environmentsExpanded:
      typeof candidate.environmentsExpanded === 'boolean'
        ? candidate.environmentsExpanded
        : DEFAULT_SIDEBAR.environmentsExpanded,
    changesExpanded:
      typeof candidate.changesExpanded === 'boolean'
        ? candidate.changesExpanded
        : DEFAULT_SIDEBAR.changesExpanded,
    width:
      typeof candidate.width === 'number'
        ? clampSidebarWidth(candidate.width)
        : DEFAULT_SIDEBAR.width,
    // Session-only filters: always start off after reopen / reload from disk.
    followActiveTab: DEFAULT_SIDEBAR.followActiveTab,
    changedOnly: DEFAULT_SIDEBAR.changedOnly
  };
}
