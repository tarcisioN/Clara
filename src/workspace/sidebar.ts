export type SessionSidebar = {
  collectionsExpanded: boolean;
  environmentsExpanded: boolean;
  width: number;
  /** When true, selecting a main-panel tab reveals it in the sidebar. */
  followActiveTab: boolean;
};

export const SIDEBAR_MIN_WIDTH = 220;
export const SIDEBAR_MAX_WIDTH = 520;
export const SIDEBAR_DEFAULT_WIDTH = 270;

export const DEFAULT_SIDEBAR: SessionSidebar = {
  collectionsExpanded: true,
  environmentsExpanded: true,
  width: SIDEBAR_DEFAULT_WIDTH,
  followActiveTab: false
};

export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) {
    return SIDEBAR_DEFAULT_WIDTH;
  }
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
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
    width:
      typeof candidate.width === 'number'
        ? clampSidebarWidth(candidate.width)
        : DEFAULT_SIDEBAR.width,
    followActiveTab:
      typeof candidate.followActiveTab === 'boolean'
        ? candidate.followActiveTab
        : DEFAULT_SIDEBAR.followActiveTab
  };
}
