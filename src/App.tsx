import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { AppCommand } from '../electron/commands.ts';
import CollectionTree, { type TreeTarget } from './components/CollectionTree.tsx';
import ChangeListPanel from './components/ChangeListPanel.tsx';
import CollectionRunPane from './components/CollectionRunPane.tsx';
import ContextMenu, { type ContextMenuItem } from './components/ContextMenu.tsx';
import EnvironmentPane from './components/EnvironmentPane.tsx';
import RequestPane from './components/RequestPane.tsx';
import RequestDiffPane from './components/RequestDiffPane.tsx';
import RequestTabs, { type WorkspaceTabView } from './components/RequestTabs.tsx';
import PromptDialog, { type PromptRequest } from './components/PromptDialog.tsx';
import SaveAsDialog, {
  type SaveAsRequest,
  type SaveAsResult
} from './components/SaveAsDialog.tsx';
import ResponsePane from './components/ResponsePane.tsx';
import TerminalPane, { type TerminalEntry } from './components/TerminalPane.tsx';
import { buildTerminalEntry, nextTerminalEntries } from './components/terminalBuffer.ts';
import VariablesPane from './components/VariablesPane.tsx';
import { decodeItemDrag, ITEM_PATH_MIME } from './components/dnd.ts';
import { showClaraTooltip } from './components/claraTooltip.ts';
import {
  buildSingleRequestCollection,
  resolveInheritedVariables
} from './newman/buildRunCollection.ts';
import { buildPreviewVariables } from './postman/urlPreview.ts';
import {
  replaceRunExecution,
  type NewmanExecutionView,
  type NewmanRunView
} from './newman/parseResult.ts';
import {
  addEnvironmentValue,
  assertPostmanEnvironment,
  getEnvironmentValues,
  isEnvironmentDirty,
  removeEnvironmentValue,
  renameEnvironment,
  serializeEnvironment,
  setEnvironmentValueEnabled,
  setEnvironmentValues,
  updateEnvironmentValue,
  type LoadedEnvironment,
  type PostmanEnvironment
} from './postman/environment.ts';
import {
  assertPostmanCollection,
  countItems,
  serializeCollection,
  trailingNewlineFromRaw,
  type PostmanCollection,
  type PostmanItem
} from './postman/types.ts';
import {
  collectFolderPaths,
  countRequestsUnder,
  getItemByPath,
  isFolder,
  isRequest,
  resolveRunExecutionPath,
  updateItemByPath,
  type ItemPath
} from './postman/tree.ts';
import {
  createRequestItem,
  deleteItem,
  duplicateItem,
  insertItem,
  moveItem,
  parentPathOf,
  remapPathAfterDelete,
  remapPathAfterDuplicate,
  remapPathAfterInsert,
  renameCollection,
  renameItem,
  type MoveTarget
} from './postman/structure.ts';
import {
  addVariable,
  removeVariable,
  setVariableDisabled,
  updateVariable,
  type PostmanVariable
} from './postman/variables.ts';
import {
  addRequestHeader,
  addRequestQueryParam,
  addRequestUrlEncodedParam,
  getCollectionVariables,
  getItemVariables,
  removeRequestHeader,
  removeRequestQueryParam,
  removeRequestUrlEncodedParam,
  setCollectionVariables,
  setItemVariables,
  setRequestApiKeyAuth,
  setRequestAuthType,
  setRequestBasicAuth,
  setRequestBearerToken,
  setRequestBodyMode,
  setRequestBodyRaw,
  setRequestHeaderDisabled,
  setRequestMethod,
  setRequestQueryParamDisabled,
  setRequestUrl,
  setRequestUrlEncodedParamDisabled,
  updateCollectionItem,
  updateRequestHeader,
  updateRequestQueryParam,
  updateRequestUrlEncodedParam,
  setItemScriptSource
} from './postman/edit.ts';
import {
  fromSessionTab,
  isDraftTab,
  nextOpenTabs,
  parseTabKey,
  requestRunKey,
  sameTab,
  tabKey,
  toSessionTab,
  type OpenTabOptions,
  type WorkspaceTab
} from './workspace/tabs.ts';
import {
  clearCollectionDirty,
  createCollectionUiState,
  isCollectionDirty,
  type CollectionUiState
} from './workspace/collectionUi.ts';
import { computeDirtyState } from './workspace/dirty.ts';
import { decideExternalChange } from './workspace/externalChanges.ts';
import {
  deleteFromSavedCollection,
  writeCollectionMetaToSaved,
  writeItemToSavedCollection
} from './workspace/savedTree.ts';
import {
  createPinnedRequest,
  isPinnedDetached,
  isRequestTabPinned,
  listSaveAsLocations,
  markDetachedPins,
  remapPinnedTabKey,
  shouldKeepTabAfterReload,
  updatePinnedItem,
  type PinnedRequest
} from './workspace/pinnedRequest.ts';
import {
  discoverForCollection,
  loadCollectionAtRef,
  loadEnvironmentAtRef,
  type GitContext
} from './git/context.ts';
import {
  collectChangedFolderPaths,
  computeStructuralDiff,
  type StructuralDiff
} from './git/structuralDiff.ts';
import { findPairedBaseItem, findRemovedBaseItem, resolveBaseRequestItem } from './git/resolveBaseItem.ts';
import { computeSemanticDiff, type RequestSectionKey } from './git/semanticDiff.ts';
import { computeRequestFieldDiff } from './git/requestFieldDiff.ts';
import {
  flattenStructuralChanges,
  type ChangeListEntry
} from './git/changeList.ts';
import type { RemovedGhost } from './git/structuralDiff.ts';
import {
  restoreCollectionVariablesFromBase,
  restoreFolderSubtreeFromBase,
  restoreItemFromBase,
  restoreRequestSectionFromBase
} from './git/restoreFromBase.ts';
import {
  computeEnvironmentDiff,
  restoreAllEnvironmentValuesFromBase,
  restoreEnvironmentValueFromBase
} from './git/environmentDiff.ts';
import {
  computeVariableDiff,
  restoreAllVariablesFromBase,
  restoreVariableFromBase
} from './git/variableDiff.ts';
import type { KeyedDiff } from './git/keyedDiff.ts';
import {
  CHANGES_COLLAPSE_HEIGHT,
  CHANGES_DEFAULT_HEIGHT,
  CHANGES_MIN_HEIGHT,
  clampChangesHeight,
  clampSidebarWidth,
  DEFAULT_SIDEBAR,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  type SessionSidebar
} from './workspace/sidebar.ts';
import {
  collectMatchingFolderPaths,
  itemMatchesQuery,
  normalizeSidebarQuery,
  textMatchesQuery
} from './workspace/sidebarSearch.ts';
import './App.css';

type LoadedCollection = {
  filePath: string;
  /** Original file bytes as text — used for dirty-free save. */
  originalRaw: string;
  collection: PostmanCollection;
};

type CollectionCompareState = {
  baseRef: string;
  currentBranch: string | null;
  git: GitContext;
  baseCollection: PostmanCollection;
  diff: StructuralDiff;
  /** Compare in-memory edits vs last-saved file against the base ref. */
  compareSource: 'working' | 'saved';
};

type EnvironmentCompareState = {
  baseRef: string;
  git: GitContext;
  baseEnvironment: PostmanEnvironment;
  diff: KeyedDiff;
};

type CompareRefreshOptions = {
  baseRef?: string;
  /** Force re-reading the base blob (branch switch / manual refresh). */
  forceReloadBase?: boolean;
  compareSource?: 'working' | 'saved';
};

type CollectionTarget = { kind: 'collection'; collectionPath: string };
type EnvironmentTarget = { kind: 'environment'; environmentPath: string };
type ContextTarget =
  | TreeTarget
  | CollectionTarget
  | EnvironmentTarget
  | { kind: 'tab'; tab: WorkspaceTab }
  | { kind: 'change'; collectionPath: string; entry: ChangeListEntry }
  | {
      kind: 'run-result';
      tab: Extract<WorkspaceTab, { kind: 'collection' | 'folder' }>;
      index: number;
      name: string;
    };

type Status = { kind: 'idle' } | { kind: 'ok'; message: string } | { kind: 'error'; message: string };

const EMPTY_UI: CollectionUiState = createCollectionUiState();

function fileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

function countAssertions(execution: NewmanExecutionView): {
  passed: number;
  total: number;
} {
  return {
    passed: execution.assertions.filter((assertion) => assertion.ok).length,
    total: execution.assertions.length
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseCollection(raw: string): PostmanCollection {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('File is not valid JSON');
  }
  return assertPostmanCollection(parsed);
}

function parseEnvironment(raw: string): PostmanEnvironment {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('File is not valid JSON');
  }
  return assertPostmanEnvironment(parsed);
}

/** Keep only the tabs that belong to `collectionPath` and still point at a live item. */
function filterValidTabs(
  collectionPath: string,
  items: PostmanItem[] | undefined,
  tabs: WorkspaceTab[]
): WorkspaceTab[] {
  return tabs.filter((tab) => {
    if (tab.kind === 'environment' || tab.collectionPath !== collectionPath) {
      return false;
    }
    if (tab.kind === 'collection') {
      return true;
    }
    const item = getItemByPath(items, tab.path);
    if (!item) {
      return false;
    }
    if (tab.kind === 'folder') {
      return isFolder(item);
    }
    return isRequest(item);
  });
}

export default function App() {
  const [collections, setCollections] = useState<LoadedCollection[]>([]);
  const [environments, setEnvironments] = useState<LoadedEnvironment[]>([]);
  const [uiByPath, setUiByPath] = useState<Record<string, CollectionUiState>>({});
  const [compareByPath, setCompareByPath] = useState<Record<string, CollectionCompareState | null>>(
    {}
  );
  const [envCompareByPath, setEnvCompareByPath] = useState<
    Record<string, EnvironmentCompareState | null>
  >({});
  const [focusedChangeKey, setFocusedChangeKey] = useState<string | null>(null);
  const [collectionDropPath, setCollectionDropPath] = useState<string | null>(null);
  /** Per-request edit vs read-only diff pane (ephemeral; not in session). */
  const [requestViewModeByKey, setRequestViewModeByKey] = useState<
    Record<string, 'edit' | 'diff'>
  >({});
  /** Diff for a request that exists only in the base (removed from current). */
  const [removedDiffView, setRemovedDiffView] = useState<{
    collectionPath: string;
    ghostKey: string;
    item: PostmanItem;
    name: string;
  } | null>(null);
  const [compareBases, setCompareBases] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [openTabs, setOpenTabs] = useState<WorkspaceTab[]>([]);
  const [activeTab, setActiveTab] = useState<WorkspaceTab | null>(null);
  const [activeEnvironmentPath, setActiveEnvironmentPath] = useState<string | null>(null);
  const [sidebar, setSidebar] = useState<SessionSidebar>({ ...DEFAULT_SIDEBAR });
  const [environmentPanelHeight, setEnvironmentPanelHeight] =
    useState(CHANGES_DEFAULT_HEIGHT);
  const [changedOnlyNudge, setChangedOnlyNudge] = useState(0);
  const [sidebarQuery, setSidebarQuery] = useState('');
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [sessionHome, setSessionHome] = useState<string | null>(null);
  const [sendingKeys, setSendingKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [requestRuns, setRequestRuns] = useState<Record<string, NewmanRunView>>({});
  const [scopeRuns, setScopeRuns] = useState<Record<string, NewmanRunView>>({});
  const [runningKey, setRunningKey] = useState<string | null>(null);
  /** Sidebar highlight for a request clicked in a collection/folder run list. */
  const [runSidebarFocus, setRunSidebarFocus] = useState<{
    collectionPath: string;
    path: ItemPath;
  } | null>(null);
  /** Row currently being re-run inside an existing collection/folder run. */
  const [rerunningRow, setRerunningRow] = useState<{
    runKey: string;
    index: number;
  } | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalUnread, setTerminalUnread] = useState(false);
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([]);
  const [terminalHeight, setTerminalHeight] = useState(220);
  const terminalOpenRef = useRef(false);
  const terminalResizeRef = useRef<{ startY: number; startHeight: number } | null>(
    null
  );
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target: ContextTarget;
  } | null>(null);
  const [prompt, setPrompt] = useState<
    (PromptRequest & { resolve: (value: string | null) => void }) | null
  >(null);
  const [saveAsPrompt, setSaveAsPrompt] = useState<
    (SaveAsRequest & { resolve: (value: SaveAsResult | null) => void }) | null
  >(null);
  const [pinnedByKey, setPinnedByKey] = useState<Record<string, PinnedRequest>>({});
  const pinnedByKeyRef = useRef(pinnedByKey);
  const saveRequestAsRef = useRef<(tab: WorkspaceTab) => Promise<void>>(async () => {});

  const collectionsRef = useRef(collections);
  const environmentsRef = useRef(environments);
  const uiByPathRef = useRef(uiByPath);
  const compareByPathRef = useRef(compareByPath);
  const envCompareByPathRef = useRef(envCompareByPath);
  const openTabsRef = useRef(openTabs);
  const activeTabRef = useRef(activeTab);
  const activeEnvironmentPathRef = useRef(activeEnvironmentPath);
  const sidebarRef = useRef(sidebar);
  const compareBasesRef = useRef(compareBases);
  const sendingKeysRef = useRef(sendingKeys);
  const runningKeyRef = useRef(runningKey);
  const rerunningRowRef = useRef(rerunningRow);
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const environmentPanelRef = useRef<HTMLDivElement>(null);
  const environmentResizeRef = useRef<{
    startY: number;
    startHeight: number;
  } | null>(null);
  collectionsRef.current = collections;
  environmentsRef.current = environments;
  uiByPathRef.current = uiByPath;
  compareByPathRef.current = compareByPath;
  envCompareByPathRef.current = envCompareByPath;
  openTabsRef.current = openTabs;
  activeTabRef.current = activeTab;
  activeEnvironmentPathRef.current = activeEnvironmentPath;
  sidebarRef.current = sidebar;
  compareBasesRef.current = compareBases;
  sendingKeysRef.current = sendingKeys;
  runningKeyRef.current = runningKey;
  rerunningRowRef.current = rerunningRow;
  terminalOpenRef.current = terminalOpen;
  pinnedByKeyRef.current = pinnedByKey;

  const hasResources = collections.length > 0 || environments.length > 0;
  const sidebarFilter = normalizeSidebarQuery(sidebarQuery);
  const isSearching = sidebarFilter.length > 0;
  const collectionsSectionOpen = sidebar.collectionsExpanded;
  const environmentsSectionOpen = sidebar.environmentsExpanded;

  const anyDirty =
    collections.some((entry) => isCollectionDirty(uiByPath[entry.filePath] ?? EMPTY_UI)) ||
    environments.some((entry) => isEnvironmentDirty(entry.environment, entry.originalRaw));

  const activeCollection =
    activeTab && activeTab.kind !== 'environment'
      ? (collections.find((entry) => entry.filePath === activeTab.collectionPath) ?? null)
      : null;

  const activeEnvironment =
    activeTab?.kind === 'environment'
      ? (environments.find((entry) => entry.filePath === activeTab.environmentPath) ?? null)
      : null;

  const selectedActiveEnvironment =
    activeEnvironmentPath != null
      ? (environments.find((entry) => entry.filePath === activeEnvironmentPath) ?? null)
      : null;

  const countsByPath = useMemo(() => {
    const map: Record<string, ReturnType<typeof countItems>> = {};
    for (const entry of collections) {
      map[entry.filePath] = countItems(entry.collection.item);
    }
    return map;
  }, [collections]);

  const totalRequests = useMemo(
    () => Object.values(countsByPath).reduce((sum, counts) => sum + counts.requests, 0),
    [countsByPath]
  );

  const activeCounts = activeCollection ? countsByPath[activeCollection.filePath] : undefined;

  const tabs = useMemo<WorkspaceTabView[]>(() => {
    return openTabs.flatMap((tab): WorkspaceTabView[] => {
      if (tab.kind === 'environment') {
        const entry = environments.find(
          (candidate) => candidate.filePath === tab.environmentPath
        );
        if (!entry) {
          return [];
        }
        return [
          {
            tab,
            name: entry.environment.name?.trim() || 'Environment',
            badge: 'ENV',
            badgeClass: 'badge-environment',
            dirty: isEnvironmentDirty(entry.environment, entry.originalRaw)
          }
        ];
      }
      const entry = collections.find((candidate) => candidate.filePath === tab.collectionPath);
      if (!entry) {
        return [];
      }
      const ui = uiByPath[tab.collectionPath] ?? EMPTY_UI;
      if (tab.kind === 'collection') {
        const name = entry.collection.info?.name?.trim() || 'Collection';
        const requestCount = countsByPath[entry.filePath]?.requests ?? 0;
        const dirty = ui.collectionDirty || ui.structureDirty;
        return [
          {
            tab,
            name,
            badge: 'COL',
            badgeClass: 'badge-collection',
            dirty,
            tooltip: [
              name,
              'Collection',
              entry.filePath,
              `${requestCount} request${requestCount === 1 ? '' : 's'}`,
              dirty ? 'Unsaved changes' : 'Saved'
            ].join('\n')
          }
        ];
      }
      const pin = tab.kind === 'request' ? pinnedByKey[tabKey(tab)] : undefined;
      const item =
        pin?.item ?? getItemByPath(entry.collection.item, tab.path) ?? null;
      if (!item) {
        return [];
      }
      if (tab.kind === 'folder') {
        return [
          {
            tab,
            name: item.name?.trim() || 'Folder',
            badge: 'DIR',
            badgeClass: 'badge-folder',
            dirty: ui.dirtyFolderPaths.has(tab.path)
          }
        ];
      }
      const method =
        typeof item.request === 'string'
          ? 'GET'
          : (item.request?.method ?? 'GET').toUpperCase();
      const detached = Boolean(pin && isPinnedDetached(pin, entry.collection.item));
      const draft = isDraftTab(tab);
      const name = item.name?.trim() || 'Untitled';
      const note = draft
        ? 'Unsaved request — Save As adds it to the collection'
        : detached
          ? 'Pinned — not in the current collection file'
          : 'Pinned — survives reload / branch switches';
      return [
        {
          tab,
          name,
          badge: method,
          badgeClass: `method-${method.toLowerCase()}${pin && !draft ? ' badge-pinned' : ''}`,
          dirty: ui.dirtyPaths.has(tab.path) || detached,
          tooltip: pin ? [name, note, entry.filePath].join('\n') : undefined
        }
      ];
    });
  }, [collections, countsByPath, environments, pinnedByKey, uiByPath, openTabs]);

  const activeRequestPath = activeTab?.kind === 'request' ? activeTab.path : null;
  const activePin =
    activeTab?.kind === 'request' ? (pinnedByKey[tabKey(activeTab)] ?? null) : null;
  const activePinDetached = Boolean(
    activePin &&
      activeCollection &&
      isPinnedDetached(activePin, activeCollection.collection.item)
  );

  const selectedItem = useMemo(() => {
    if (!activeCollection || !activeRequestPath) {
      return null;
    }
    if (activePin) {
      return activePin.item;
    }
    return getItemByPath(activeCollection.collection.item, activeRequestPath) ?? null;
  }, [activeCollection, activePin, activeRequestPath]);

  const selectedRequest = useMemo(() => {
    if (!selectedItem || !isRequest(selectedItem)) {
      return null;
    }
    if (typeof selectedItem.request === 'string') {
      return { method: 'GET', url: selectedItem.request };
    }
    return selectedItem.request ?? null;
  }, [selectedItem]);

  const urlPreviewVariables = useMemo(() => {
    if (!activeCollection || !activeRequestPath) {
      return new Map<string, string>();
    }
    return buildPreviewVariables(
      resolveInheritedVariables(activeCollection.collection, activeRequestPath),
      selectedActiveEnvironment
        ? getEnvironmentValues(selectedActiveEnvironment.environment)
        : undefined
    );
  }, [activeCollection, activeRequestPath, selectedActiveEnvironment]);

  const activeCompare = activeCollection
    ? (compareByPath[activeCollection.filePath] ?? null)
    : null;

  const requestSemanticDiff = useMemo(() => {
    if (!activeCollection || !activeRequestPath || !selectedItem || !activeCompare) {
      return null;
    }
    if (activePinDetached) {
      // The path belongs to whatever is in the tree, not to this snapshot.
      return null;
    }
    const resolution = resolveBaseRequestItem(
      activeCompare.diff,
      activeCollection.collection,
      activeCompare.baseCollection,
      activeRequestPath
    );
    if (resolution.kind === 'none') {
      return null;
    }
    if (resolution.kind === 'added' || resolution.kind === 'missing') {
      return computeSemanticDiff(selectedItem, null);
    }
    return computeSemanticDiff(selectedItem, resolution.item);
  }, [activeCollection, activeCompare, activePinDetached, activeRequestPath, selectedItem]);

  const requestFieldDiff = useMemo(() => {
    if (!activeCollection || !activeRequestPath || !selectedItem || !activeCompare) {
      return null;
    }
    if (activePinDetached) {
      return null;
    }
    const resolution = resolveBaseRequestItem(
      activeCompare.diff,
      activeCollection.collection,
      activeCompare.baseCollection,
      activeRequestPath
    );
    if (resolution.kind === 'none') {
      return null;
    }
    if (resolution.kind === 'added' || resolution.kind === 'missing') {
      return computeRequestFieldDiff(selectedItem, null);
    }
    return computeRequestFieldDiff(selectedItem, resolution.item);
  }, [activeCollection, activeCompare, activePinDetached, activeRequestPath, selectedItem]);

  const activeRequestViewMode =
    activeTab?.kind === 'request'
      ? (requestViewModeByKey[tabKey(activeTab)] ?? 'edit')
      : 'edit';

  const showingRequestDiff =
    activeRequestViewMode === 'diff' &&
    Boolean(requestFieldDiff) &&
    Boolean(activeCompare);

  const removedFieldDiff = useMemo(() => {
    if (!removedDiffView) {
      return null;
    }
    return computeRequestFieldDiff(null, removedDiffView.item);
  }, [removedDiffView]);

  const showingRemovedDiff =
    Boolean(removedDiffView) &&
    focusedChangeKey === removedDiffView?.ghostKey &&
    Boolean(removedFieldDiff);

  const activeEnvCompare =
    activeTab?.kind === 'environment'
      ? (envCompareByPath[activeTab.environmentPath] ?? null)
      : null;

  const collectionVariableDiff = useMemo(() => {
    if (!activeCollection || !activeCompare) {
      return null;
    }
    return computeVariableDiff(
      activeCollection.collection.variable,
      activeCompare.baseCollection.variable
    );
  }, [activeCollection, activeCompare]);

  const folderBaseItem = useMemo(() => {
    if (
      !activeCollection ||
      !activeCompare ||
      activeTab?.kind !== 'folder' ||
      !activeTab.path
    ) {
      return null;
    }
    return findPairedBaseItem(
      activeCollection.collection.item,
      activeCompare.baseCollection.item,
      activeTab.path
    );
  }, [activeCollection, activeCompare, activeTab]);

  const folderVariableDiff = useMemo(() => {
    if (
      !activeCollection ||
      !activeCompare ||
      activeTab?.kind !== 'folder' ||
      !activeTab.path
    ) {
      return null;
    }
    const current = getItemByPath(activeCollection.collection.item, activeTab.path);
    if (!current || !folderBaseItem) {
      return null;
    }
    return computeVariableDiff(current.variable, folderBaseItem.variable);
  }, [activeCollection, activeCompare, activeTab, folderBaseItem]);

  const changeList = useMemo(() => {
    if (!activeCollection || !activeCompare) {
      return [] as ChangeListEntry[];
    }
    return flattenStructuralChanges(activeCollection.collection, activeCompare.diff);
  }, [activeCollection, activeCompare]);

  const activeFolder =
    activeTab?.kind === 'folder' && activeCollection
      ? getItemByPath(activeCollection.collection.item, activeTab.path)
      : null;

  const updateUi = useCallback(
    (collectionPath: string, updater: (ui: CollectionUiState) => CollectionUiState) => {
      setUiByPath((current) => {
        const previous = current[collectionPath] ?? createCollectionUiState();
        const next = updater(previous);
        if (next === previous && current[collectionPath]) {
          return current;
        }
        return {
          ...current,
          [collectionPath]: next
        };
      });
    },
    []
  );

  const syncDirty = useCallback(
    (collectionPath: string, collection: PostmanCollection, originalRaw: string) => {
      try {
        const baseline = assertPostmanCollection(JSON.parse(originalRaw));
        const snap = computeDirtyState(collection, baseline);
        updateUi(collectionPath, (ui) => ({ ...ui, ...snap }));
      } catch {
        updateUi(collectionPath, (ui) => ({ ...ui, structureDirty: true }));
      }
    },
    [updateUi]
  );

  /** Only on base (re)load: re-expanding on every diff recompute fights manual collapsing. */
  const expandChangedFolders = useCallback(
    (collectionPath: string, collection: PostmanCollection, diff: StructuralDiff) => {
      const folders = collectChangedFolderPaths(
        collection.item,
        diff.statusByPath,
        diff.descendantChangeCount
      );
      if (folders.size === 0 && diff.changedCount === 0) {
        return;
      }
      updateUi(collectionPath, (ui) => {
        const expanded = new Set(ui.expanded);
        let changed = !ui.collectionExpanded;
        for (const path of folders) {
          if (!expanded.has(path)) {
            expanded.add(path);
            changed = true;
          }
        }
        if (!changed && ui.collectionExpanded) {
          return ui;
        }
        return { ...ui, collectionExpanded: true, expanded };
      });
      setSidebar((current) =>
        current.collectionsExpanded ? current : { ...current, collectionsExpanded: true }
      );
    },
    [updateUi]
  );

  const refreshCompare = useCallback(
    async (
      collectionPath: string,
      collection: PostmanCollection,
      options?: CompareRefreshOptions
    ) => {
      try {
        const existing = compareByPathRef.current[collectionPath];
        const compareSource =
          options?.compareSource ?? existing?.compareSource ?? 'working';

        const entry = collectionsRef.current.find(
          (candidate) => candidate.filePath === collectionPath
        );
        let currentForDiff = collection;
        if (compareSource === 'saved' && entry) {
          try {
            currentForDiff = assertPostmanCollection(JSON.parse(entry.originalRaw));
          } catch {
            currentForDiff = collection;
          }
        }

        if (existing && !options?.forceReloadBase && !options?.baseRef) {
          const diff = computeStructuralDiff(currentForDiff, existing.baseCollection);
          setCompareByPath((current) => ({
            ...current,
            [collectionPath]: { ...existing, compareSource, diff }
          }));
          return;
        }

        const git =
          existing?.git && !options?.forceReloadBase
            ? existing.git
            : await discoverForCollection(collectionPath);
        if (!git) {
          setCompareByPath((current) => ({ ...current, [collectionPath]: null }));
          return;
        }

        const preferred =
          options?.baseRef ??
          compareBasesRef.current[git.repoRoot] ??
          existing?.baseRef ??
          git.defaultBase;

        let baseCollection: PostmanCollection | null;
        let baseRef = preferred;
        try {
          baseCollection = await loadCollectionAtRef(collectionPath, preferred);
        } catch (error) {
          if (preferred !== git.defaultBase) {
            baseRef = git.defaultBase;
            baseCollection = await loadCollectionAtRef(collectionPath, git.defaultBase);
            setStatus({
              kind: 'error',
              message: `Could not read ${preferred}; fell back to ${git.defaultBase}. ${errorMessage(error)}`
            });
          } else {
            throw error;
          }
        }

        if (!baseCollection) {
          setCompareByPath((current) => ({ ...current, [collectionPath]: null }));
          if (options?.baseRef || options?.forceReloadBase) {
            setStatus({
              kind: 'ok',
              message: `${fileName(collectionPath)} is not in ${baseRef}; nothing to compare`
            });
          }
          return;
        }

        const diff = computeStructuralDiff(currentForDiff, baseCollection);
        setCompareByPath((current) => ({
          ...current,
          [collectionPath]: {
            baseRef,
            currentBranch: git.currentBranch,
            git,
            baseCollection,
            diff,
            compareSource
          }
        }));
        setCompareBases((current) =>
          current[git.repoRoot] === baseRef
            ? current
            : { ...current, [git.repoRoot]: baseRef }
        );
        expandChangedFolders(collectionPath, collection, diff);
      } catch (error) {
        setCompareByPath((current) => ({ ...current, [collectionPath]: null }));
        setStatus({
          kind: 'error',
          message: `Compare failed: ${errorMessage(error)}`
        });
      }
    },
    [expandChangedFolders]
  );

  /**
   * Pick up edits made outside Clara (editor, git checkout, another window).
   * Unsaved edits are never overwritten unless the reload is explicit.
   */
  const syncCollectionFromDisk = useCallback(
    async (
      collectionPath: string,
      options?: { force?: boolean }
    ): Promise<PostmanCollection | null> => {
      const entry = collectionsRef.current.find(
        (candidate) => candidate.filePath === collectionPath
      );
      if (!entry) {
        return null;
      }

      let raw: string;
      try {
        raw = (await window.clara.readCollection(collectionPath)).raw;
      } catch {
        // Deleted or unreadable right now; keep what we have.
        return null;
      }

      const decision = decideExternalChange({
        diskRaw: raw,
        loadedRaw: entry.originalRaw,
        dirty: isCollectionDirty(uiByPathRef.current[collectionPath] ?? EMPTY_UI),
        force: options?.force
      });

      if (decision === 'unchanged') {
        return null;
      }

      if (decision === 'conflict') {
        setStatus({
          kind: 'error',
          message: `${fileName(collectionPath)} changed on disk; your unsaved edits were kept. Use Reload from disk to discard them.`
        });
        return null;
      }

      let collection: PostmanCollection;
      try {
        collection = parseCollection(raw);
      } catch (error) {
        setStatus({
          kind: 'error',
          message: `${fileName(collectionPath)} changed on disk but could not be read: ${errorMessage(error)}`
        });
        return null;
      }

      setCollections((list) =>
        list.map((candidate) =>
          candidate.filePath === collectionPath
            ? { ...candidate, collection, originalRaw: raw }
            : candidate
        )
      );
      updateUi(collectionPath, (ui) => clearCollectionDirty(ui));

      const validKeys = new Set(
        filterValidTabs(collectionPath, collection.item, openTabsRef.current).map(tabKey)
      );
      const pins = pinnedByKeyRef.current;
      setPinnedByKey((current) =>
        markDetachedPins(current, collectionPath, collection.item)
      );
      const survivingTabs = openTabsRef.current.filter((tab) =>
        shouldKeepTabAfterReload(tab, collectionPath, validKeys, pins)
      );
      if (survivingTabs.length !== openTabsRef.current.length) {
        setOpenTabs(survivingTabs);
        setActiveTab((current) =>
          current && !survivingTabs.some((tab) => sameTab(tab, current))
            ? (survivingTabs[0] ?? null)
            : current
        );
      }

      await refreshCompare(collectionPath, collection);
      setStatus({
        kind: 'ok',
        message: `Reloaded ${fileName(collectionPath)} from disk`
      });
      return collection;
    },
    [refreshCompare, updateUi]
  );

  const setCompareBaseRef = useCallback(
    async (collectionPath: string, baseRef: string) => {
      const entry = collectionsRef.current.find(
        (candidate) => candidate.filePath === collectionPath
      );
      if (!entry) {
        return;
      }
      setStatus({ kind: 'idle' });
      await refreshCompare(collectionPath, entry.collection, {
        baseRef,
        forceReloadBase: true
      });
    },
    [refreshCompare]
  );

  const setCompareSource = useCallback(
    async (collectionPath: string, compareSource: 'working' | 'saved') => {
      const entry = collectionsRef.current.find(
        (candidate) => candidate.filePath === collectionPath
      );
      if (!entry) {
        return;
      }
      await refreshCompare(collectionPath, entry.collection, { compareSource });
    },
    [refreshCompare]
  );

  const reloadCompareBase = useCallback(
    async (collectionPath: string) => {
      setStatus({ kind: 'idle' });
      // The working file may have moved on too, not just the base ref.
      const reloaded = await syncCollectionFromDisk(collectionPath);
      const entry = collectionsRef.current.find(
        (candidate) => candidate.filePath === collectionPath
      );
      const compare = compareByPathRef.current[collectionPath];
      if (!entry || !compare) {
        return;
      }
      await refreshCompare(collectionPath, reloaded ?? entry.collection, {
        baseRef: compare.baseRef,
        forceReloadBase: true,
        compareSource: compare.compareSource
      });
    },
    [refreshCompare, syncCollectionFromDisk]
  );

  const refreshEnvCompare = useCallback(
    async (environmentPath: string, environment: PostmanEnvironment) => {
      try {
        const existing = envCompareByPathRef.current[environmentPath];
        const git = existing?.git ?? (await discoverForCollection(environmentPath));
        if (!git) {
          setEnvCompareByPath((current) => ({ ...current, [environmentPath]: null }));
          return;
        }

        const preferred =
          compareBasesRef.current[git.repoRoot] ?? existing?.baseRef ?? git.defaultBase;

        let baseEnvironment: PostmanEnvironment | null;
        let baseRef = preferred;
        try {
          baseEnvironment = await loadEnvironmentAtRef(environmentPath, preferred);
        } catch (error) {
          if (preferred !== git.defaultBase) {
            baseRef = git.defaultBase;
            baseEnvironment = await loadEnvironmentAtRef(environmentPath, git.defaultBase);
            setStatus({
              kind: 'error',
              message: `Could not read ${preferred}; fell back to ${git.defaultBase}. ${errorMessage(error)}`
            });
          } else {
            throw error;
          }
        }

        if (!baseEnvironment) {
          setEnvCompareByPath((current) => ({ ...current, [environmentPath]: null }));
          return;
        }

        const diff = computeEnvironmentDiff(environment, baseEnvironment);
        setEnvCompareByPath((current) => ({
          ...current,
          [environmentPath]: {
            baseRef,
            git,
            baseEnvironment,
            diff
          }
        }));
        setCompareBases((current) =>
          current[git.repoRoot] === baseRef
            ? current
            : { ...current, [git.repoRoot]: baseRef }
        );
      } catch (error) {
        setEnvCompareByPath((current) => ({ ...current, [environmentPath]: null }));
        setStatus({
          kind: 'error',
          message: `Environment compare failed: ${errorMessage(error)}`
        });
      }
    },
    []
  );

  const syncEnvironmentFromDisk = useCallback(
    async (environmentPath: string, options?: { force?: boolean }) => {
      const entry = environmentsRef.current.find(
        (candidate) => candidate.filePath === environmentPath
      );
      if (!entry) {
        return;
      }

      let raw: string;
      try {
        raw = (await window.clara.readEnvironment(environmentPath)).raw;
      } catch {
        return;
      }

      const decision = decideExternalChange({
        diskRaw: raw,
        loadedRaw: entry.originalRaw,
        dirty: isEnvironmentDirty(entry.environment, entry.originalRaw),
        force: options?.force
      });

      if (decision === 'unchanged') {
        return;
      }

      if (decision === 'conflict') {
        setStatus({
          kind: 'error',
          message: `${fileName(environmentPath)} changed on disk; your unsaved edits were kept.`
        });
        return;
      }

      let environment: PostmanEnvironment;
      try {
        environment = parseEnvironment(raw);
      } catch (error) {
        setStatus({
          kind: 'error',
          message: `${fileName(environmentPath)} changed on disk but could not be read: ${errorMessage(error)}`
        });
        return;
      }

      setEnvironments((list) =>
        list.map((candidate) =>
          candidate.filePath === environmentPath
            ? { ...candidate, environment, originalRaw: raw }
            : candidate
        )
      );
      await refreshEnvCompare(environmentPath, environment);
      setStatus({
        kind: 'ok',
        message: `Reloaded ${fileName(environmentPath)} from disk`
      });
    },
    [refreshEnvCompare]
  );

  const syncOpenFilesFromDisk = useCallback(
    async (filePaths?: string[]) => {
      const targets = filePaths ? new Set(filePaths) : null;
      for (const entry of collectionsRef.current) {
        if (!targets || targets.has(entry.filePath)) {
          await syncCollectionFromDisk(entry.filePath);
        }
      }
      for (const entry of environmentsRef.current) {
        if (!targets || targets.has(entry.filePath)) {
          await syncEnvironmentFromDisk(entry.filePath);
        }
      }
    },
    [syncCollectionFromDisk, syncEnvironmentFromDisk]
  );

  const askText = useCallback(
    (request: PromptRequest): Promise<string | null> =>
      new Promise((resolve) => {
        setPrompt({ ...request, resolve });
      }),
    []
  );

  const askSaveAs = useCallback(
    (request: SaveAsRequest): Promise<SaveAsResult | null> =>
      new Promise((resolve) => {
        setSaveAsPrompt({ ...request, resolve });
      }),
    []
  );

  const applyCollectionUpdate = useCallback(
    (collectionPath: string, collection: PostmanCollection) => {
      const entry = collectionsRef.current.find(
        (candidate) => candidate.filePath === collectionPath
      );
      setCollections((list) =>
        list.map((candidate) =>
          candidate.filePath === collectionPath ? { ...candidate, collection } : candidate
        )
      );
      if (entry) {
        syncDirty(collectionPath, collection, entry.originalRaw);
      } else {
        updateUi(collectionPath, (ui) => ({ ...ui, structureDirty: true }));
      }
      void refreshCompare(collectionPath, collection);
    },
    [refreshCompare, syncDirty, updateUi]
  );

  /** Writes the collection to disk so the edit lands clean instead of pending a Save. */
  const persistCollection = useCallback(
    async (collectionPath: string, collection: PostmanCollection) => {
      const entry = collectionsRef.current.find(
        (candidate) => candidate.filePath === collectionPath
      );
      const contents = serializeCollection(collection, {
        trailingNewline: entry ? trailingNewlineFromRaw(entry.originalRaw) : true
      });
      await window.clara.saveCollection(collectionPath, contents);
      setCollections((list) =>
        list.map((candidate) =>
          candidate.filePath === collectionPath
            ? { ...candidate, collection, originalRaw: contents }
            : candidate
        )
      );
      setUiByPath((current) => ({
        ...current,
        [collectionPath]: clearCollectionDirty(
          current[collectionPath] ?? createCollectionUiState()
        )
      }));
      await refreshCompare(collectionPath, collection);
    },
    [refreshCompare]
  );

  const isTabDirty = useCallback((tab: WorkspaceTab): boolean => {
    if (tab.kind === 'environment') {
      const entry = environmentsRef.current.find(
        (candidate) => candidate.filePath === tab.environmentPath
      );
      return entry ? isEnvironmentDirty(entry.environment, entry.originalRaw) : false;
    }
    if (tab.kind === 'request') {
      const pin = pinnedByKeyRef.current[tabKey(tab)];
      if (pin) {
        const entry = collectionsRef.current.find(
          (candidate) => candidate.filePath === tab.collectionPath
        );
        if (entry && isPinnedDetached(pin, entry.collection.item)) {
          return true;
        }
      }
    }
    const ui = uiByPathRef.current[tab.collectionPath];
    if (!ui) {
      return false;
    }
    if (tab.kind === 'collection') {
      return ui.collectionDirty || ui.structureDirty;
    }
    if (tab.kind === 'folder') {
      return ui.dirtyFolderPaths.has(tab.path);
    }
    return ui.dirtyPaths.has(tab.path);
  }, []);

  const openTab = useCallback(
    (tab: WorkspaceTab, options?: OpenTabOptions) => {
      setOpenTabs((current) =>
        nextOpenTabs(current, tab, activeTabRef.current, {
          forceNew: options?.forceNew,
          // Dirty and pinned tabs keep their slot — opening another request appends.
          isDirty: (candidate) =>
            isTabDirty(candidate) ||
            isRequestTabPinned(candidate, pinnedByKeyRef.current)
        })
      );
      setActiveTab(tab);
    },
    [isTabDirty]
  );

  const activeEnvironmentJson = useCallback((): string | undefined => {
    const path = activeEnvironmentPathRef.current;
    if (!path) {
      return undefined;
    }
    const entry = environmentsRef.current.find((candidate) => candidate.filePath === path);
    if (!entry) {
      return undefined;
    }
    return serializeEnvironment(entry.environment);
  }, []);

  const mountCollectionFile = useCallback(
    (filePath: string, raw: string, options?: { forceNewTab?: boolean }) => {
      const collection = parseCollection(raw);
      const existing = collectionsRef.current.find((entry) => entry.filePath === filePath);
      if (existing) {
        openTab(
          { kind: 'collection', collectionPath: filePath },
          options?.forceNewTab ? { forceNew: true } : undefined
        );
        return collection.info?.name?.trim() || fileName(filePath);
      }

      setCollections((list) => [...list, { filePath, originalRaw: raw, collection }]);
      setUiByPath((current) => ({
        ...current,
        [filePath]: createCollectionUiState(collectFolderPaths(collection.item), true)
      }));
      setCompareByPath((current) => {
        const next = { ...current };
        delete next[filePath];
        return next;
      });
      {
        const cleared = { ...compareByPathRef.current };
        delete cleared[filePath];
        compareByPathRef.current = cleared;
      }
      openTab(
        { kind: 'collection', collectionPath: filePath },
        { forceNew: true }
      );
      void refreshCompare(filePath, collection);
      return collection.info?.name?.trim() || fileName(filePath);
    },
    [openTab, refreshCompare]
  );

  const openCollection = useCallback(async () => {
    setStatus({ kind: 'idle' });
    try {
      const result = await window.clara.openCollection();
      if (result.canceled || result.files.length === 0) {
        return;
      }

      const opened: string[] = [];
      const alreadyOpen: string[] = [];
      const failed: string[] = [];
      let focusPath: string | null = null;

      for (const file of result.files) {
        const existing = collectionsRef.current.find(
          (entry) => entry.filePath === file.filePath
        );
        if (existing) {
          alreadyOpen.push(existing.collection.info?.name ?? fileName(existing.filePath));
          focusPath = existing.filePath;
          continue;
        }

        try {
          const label = mountCollectionFile(file.filePath, file.raw);
          opened.push(label);
          focusPath = file.filePath;
        } catch (error) {
          failed.push(`${fileName(file.filePath)}: ${errorMessage(error)}`);
        }
      }

      if (focusPath && opened.length === 0) {
        openTab({ kind: 'collection', collectionPath: focusPath });
      }

      if (failed.length > 0 && opened.length === 0 && alreadyOpen.length === 0) {
        setStatus({ kind: 'error', message: failed.join(' · ') });
        return;
      }

      const parts: string[] = [];
      if (opened.length === 1) {
        parts.push(`Opened ${opened[0]}`);
      } else if (opened.length > 1) {
        parts.push(`Opened ${opened.length} collections`);
      }
      if (alreadyOpen.length === 1) {
        parts.push(`${alreadyOpen[0]} already open`);
      } else if (alreadyOpen.length > 1) {
        parts.push(`${alreadyOpen.length} already open`);
      }
      if (failed.length > 0) {
        parts.push(`${failed.length} failed`);
      }

      setStatus({
        kind: failed.length > 0 && opened.length === 0 ? 'error' : 'ok',
        message: parts.join(' · ') || 'Ready'
      });
    } catch (error) {
      setStatus({ kind: 'error', message: errorMessage(error) });
    }
  }, [mountCollectionFile, openTab]);

  const createNewCollection = useCallback(async () => {
    setStatus({ kind: 'idle' });
    const name = await askText({
      title: 'New collection',
      label: 'Collection name',
      defaultValue: 'New Collection',
      confirmLabel: 'Choose location…'
    });
    if (name == null) {
      return;
    }
    try {
      const result = await window.clara.createCollection(name);
      if (result.canceled) {
        return;
      }
      const label = mountCollectionFile(result.filePath, result.raw);
      setStatus({ kind: 'ok', message: `Created ${label}` });
    } catch (error) {
      setStatus({ kind: 'error', message: errorMessage(error) });
    }
  }, [askText, mountCollectionFile]);

  const createNewEnvironment = useCallback(async () => {
    setStatus({ kind: 'idle' });
    const name = await askText({
      title: 'New environment',
      label: 'Environment name',
      defaultValue: 'New Environment',
      confirmLabel: 'Choose location…'
    });
    if (name == null) {
      return;
    }
    try {
      const result = await window.clara.createEnvironment(name);
      if (result.canceled) {
        return;
      }
      const environment = parseEnvironment(result.raw);
      setEnvironments((list) => {
        const existing = list.some((entry) => entry.filePath === result.filePath);
        const loaded = {
          filePath: result.filePath,
          originalRaw: result.raw,
          environment
        };
        return existing
          ? list.map((entry) => (entry.filePath === result.filePath ? loaded : entry))
          : [...list, loaded];
      });
      openTab(
        { kind: 'environment', environmentPath: result.filePath },
        { forceNew: true }
      );
      setActiveEnvironmentPath(result.filePath);
      void refreshEnvCompare(result.filePath, environment);
      setStatus({
        kind: 'ok',
        message: `Created ${environment.name ?? fileName(result.filePath)}`
      });
    } catch (error) {
      setStatus({ kind: 'error', message: errorMessage(error) });
    }
  }, [askText, openTab, refreshEnvCompare]);

  const openEnvironment = useCallback(async () => {
    setStatus({ kind: 'idle' });
    try {
      const result = await window.clara.openEnvironment();
      if (result.canceled || result.files.length === 0) {
        return;
      }

      const opened: string[] = [];
      const alreadyOpen: string[] = [];
      const failed: string[] = [];
      let focusPath: string | null = null;

      for (const file of result.files) {
        const existing = environmentsRef.current.find(
          (entry) => entry.filePath === file.filePath
        );
        if (existing) {
          alreadyOpen.push(existing.environment.name ?? fileName(existing.filePath));
          focusPath = existing.filePath;
          continue;
        }

        try {
          const environment = parseEnvironment(file.raw);
          setEnvironments((list) => [
            ...list,
            { filePath: file.filePath, originalRaw: file.raw, environment }
          ]);
          openTab({ kind: 'environment', environmentPath: file.filePath }, { forceNew: true });
          if (activeEnvironmentPathRef.current == null) {
            setActiveEnvironmentPath(file.filePath);
          }
          opened.push(environment.name ?? fileName(file.filePath));
          focusPath = file.filePath;
          void refreshEnvCompare(file.filePath, environment);
        } catch (error) {
          failed.push(`${fileName(file.filePath)}: ${errorMessage(error)}`);
        }
      }

      if (focusPath && opened.length === 0) {
        openTab({ kind: 'environment', environmentPath: focusPath });
      }

      if (failed.length > 0 && opened.length === 0 && alreadyOpen.length === 0) {
        setStatus({ kind: 'error', message: failed.join(' · ') });
        return;
      }

      const parts: string[] = [];
      if (opened.length === 1) {
        parts.push(`Opened ${opened[0]}`);
      } else if (opened.length > 1) {
        parts.push(`Opened ${opened.length} environments`);
      }
      if (alreadyOpen.length === 1) {
        parts.push(`${alreadyOpen[0]} already open`);
      } else if (alreadyOpen.length > 1) {
        parts.push(`${alreadyOpen.length} already open`);
      }
      if (failed.length > 0) {
        parts.push(`${failed.length} failed`);
      }

      setStatus({
        kind: failed.length > 0 && opened.length === 0 ? 'error' : 'ok',
        message: parts.join(' · ') || 'Ready'
      });
    } catch (error) {
      setStatus({ kind: 'error', message: errorMessage(error) });
    }
  }, [openTab, refreshEnvCompare]);

  const closeEnvironment = useCallback((environmentPath: string) => {
    const entry = environmentsRef.current.find(
      (candidate) => candidate.filePath === environmentPath
    );
    if (entry && isEnvironmentDirty(entry.environment, entry.originalRaw)) {
      if (!window.confirm('This environment has unsaved changes. Close anyway?')) {
        return;
      }
    }

    setEnvironments((list) => list.filter((candidate) => candidate.filePath !== environmentPath));
    setEnvCompareByPath((current) => {
      const next = { ...current };
      delete next[environmentPath];
      return next;
    });
    setActiveEnvironmentPath((current) => (current === environmentPath ? null : current));

    const remaining = openTabsRef.current.filter(
      (tab) => !(tab.kind === 'environment' && tab.environmentPath === environmentPath)
    );
    setOpenTabs(remaining);
    setActiveTab((active) =>
      active?.kind === 'environment' && active.environmentPath === environmentPath
        ? (remaining[0] ?? null)
        : active
    );
    setContextMenu(null);
    setStatus({ kind: 'ok', message: `Closed ${fileName(environmentPath)}` });
  }, []);

  const closeCollection = useCallback((collectionPath: string) => {
    const ui = uiByPathRef.current[collectionPath];
    if (ui && isCollectionDirty(ui)) {
      if (!window.confirm('This collection has unsaved changes. Close anyway?')) {
        return;
      }
    }

    setCollections((list) => list.filter((entry) => entry.filePath !== collectionPath));
    setUiByPath((current) => {
      const next = { ...current };
      delete next[collectionPath];
      return next;
    });
    setCompareByPath((current) => {
      const next = { ...current };
      delete next[collectionPath];
      return next;
    });

    const remaining = openTabsRef.current.filter(
      (tab) => tab.kind === 'environment' || tab.collectionPath !== collectionPath
    );
    setOpenTabs(remaining);
    setActiveTab((active) =>
      active &&
      active.kind !== 'environment' &&
      active.collectionPath === collectionPath
        ? (remaining[0] ?? null)
        : active
    );

    const runPrefix = requestRunKey(collectionPath, '');
    setRequestRuns((runs) =>
      Object.fromEntries(Object.entries(runs).filter(([key]) => !key.startsWith(runPrefix)))
    );
    setScopeRuns((runs) =>
      Object.fromEntries(
        Object.entries(runs).filter(([key]) => {
          const tab = parseTabKey(key);
          return !(tab && tab.kind !== 'environment' && tab.collectionPath === collectionPath);
        })
      )
    );
    setContextMenu(null);
    setStatus({ kind: 'ok', message: `Closed ${fileName(collectionPath)}` });
  }, []);

  /**
   * ⇧⌘S — write every dirty collection and environment file in full.
   * When `preferSingle` is set (no active tab), stop after the first dirty one.
   */
  const saveAllDirty = useCallback(
    async (options?: { preferSingle?: boolean }) => {
      const collectionsList = collectionsRef.current;
      const environmentsList = environmentsRef.current;
      if (collectionsList.length === 0 && environmentsList.length === 0) {
        return;
      }

      setStatus({ kind: 'idle' });
      const savedNames: string[] = [];
      try {
        for (const saveEnvironment of environmentsList) {
          if (
            !isEnvironmentDirty(saveEnvironment.environment, saveEnvironment.originalRaw)
          ) {
            continue;
          }
          const contents = serializeEnvironment(saveEnvironment.environment, {
            trailingNewline: trailingNewlineFromRaw(saveEnvironment.originalRaw)
          });
          await window.clara.saveEnvironment(saveEnvironment.filePath, contents);
          setEnvironments((current) =>
            current.map((entry) =>
              entry.filePath === saveEnvironment.filePath
                ? { ...entry, originalRaw: contents }
                : entry
            )
          );
          savedNames.push(fileName(saveEnvironment.filePath));
          if (options?.preferSingle) {
            setStatus({ kind: 'ok', message: `Saved ${saveEnvironment.filePath}` });
            return;
          }
        }

        for (const saveCollection of collectionsList) {
          if (!isCollectionDirty(uiByPathRef.current[saveCollection.filePath] ?? EMPTY_UI)) {
            continue;
          }
          const contents = serializeCollection(saveCollection.collection, {
            trailingNewline: trailingNewlineFromRaw(saveCollection.originalRaw)
          });
          await window.clara.saveCollection(saveCollection.filePath, contents);
          setCollections((current) =>
            current.map((entry) =>
              entry.filePath === saveCollection.filePath
                ? { ...entry, originalRaw: contents }
                : entry
            )
          );
          setUiByPath((current) => ({
            ...current,
            [saveCollection.filePath]: clearCollectionDirty(
              current[saveCollection.filePath] ?? createCollectionUiState()
            )
          }));
          void refreshCompare(saveCollection.filePath, saveCollection.collection);
          savedNames.push(fileName(saveCollection.filePath));
          if (options?.preferSingle) {
            setStatus({ kind: 'ok', message: `Saved ${saveCollection.filePath}` });
            return;
          }
        }

        if (savedNames.length === 0) {
          setStatus({ kind: 'ok', message: 'No changes to save' });
          return;
        }
        setStatus({
          kind: 'ok',
          message:
            savedNames.length === 1
              ? `Saved ${savedNames[0]}`
              : `Saved ${savedNames.length} files · ${savedNames.join(', ')}`
        });
      } catch (error) {
        setStatus({ kind: 'error', message: errorMessage(error) });
      }
    },
    [refreshCompare]
  );

  /**
   * ⌘S — save only the active tab. Request/folder tabs write that item into the
   * last-saved file so sibling edits stay dirty; collection tabs write meta only
   * (or the whole file when structure changed); environment tabs write their file.
   */
  const saveActiveTab = useCallback(async () => {
    const collectionsList = collectionsRef.current;
    const environmentsList = environmentsRef.current;
    if (collectionsList.length === 0 && environmentsList.length === 0) {
      return;
    }

    const active = activeTabRef.current;
    if (active?.kind === 'request') {
      const pin = pinnedByKeyRef.current[tabKey(active)];
      const entry = collectionsList.find(
        (candidate) => candidate.filePath === active.collectionPath
      );
      if (pin && entry && isPinnedDetached(pin, entry.collection.item)) {
        await saveRequestAsRef.current(active);
        return;
      }
    }

    setStatus({ kind: 'idle' });
    try {
      if (!active) {
        // No tab — fall back to saving the first dirty resource (full file).
        await saveAllDirty({ preferSingle: true });
        return;
      }

      if (active.kind === 'environment') {
        const saveEnvironment = environmentsList.find(
          (entry) => entry.filePath === active.environmentPath
        );
        if (!saveEnvironment) {
          return;
        }
        const hasDirty = isEnvironmentDirty(
          saveEnvironment.environment,
          saveEnvironment.originalRaw
        );
        const contents = hasDirty
          ? serializeEnvironment(saveEnvironment.environment, {
              trailingNewline: trailingNewlineFromRaw(saveEnvironment.originalRaw)
            })
          : saveEnvironment.originalRaw;
        await window.clara.saveEnvironment(saveEnvironment.filePath, contents);
        setEnvironments((current) =>
          current.map((entry) =>
            entry.filePath === saveEnvironment.filePath
              ? { ...entry, originalRaw: contents }
              : entry
          )
        );
        setStatus({ kind: 'ok', message: `Saved ${fileName(saveEnvironment.filePath)}` });
        return;
      }

      const saveCollection = collectionsList.find(
        (entry) => entry.filePath === active.collectionPath
      );
      if (!saveCollection) {
        return;
      }

      const ui = uiByPathRef.current[saveCollection.filePath] ?? EMPTY_UI;
      let baseline: PostmanCollection;
      try {
        baseline = assertPostmanCollection(JSON.parse(saveCollection.originalRaw));
      } catch {
        await persistCollection(saveCollection.filePath, saveCollection.collection);
        setStatus({
          kind: 'ok',
          message: `Saved ${fileName(saveCollection.filePath)}`
        });
        return;
      }

      if (active.kind === 'collection') {
        if (ui.structureDirty) {
          // Reorders / inserts / deletes need a full write.
          await persistCollection(saveCollection.filePath, saveCollection.collection);
          setStatus({
            kind: 'ok',
            message: `Saved ${fileName(saveCollection.filePath)}`
          });
          return;
        }
        if (!ui.collectionDirty) {
          setStatus({ kind: 'ok', message: 'No changes to save' });
          return;
        }
        const nextSaved = writeCollectionMetaToSaved(saveCollection.collection, baseline);
        const contents = serializeCollection(nextSaved, {
          trailingNewline: trailingNewlineFromRaw(saveCollection.originalRaw)
        });
        await window.clara.saveCollection(saveCollection.filePath, contents);
        setCollections((current) =>
          current.map((entry) =>
            entry.filePath === saveCollection.filePath
              ? { ...entry, originalRaw: contents }
              : entry
          )
        );
        syncDirty(saveCollection.filePath, saveCollection.collection, contents);
        void refreshCompare(saveCollection.filePath, saveCollection.collection);
        setStatus({
          kind: 'ok',
          message: `Saved collection variables · ${fileName(saveCollection.filePath)}`
        });
        return;
      }

      // request or folder tab — write only that item
      if (active.kind === 'request' && !ui.dirtyPaths.has(active.path)) {
        setStatus({ kind: 'ok', message: 'No changes to save' });
        return;
      }
      if (active.kind === 'folder' && !ui.dirtyFolderPaths.has(active.path)) {
        setStatus({ kind: 'ok', message: 'No changes to save' });
        return;
      }

      const nextSaved = writeItemToSavedCollection(
        saveCollection.collection,
        baseline,
        active.path
      );
      if (!nextSaved) {
        setStatus({
          kind: 'error',
          message:
            active.kind === 'request'
              ? 'Cannot save this request alone yet — use Save All (⇧⌘S) or Save As'
              : 'Cannot save this folder alone yet — use Save All (⇧⌘S)'
        });
        return;
      }

      const contents = serializeCollection(nextSaved, {
        trailingNewline: trailingNewlineFromRaw(saveCollection.originalRaw)
      });
      await window.clara.saveCollection(saveCollection.filePath, contents);
      setCollections((current) =>
        current.map((entry) =>
          entry.filePath === saveCollection.filePath
            ? { ...entry, originalRaw: contents }
            : entry
        )
      );
      syncDirty(saveCollection.filePath, saveCollection.collection, contents);
      void refreshCompare(saveCollection.filePath, saveCollection.collection);
      const label =
        getItemByPath(saveCollection.collection.item, active.path)?.name?.trim() ||
        active.kind;
      setStatus({
        kind: 'ok',
        message: `Saved “${label}” · ${fileName(saveCollection.filePath)}`
      });
    } catch (error) {
      setStatus({ kind: 'error', message: errorMessage(error) });
    }
  }, [persistCollection, refreshCompare, saveAllDirty, syncDirty]);

  const pushTerminalEntry = useCallback((label: string, result: NewmanRunView) => {
    const entry = buildTerminalEntry(label, result);
    setTerminalEntries((current) =>
      nextTerminalEntries(current, entry, terminalOpenRef.current)
    );
    if (!terminalOpenRef.current) {
      setTerminalUnread(true);
    }
  }, []);

  const runSingleRequest = useCallback(async (tab: WorkspaceTab) => {
    if (tab.kind !== 'request') {
      return;
    }
    const { collectionPath, path } = tab;
    const entry = collectionsRef.current.find(
      (candidate) => candidate.filePath === collectionPath
    );
    const key = tabKey(tab);
    // Only block a second Send on the same tab; other tabs can fly in parallel.
    if (!entry || sendingKeysRef.current.has(key)) {
      return;
    }

    const pin = pinnedByKeyRef.current[key];
    setSendingKeys((current) => new Set(current).add(key));
    setStatus({ kind: 'idle' });
    try {
      let runCollection;
      if (pin && isPinnedDetached(pin, entry.collection.item)) {
        const cloned = JSON.parse(JSON.stringify(pin.item)) as PostmanItem;
        delete cloned.item;
        runCollection = {
          info: {
            name: `Clara run — ${cloned.name ?? path}`,
            schema:
              typeof entry.collection.info?.schema === 'string'
                ? entry.collection.info.schema
                : 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
            _postman_id: `clara-pin-${key}`
          },
          item: [cloned],
          ...(entry.collection.variable ? { variable: entry.collection.variable } : {})
        };
      } else {
        runCollection = buildSingleRequestCollection(entry.collection, path);
      }
      const environmentJson = activeEnvironmentJson();
      const result = await window.clara.runNewman(serializeCollection(runCollection), {
        ...(environmentJson ? { environmentJson } : {})
      });
      setRequestRuns((runs) => ({
        ...runs,
        [requestRunKey(collectionPath, path, tab.draftId)]: result
      }));
      const label =
        result.execution?.name ??
        pin?.item.name ??
        getItemByPath(entry.collection.item, path)?.name ??
        'Request';
      pushTerminalEntry(label, result);
      const code = result.execution?.code;
      const unsaved =
        (uiByPathRef.current[collectionPath]?.dirtyPaths.has(path) ?? false) ||
        Boolean(pin && isPinnedDetached(pin, entry.collection.item));
      if (result.missingNewman) {
        setStatus({ kind: 'error', message: result.error ?? 'Newman not found' });
      } else {
        setStatus({
          kind: result.error && !result.execution ? 'error' : 'ok',
          message: result.execution
            ? `Newman ${code ?? '—'} ${result.execution.status}${
                unsaved ? ' · unsaved edits' : ''
              }`.trim()
            : result.error ?? 'Newman finished'
        });
      }
    } catch (error) {
      setStatus({ kind: 'error', message: errorMessage(error) });
    } finally {
      setSendingKeys((current) => {
        if (!current.has(key)) {
          return current;
        }
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }, [activeEnvironmentJson, pushTerminalEntry]);

  const sendRequest = useCallback(async () => {
    const tab = activeTabRef.current;
    if (!tab || tab.kind !== 'request') {
      return;
    }
    await runSingleRequest(tab);
  }, [runSingleRequest]);

  const runScope = useCallback(async (tab: WorkspaceTab) => {
    if (tab.kind !== 'collection' && tab.kind !== 'folder') {
      return;
    }
    const entry = collectionsRef.current.find(
      (candidate) => candidate.filePath === tab.collectionPath
    );
    if (!entry || runningKeyRef.current || rerunningRowRef.current) {
      return;
    }

    const key = tabKey(tab);
    let folderName: string | undefined;
    if (tab.kind === 'folder') {
      const folder = getItemByPath(entry.collection.item, tab.path);
      if (!folder || !isFolder(folder)) {
        return;
      }
      folderName = folder.name?.trim() || undefined;
      if (!folderName) {
        setStatus({
          kind: 'error',
          message: 'Folder needs a name for Newman --folder'
        });
        return;
      }
    }

    setRunningKey(key);
    setActiveTab(tab);
    setStatus({ kind: 'idle' });
    try {
      const environmentJson = activeEnvironmentJson();
      const result = await window.clara.runNewman(serializeCollection(entry.collection), {
        ...(folderName ? { folder: folderName } : {}),
        ...(environmentJson ? { environmentJson } : {})
      });
      setScopeRuns((runs) => ({ ...runs, [key]: result }));
      pushTerminalEntry(
        tab.kind === 'folder'
          ? folderName ?? 'Folder run'
          : entry.collection.info?.name?.trim() || 'Collection run',
        result
      );
      const total = result.executions.length;
      const failed = result.failures.length;
      const unsaved = (uiByPathRef.current[tab.collectionPath]?.dirtyPaths.size ?? 0) > 0;
      setStatus({
        kind: result.error && total === 0 ? 'error' : 'ok',
        message: result.error
          ? result.error
          : `${tab.kind === 'folder' ? 'Folder' : 'Collection'} run · ${total} request${
              total === 1 ? '' : 's'
            }${failed ? ` · ${failed} failure${failed === 1 ? '' : 's'}` : ''}${
              unsaved ? ' · unsaved edits' : ''
            }`
      });
    } catch (error) {
      setStatus({ kind: 'error', message: errorMessage(error) });
    } finally {
      setRunningKey(null);
    }
  }, [activeEnvironmentJson, pushTerminalEntry]);

  /**
   * Re-run one row of a collection/folder run and patch just that row, so the
   * rest of the run output stays on screen.
   */
  const rerunScopeExecution = useCallback(
    async (
      tab: WorkspaceTab,
      executions: NewmanExecutionView[],
      index: number
    ) => {
      if (tab.kind !== 'collection' && tab.kind !== 'folder') {
        return;
      }
      const entry = collectionsRef.current.find(
        (candidate) => candidate.filePath === tab.collectionPath
      );
      if (!entry || runningKeyRef.current || rerunningRowRef.current) {
        return;
      }

      const scopePath = tab.kind === 'folder' ? tab.path : null;
      const path = resolveRunExecutionPath(
        entry.collection.item,
        scopePath,
        executions,
        index
      );
      if (!path) {
        setStatus({
          kind: 'error',
          message: 'Could not match this result to a request — run the scope again'
        });
        return;
      }

      const runKey = tabKey(tab);
      setRerunningRow({ runKey, index });
      setStatus({ kind: 'idle' });
      try {
        const runCollection = buildSingleRequestCollection(entry.collection, path);
        const environmentJson = activeEnvironmentJson();
        const result = await window.clara.runNewman(serializeCollection(runCollection), {
          ...(environmentJson ? { environmentJson } : {})
        });
        const execution = result.executions[0] ?? null;
        setRequestRuns((runs) => ({
          ...runs,
          [requestRunKey(tab.collectionPath, path)]: result
        }));
        pushTerminalEntry(
          execution?.name ??
            getItemByPath(entry.collection.item, path)?.name ??
            'Request',
          result
        );

        if (!execution) {
          setStatus({
            kind: 'error',
            message: result.error ?? 'Newman returned no result for this request'
          });
          return;
        }

        setScopeRuns((runs) => {
          const current = runs[runKey];
          if (!current) {
            return runs;
          }
          return {
            ...runs,
            [runKey]: replaceRunExecution(current, index, execution)
          };
        });

        const { passed, total } = countAssertions(execution);
        setStatus({
          kind: 'ok',
          message: `Re-ran ${execution.name} · ${execution.code ?? '—'} ${
            execution.status
          }${total > 0 ? ` · tests ${passed}/${total}` : ''}`.trim()
        });
      } catch (error) {
        setStatus({ kind: 'error', message: errorMessage(error) });
      } finally {
        setRerunningRow(null);
      }
    },
    [activeEnvironmentJson, pushTerminalEntry]
  );

  const openRequestTab = useCallback(
    (
      collectionPath: string,
      path: ItemPath,
      options?: OpenTabOptions & { viewMode?: 'edit' | 'diff' }
    ) => {
      const entry = collectionsRef.current.find(
        (candidate) => candidate.filePath === collectionPath
      );
      if (!entry) {
        return;
      }
      const item = getItemByPath(entry.collection.item, path);
      if (!item || !isRequest(item)) {
        return;
      }
      setRunSidebarFocus(null);
      openTab({ kind: 'request', collectionPath, path }, options);
      const key = tabKey({ kind: 'request', collectionPath, path });
      const viewMode = options?.viewMode ?? 'edit';
      setRequestViewModeByKey((current) =>
        current[key] === viewMode ? current : { ...current, [key]: viewMode }
      );
      setRemovedDiffView(null);
    },
    [openTab]
  );

  const openFolderTab = useCallback(
    (collectionPath: string, path: ItemPath, options?: OpenTabOptions) => {
      const entry = collectionsRef.current.find(
        (candidate) => candidate.filePath === collectionPath
      );
      if (!entry) {
        return;
      }
      const item = getItemByPath(entry.collection.item, path);
      if (!item || !isFolder(item)) {
        return;
      }
      setRunSidebarFocus(null);
      openTab({ kind: 'folder', collectionPath, path }, options);
      updateUi(collectionPath, (ui) =>
        ui.expanded.has(path)
          ? ui
          : { ...ui, expanded: new Set(ui.expanded).add(path) }
      );
    },
    [openTab, updateUi]
  );

  const closeTab = useCallback(
    (tab: WorkspaceTab, options?: { force?: boolean }) => {
      const force = options?.force ?? false;
      if (!force && isTabDirty(tab)) {
        if (!window.confirm('This tab has unsaved changes. Close anyway?')) {
          return;
        }
      }
      const current = openTabsRef.current;
      const index = current.findIndex((entry) => sameTab(entry, tab));
      if (index === -1) {
        return;
      }
      const next = current.filter((entry) => !sameTab(entry, tab));
      if (tab.kind === 'request') {
        const key = tabKey(tab);
        setPinnedByKey((pins) => {
          if (!pins[key]) {
            return pins;
          }
          const { [key]: _removed, ...rest } = pins;
          return rest;
        });
      }
      setOpenTabs(next);
      setActiveTab((active) =>
        active && sameTab(active, tab)
          ? (next[Math.min(index, next.length - 1)] ?? null)
          : active
      );
    },
    [isTabDirty]
  );

  const closeOtherTabs = useCallback(
    (keep: WorkspaceTab, options?: { force?: boolean }) => {
      const force = options?.force ?? false;
      const others = openTabsRef.current.filter((tab) => !sameTab(tab, keep));
      if (!force && others.some(isTabDirty)) {
        if (!window.confirm('Some tabs have unsaved changes. Close them anyway?')) {
          return;
        }
      }
      setOpenTabs([keep]);
      setActiveTab(keep);
    },
    [isTabDirty]
  );

  const closeAllTabs = useCallback(
    (options?: { force?: boolean }) => {
      const force = options?.force ?? false;
      if (!force && openTabsRef.current.some(isTabDirty)) {
        if (!window.confirm('Some tabs have unsaved changes. Close all anyway?')) {
          return;
        }
      }
      setOpenTabs([]);
      setActiveTab(null);
    },
    [isTabDirty]
  );

  const cycleTab = useCallback((delta: number) => {
    const tabsList = openTabsRef.current;
    if (tabsList.length === 0) {
      return;
    }
    const currentIndex = activeTabRef.current
      ? tabsList.findIndex((tab) => sameTab(tab, activeTabRef.current!))
      : -1;
    const nextIndex =
      currentIndex === -1
        ? 0
        : (currentIndex + delta + tabsList.length) % tabsList.length;
    setActiveTab(tabsList[nextIndex] ?? null);
  }, []);

  const selectTabAt = useCallback((index: number) => {
    const tab = openTabsRef.current[index];
    if (tab) {
      setActiveTab(tab);
    }
  }, []);

  const reorderTabs = useCallback(
    (fromTab: WorkspaceTab, toTab: WorkspaceTab, place: 'before' | 'after') => {
      setOpenTabs((current) => {
        const from = current.findIndex((tab) => sameTab(tab, fromTab));
        const to = current.findIndex((tab) => sameTab(tab, toTab));
        if (from === -1 || to === -1 || sameTab(fromTab, toTab)) {
          return current;
        }
        const next = current.filter((tab) => !sameTab(tab, fromTab));
        let insertAt = next.findIndex((tab) => sameTab(tab, toTab));
        if (insertAt === -1) {
          return current;
        }
        if (place === 'after') {
          insertAt += 1;
        }
        next.splice(insertAt, 0, fromTab);
        return next;
      });
    },
    []
  );

  useEffect(() => {
    if (!sidebarFilter) {
      return;
    }

    const openCollections = collectionsRef.current;
    const openEnvironments = environmentsRef.current;

    const anyCollectionMatch = openCollections.some((entry) => {
      const name = entry.collection.info?.name?.trim() || 'Untitled collection';
      return (
        textMatchesQuery(name, sidebarFilter) ||
        (entry.collection.item ?? []).some((item) => itemMatchesQuery(item, sidebarFilter))
      );
    });
    const anyEnvironmentMatch = openEnvironments.some((entry) => {
      const name = entry.environment.name?.trim() || 'Untitled environment';
      return (
        textMatchesQuery(name, sidebarFilter) ||
        textMatchesQuery(fileName(entry.filePath), sidebarFilter)
      );
    });

    setSidebar((current) => {
      const collectionsExpanded = anyCollectionMatch ? true : current.collectionsExpanded;
      const environmentsExpanded = anyEnvironmentMatch ? true : current.environmentsExpanded;
      if (
        collectionsExpanded === current.collectionsExpanded &&
        environmentsExpanded === current.environmentsExpanded
      ) {
        return current;
      }
      return { ...current, collectionsExpanded, environmentsExpanded };
    });

    setUiByPath((current) => {
      let changed = false;
      const next = { ...current };
      for (const entry of openCollections) {
        const name = entry.collection.info?.name?.trim() || 'Untitled collection';
        const matchingFolders = collectMatchingFolderPaths(
          entry.collection.item,
          sidebarFilter
        );
        const hasMatch =
          textMatchesQuery(name, sidebarFilter) ||
          matchingFolders.size > 0 ||
          (entry.collection.item ?? []).some((item) =>
            itemMatchesQuery(item, sidebarFilter)
          );
        if (!hasMatch) {
          continue;
        }

        const ui = next[entry.filePath] ?? createCollectionUiState();
        const expanded = new Set(ui.expanded);
        let expandedChanged = !ui.collectionExpanded;
        for (const path of matchingFolders) {
          if (!expanded.has(path)) {
            expanded.add(path);
            expandedChanged = true;
          }
        }
        if (!expandedChanged) {
          continue;
        }
        next[entry.filePath] = {
          ...ui,
          collectionExpanded: true,
          expanded
        };
        changed = true;
      }
      return changed ? next : current;
    });
  }, [sidebarFilter]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [session, home] = await Promise.all([
          window.clara.loadSession(),
          window.clara.getSessionHome()
        ]);
        if (cancelled) {
          return;
        }
        setSessionHome(home);
        setSidebar(session.sidebar ?? { ...DEFAULT_SIDEBAR });
        setCompareBases(session.compareBases ?? {});

        const entries = session.collections ?? [];
        const envPaths = session.openedEnvironments ?? [];

        const restored: LoadedCollection[] = [];
        const restoredUi: Record<string, CollectionUiState> = {};
        const failures: string[] = [];

        for (const entry of entries) {
          try {
            const result = await window.clara.readCollection(entry.path);
            if (cancelled) {
              return;
            }
            const collection = parseCollection(result.raw);
            restored.push({
              filePath: result.filePath,
              originalRaw: result.raw,
              collection
            });
            restoredUi[result.filePath] = createCollectionUiState(
              entry.expandedPaths.length
                ? entry.expandedPaths
                : collectFolderPaths(collection.item),
              entry.collectionExpanded
            );
          } catch (error) {
            failures.push(`${fileName(entry.path)}: ${errorMessage(error)}`);
          }
        }

        const restoredEnvs: LoadedEnvironment[] = [];
        const envFailures: string[] = [];
        for (const envPath of envPaths) {
          try {
            const result = await window.clara.readEnvironment(envPath);
            if (cancelled) {
              return;
            }
            const environment = parseEnvironment(result.raw);
            restoredEnvs.push({
              filePath: result.filePath,
              originalRaw: result.raw,
              environment
            });
          } catch (error) {
            envFailures.push(`${fileName(envPath)}: ${errorMessage(error)}`);
          }
        }

        if (cancelled) {
          return;
        }

        const openEnvPaths = new Set(restoredEnvs.map((entry) => entry.filePath));
        const sessionTabs = (session.openTabs ?? []).map(fromSessionTab);
        const validCollectionKeys = new Set(
          restored.flatMap((entry) =>
            filterValidTabs(entry.filePath, entry.collection.item, sessionTabs).map(tabKey)
          )
        );
        const restoredTabs = sessionTabs.filter((tab) => {
          if (tab.kind === 'environment') {
            return openEnvPaths.has(tab.environmentPath);
          }
          return validCollectionKeys.has(tabKey(tab));
        });
        const restoredActive =
          session.activeTabKey != null ? parseTabKey(session.activeTabKey) : null;
        const active =
          restoredActive && restoredTabs.some((tab) => sameTab(tab, restoredActive))
            ? restoredActive
            : (restoredTabs[0] ?? null);

        const restoredActiveEnv =
          session.activeEnvironmentPath &&
          openEnvPaths.has(session.activeEnvironmentPath)
            ? session.activeEnvironmentPath
            : null;

        setCollections(restored);
        setEnvironments(restoredEnvs);
        setUiByPath(restoredUi);
        setOpenTabs(restoredTabs);
        setActiveTab(active);
        setActiveEnvironmentPath(restoredActiveEnv);

        for (const entry of restored) {
          void refreshCompare(entry.filePath, entry.collection);
        }
        for (const entry of restoredEnvs) {
          void refreshEnvCompare(entry.filePath, entry.environment);
        }

        const allFailures = [...failures, ...envFailures];
        if (allFailures.length > 0) {
          setStatus({
            kind: 'error',
            message: `Could not restore ${allFailures.length} file${
              allFailures.length === 1 ? '' : 's'
            }: ${allFailures.join('; ')}`
          });
        } else if (restored.length > 0 || restoredEnvs.length > 0) {
          const parts: string[] = [];
          if (restored.length > 0) {
            parts.push(
              `${restored.length} collection${restored.length === 1 ? '' : 's'}`
            );
          }
          if (restoredEnvs.length > 0) {
            parts.push(
              `${restoredEnvs.length} environment${restoredEnvs.length === 1 ? '' : 's'}`
            );
          }
          setStatus({ kind: 'ok', message: `Restored ${parts.join(' · ')}` });
        }
      } catch (error) {
        if (!cancelled) {
          setStatus({ kind: 'error', message: errorMessage(error) });
        }
      } finally {
        if (!cancelled) {
          setSessionHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshCompare, refreshEnvCompare]);

  const collectionPathsKey = collections.map((entry) => entry.filePath).join('\u0000');
  const environmentPathsKey = environments.map((entry) => entry.filePath).join('\u0000');

  useEffect(() => {
    const paths = [
      ...collectionPathsKey.split('\u0000'),
      ...environmentPathsKey.split('\u0000')
    ].filter(Boolean);
    void window.clara.watchFiles(paths);
  }, [collectionPathsKey, environmentPathsKey]);

  useEffect(() => {
    return window.clara.onFilesChanged((filePaths) => {
      void syncOpenFilesFromDisk(filePaths);
    });
  }, [syncOpenFilesFromDisk]);

  // fs events can be missed (network mounts, editors writing via temp files).
  useEffect(() => {
    const onFocus = () => {
      void syncOpenFilesFromDisk();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [syncOpenFilesFromDisk]);

  useEffect(() => {
    if (!sessionHydrated) {
      return;
    }

    const handle = window.setTimeout(() => {
      void window.clara.saveSession({
        version: 4,
        collections: collectionsRef.current.map((entry) => {
          const ui = uiByPathRef.current[entry.filePath] ?? EMPTY_UI;
          return {
            path: entry.filePath,
            expandedPaths: [...ui.expanded],
            collectionExpanded: ui.collectionExpanded
          };
        }),
        // Drafts only exist in memory, so they never make it into the session.
        openTabs: openTabs.filter((tab) => !isDraftTab(tab)).map(toSessionTab),
        activeTabKey: activeTab && !isDraftTab(activeTab) ? tabKey(activeTab) : null,
        openedEnvironments: environmentsRef.current.map((entry) => entry.filePath),
        activeEnvironmentPath: activeEnvironmentPathRef.current,
        sidebar: sidebarRef.current,
        compareBases: compareBasesRef.current
      });
    }, 250);

    return () => window.clearTimeout(handle);
  }, [
    sessionHydrated,
    collectionPathsKey,
    environmentPathsKey,
    uiByPath,
    openTabs,
    activeTab,
    activeEnvironmentPath,
    sidebar,
    compareBases
  ]);

  const createNewRequestNear = useCallback(
    (tab: WorkspaceTab) => {
      const collectionPath =
        tab.kind === 'environment'
          ? collectionsRef.current[0]?.filePath
          : tab.collectionPath;
      if (!collectionPath) {
        return;
      }
      const entry = collectionsRef.current.find(
        (candidate) => candidate.filePath === collectionPath
      );
      if (!entry) {
        return;
      }
      let parent: ItemPath | null = null;
      let after: ItemPath | null | undefined;
      if (tab.kind === 'folder') {
        parent = tab.path;
        after = undefined;
      } else if (tab.kind === 'request') {
        parent = parentPathOf(tab.path);
        after = tab.path;
      }
      const result = insertItem(entry.collection, parent, createRequestItem(), after);
      applyCollectionUpdate(entry.filePath, result.collection);
      const parentPath = parent;
      updateUi(entry.filePath, (ui) => ({
        ...ui,
        expanded: parentPath ? new Set(ui.expanded).add(parentPath) : ui.expanded,
        collectionExpanded: true
      }));
      openTab(
        {
          kind: 'request',
          collectionPath: entry.filePath,
          path: result.newPath
        },
        { forceNew: true }
      );
    },
    [applyCollectionUpdate, openTab, updateUi]
  );

  useEffect(() => {
    return window.clara.onCommand((command: AppCommand) => {
      switch (command.type) {
        case 'open':
          void openCollection();
          break;
        case 'new-collection':
          void createNewCollection();
          break;
        case 'open-environment':
          void openEnvironment();
          break;
        case 'save':
          void saveActiveTab();
          break;
        case 'save-all':
          void saveAllDirty();
          break;
        case 'send':
          void sendRequest();
          break;
        case 'close-tab':
          if (activeTabRef.current) {
            closeTab(activeTabRef.current);
          }
          break;
        case 'force-close-tab':
          if (activeTabRef.current) {
            closeTab(activeTabRef.current, { force: true });
          }
          break;
        case 'new-request': {
          if (activeTabRef.current) {
            createNewRequestNear(activeTabRef.current);
            break;
          }
          const first = collectionsRef.current[0];
          if (first) {
            createNewRequestNear({
              kind: 'collection',
              collectionPath: first.filePath
            });
          }
          break;
        }
        case 'next-tab':
          cycleTab(1);
          break;
        case 'prev-tab':
          cycleTab(-1);
          break;
        case 'select-tab':
          selectTabAt(command.index);
          break;
      }
    });
  }, [
    openCollection,
    createNewCollection,
    openEnvironment,
    saveActiveTab,
    saveAllDirty,
    sendRequest,
    closeTab,
    createNewRequestNear,
    cycleTab,
    selectTabAt
  ]);

  const editSelectedItem = (updater: (item: PostmanItem) => PostmanItem) => {
    if (!activeCollection || !activeRequestPath || !activeTab || activeTab.kind !== 'request') {
      return;
    }

    const key = tabKey(activeTab);
    const pin = pinnedByKeyRef.current[key];

    try {
      if (pin) {
        setPinnedByKey((current) => updatePinnedItem(current, key, updater));
        // Linked pins write through so ⌘S has no special case.
        if (!isPinnedDetached(pin, activeCollection.collection.item)) {
          const collection = updateCollectionItem(
            activeCollection.collection,
            activeRequestPath,
            updater
          );
          applyCollectionUpdate(activeCollection.filePath, collection);
        }
        return;
      }

      const collection = updateCollectionItem(
        activeCollection.collection,
        activeRequestPath,
        updater
      );
      applyCollectionUpdate(activeCollection.filePath, collection);
    } catch (error) {
      setStatus({ kind: 'error', message: errorMessage(error) });
    }
  };

  const pinActiveRequest = useCallback(() => {
    const tab = activeTabRef.current;
    if (!tab || tab.kind !== 'request') {
      return;
    }
    const entry = collectionsRef.current.find(
      (candidate) => candidate.filePath === tab.collectionPath
    );
    if (!entry) {
      return;
    }
    const key = tabKey(tab);
    if (pinnedByKeyRef.current[key]) {
      return;
    }
    const existing = getItemByPath(entry.collection.item, tab.path);
    const item = existing && isRequest(existing) ? existing : null;
    if (!item) {
      return;
    }
    setPinnedByKey((current) => ({
      ...current,
      [key]: createPinnedRequest(tab.collectionPath, tab.path, item)
    }));
    setStatus({ kind: 'ok', message: `Pinned “${item.name?.trim() || 'Untitled'}”` });
  }, []);

  const unpinRequestTab = useCallback((tab: WorkspaceTab) => {
    if (tab.kind !== 'request') {
      return;
    }
    const key = tabKey(tab);
    setPinnedByKey((current) => {
      if (!current[key]) {
        return current;
      }
      const { [key]: _removed, ...rest } = current;
      return rest;
    });
  }, []);

  const saveRequestAs = useCallback(
    async (tab: WorkspaceTab) => {
      if (tab.kind !== 'request') {
        return;
      }
      const entry = collectionsRef.current.find(
        (candidate) => candidate.filePath === tab.collectionPath
      );
      if (!entry) {
        return;
      }
      const key = tabKey(tab);
      const pin = pinnedByKeyRef.current[key];
      const source =
        pin?.item ?? getItemByPath(entry.collection.item, tab.path) ?? null;
      if (!source || !isRequest(source)) {
        setStatus({ kind: 'error', message: 'No request to save' });
        return;
      }

      const detached = Boolean(pin && isPinnedDetached(pin, entry.collection.item));
      const locations = listSaveAsLocations(
        entry.collection.item,
        entry.collection.info?.name?.trim() || 'Collection root'
      );
      const defaultParent =
        parentPathOf(pin?.linkedPath ?? tab.path) ??
        (tab.path.includes('.') ? parentPathOf(tab.path) : null);

      const draft = isDraftTab(tab);
      const result = await askSaveAs({
        title: draft ? 'Save request' : detached ? 'Save pinned request' : 'Save As',
        defaultName: source.name?.trim() || 'Untitled request',
        locations,
        defaultParentPath: defaultParent,
        confirmLabel: detached ? 'Save' : 'Save As'
      });
      if (!result) {
        return;
      }

      const toInsert: PostmanItem = {
        ...JSON.parse(JSON.stringify(source)),
        name: result.name
      };
      delete toInsert.item;

      try {
        const inserted = insertItem(entry.collection, result.parentPath, toInsert);
        applyCollectionUpdate(entry.filePath, inserted.collection);
        if (result.parentPath) {
          updateUi(entry.filePath, (ui) => ({
            ...ui,
            expanded: new Set(ui.expanded).add(result.parentPath!),
            collectionExpanded: true
          }));
        } else {
          updateUi(entry.filePath, (ui) =>
            ui.collectionExpanded ? ui : { ...ui, collectionExpanded: true }
          );
        }

        const nextTab: WorkspaceTab = {
          kind: 'request',
          collectionPath: entry.filePath,
          path: inserted.newPath
        };

        if (detached && pin) {
          setPinnedByKey((current) => {
            const without = { ...current };
            delete without[key];
            return without;
          });
          setOpenTabs((current) =>
            current.map((candidate) => (sameTab(candidate, tab) ? nextTab : candidate))
          );
          setActiveTab(nextTab);
          setStatus({
            kind: 'ok',
            message: `Saved “${result.name}” into the collection`
          });
        } else {
          openTab(nextTab, { forceNew: true });
          setStatus({
            kind: 'ok',
            message: `Saved a copy as “${result.name}”`
          });
        }
      } catch (error) {
        setStatus({ kind: 'error', message: errorMessage(error) });
      }
    },
    [applyCollectionUpdate, askSaveAs, openTab, updateUi]
  );
  saveRequestAsRef.current = saveRequestAs;

  const remapTabsAfterDelete = (collectionPath: string, deleted: ItemPath) => {
    const remap = (tab: WorkspaceTab): WorkspaceTab | null => {
      if (tab.kind === 'environment' || tab.collectionPath !== collectionPath || tab.kind === 'collection') {
        return tab;
      }
      const nextPath = remapPathAfterDelete(tab.path, deleted);
      if (nextPath == null) {
        // A draft has its own identity and no item in the tree, so it outlives
        // the request it was copied from. Deleting is explicit, so any other
        // tab closes: keeping it would leave the pin on a path a shifted
        // sibling now owns.
        return isDraftTab(tab) ? tab : null;
      }
      return { ...tab, path: nextPath };
    };

    const current = openTabsRef.current;
    let nextPins = pinnedByKeyRef.current;
    const nextTabs: WorkspaceTab[] = [];
    for (const tab of current) {
      const remapped = remap(tab);
      if (!remapped) {
        if (tab.kind === 'request') {
          const key = tabKey(tab);
          if (nextPins[key]) {
            const { [key]: _removed, ...rest } = nextPins;
            nextPins = rest;
          }
        }
        continue;
      }
      if (tab.kind === 'request' && remapped.kind === 'request' && tab.path !== remapped.path) {
        nextPins = remapPinnedTabKey(nextPins, tab, remapped);
      }
      nextTabs.push(remapped);
    }
    setPinnedByKey(nextPins);
    setOpenTabs(nextTabs);
    setActiveTab((active) => (active ? remap(active) : active));
  };

  const remapTabsAfterDuplicate = (
    collectionPath: string,
    original: ItemPath,
    created: ItemPath
  ) => {
    const remap = (tab: WorkspaceTab): WorkspaceTab => {
      if (tab.kind === 'environment' || tab.collectionPath !== collectionPath || tab.kind === 'collection') {
        return tab;
      }
      return { ...tab, path: remapPathAfterDuplicate(tab.path, original, created) };
    };

    setOpenTabs((current) => current.map(remap));
    setActiveTab((active) => (active ? remap(active) : active));
  };

  const renameTarget = async (target: TreeTarget | CollectionTarget) => {
    const entry = collections.find(
      (candidate) => candidate.filePath === target.collectionPath
    );
    if (!entry) {
      return;
    }
    if (target.kind === 'collection') {
      const current = entry.collection.info?.name ?? '';
      const next = await askText({
        title: 'Rename collection',
        label: 'Name',
        defaultValue: current,
        confirmLabel: 'Rename'
      });
      if (next == null || next === current) {
        return;
      }
      applyCollectionUpdate(entry.filePath, renameCollection(entry.collection, next));
      return;
    }
    const item = getItemByPath(entry.collection.item, target.path);
    if (!item) {
      return;
    }
    const current = item.name ?? '';
    const next = await askText({
      title: target.kind === 'folder' ? 'Rename folder' : 'Rename request',
      label: 'Name',
      defaultValue: current,
      confirmLabel: 'Rename'
    });
    if (next == null || next === current) {
      return;
    }
    applyCollectionUpdate(
      entry.filePath,
      renameItem(entry.collection, target.path, next.trim())
    );
  };

  /**
   * Deleting writes the removal straight to the file, rebuilt from the last
   * saved tree so unrelated pending edits stay unsaved.
   */
  const deleteTarget = async (target: TreeTarget | CollectionTarget) => {
    if (target.kind === 'collection') {
      closeCollection(target.collectionPath);
      return;
    }
    const entry = collections.find(
      (candidate) => candidate.filePath === target.collectionPath
    );
    if (!entry) {
      return;
    }
    const item = getItemByPath(entry.collection.item, target.path);
    const label = item?.name?.trim() || target.kind;
    if (!window.confirm(`Delete "${label}"? This removes it from the file.`)) {
      return;
    }

    const nextCollection = deleteItem(entry.collection, target.path);
    let savedAfterDelete: PostmanCollection | null = null;
    try {
      savedAfterDelete = deleteFromSavedCollection(
        entry.collection,
        assertPostmanCollection(JSON.parse(entry.originalRaw)),
        target.path
      );
    } catch {
      savedAfterDelete = null;
    }

    applyCollectionUpdate(entry.filePath, nextCollection);
    remapTabsAfterDelete(entry.filePath, target.path);

    if (!savedAfterDelete) {
      setStatus({ kind: 'ok', message: `Deleted “${label}” · unsaved` });
      return;
    }

    try {
      const contents = serializeCollection(savedAfterDelete, {
        trailingNewline: trailingNewlineFromRaw(entry.originalRaw)
      });
      await window.clara.saveCollection(entry.filePath, contents);
      setCollections((list) =>
        list.map((candidate) =>
          candidate.filePath === entry.filePath
            ? { ...candidate, originalRaw: contents }
            : candidate
        )
      );
      syncDirty(entry.filePath, nextCollection, contents);
      void refreshCompare(entry.filePath, nextCollection);
      setStatus({
        kind: 'ok',
        message: `Deleted “${label}” from ${fileName(entry.filePath)}`
      });
    } catch (error) {
      setStatus({
        kind: 'error',
        message: `Deleted “${label}”, but the file was not written: ${errorMessage(error)}`
      });
    }
  };

  /**
   * Tab-bar "+" opens a blank unsaved request. It lives as a detached pin, so
   * Save As is what puts it in the collection. `near` only picks the collection
   * and the default Save As parent (sibling of a request, inside a folder, or
   * collection root).
   */
  const createBlankDraftRequest = useCallback((near: WorkspaceTab | null) => {
    const collectionPath =
      near && near.kind !== 'environment'
        ? near.collectionPath
        : collectionsRef.current[0]?.filePath;
    if (!collectionPath) {
      setStatus({ kind: 'error', message: 'Open a collection first' });
      return;
    }
    const entry = collectionsRef.current.find(
      (candidate) => candidate.filePath === collectionPath
    );
    if (!entry) {
      return;
    }

    // linkedPath only hints Save As' default folder; the draft has no tree item.
    let linkedPath: ItemPath = '0';
    if (near?.kind === 'folder' && near.collectionPath === collectionPath) {
      linkedPath = `${near.path}.0`;
    } else if (near?.kind === 'request' && near.collectionPath === collectionPath) {
      linkedPath = near.path;
    }

    const item = createRequestItem();
    const draftTab: WorkspaceTab = {
      kind: 'request',
      collectionPath,
      path: linkedPath,
      draftId: crypto.randomUUID()
    };

    setPinnedByKey((current) => ({
      ...current,
      [tabKey(draftTab)]: {
        ...createPinnedRequest(collectionPath, linkedPath, item),
        draft: true
      }
    }));
    setOpenTabs((current) => [...current, draftTab]);
    setActiveTab(draftTab);
    setStatus({
      kind: 'ok',
      message: 'New request · use Save As to add it to the collection'
    });
  }, []);

  /**
   * Duplicate Tab opens an unsaved working copy beside the tab it came from.
   * It lives as a detached pin, so Save As is what puts it in the collection.
   */
  const duplicateTabAsDraft = (tab: WorkspaceTab) => {
    if (tab.kind !== 'request') {
      return;
    }
    const entry = collectionsRef.current.find(
      (candidate) => candidate.filePath === tab.collectionPath
    );
    if (!entry) {
      return;
    }
    const source =
      pinnedByKeyRef.current[tabKey(tab)]?.item ??
      getItemByPath(entry.collection.item, tab.path) ??
      null;
    if (!source || !isRequest(source)) {
      return;
    }

    const copy: PostmanItem = JSON.parse(JSON.stringify(source)) as PostmanItem;
    delete copy.item;
    copy.name = `${source.name?.trim() || 'Untitled request'} Copy`;

    const draftTab: WorkspaceTab = {
      kind: 'request',
      collectionPath: tab.collectionPath,
      path: tab.path,
      draftId: crypto.randomUUID()
    };

    setPinnedByKey((current) => ({
      ...current,
      [tabKey(draftTab)]: {
        ...createPinnedRequest(tab.collectionPath, tab.path, copy),
        draft: true
      }
    }));
    setOpenTabs((current) => {
      const index = current.findIndex((candidate) => sameTab(candidate, tab));
      const next = current.slice();
      next.splice(index === -1 ? current.length : index + 1, 0, draftTab);
      return next;
    });
    setActiveTab(draftTab);
    setStatus({
      kind: 'ok',
      message: `Copy of “${source.name?.trim() || 'Untitled request'}” · use Save As to add it to the collection`
    });
  };

  const duplicateTarget = (target: TreeTarget) => {
    const entry = collections.find(
      (candidate) => candidate.filePath === target.collectionPath
    );
    if (!entry) {
      return;
    }
    const result = duplicateItem(entry.collection, target.path);
    applyCollectionUpdate(entry.filePath, result.collection);
    remapTabsAfterDuplicate(entry.filePath, target.path, result.newPath);
    openTab({
      kind: target.kind,
      collectionPath: entry.filePath,
      path: result.newPath
    });
  };

  const remapTabsAfterMove = (
    fromCollectionPath: string,
    fromPath: ItemPath,
    toCollectionPath: string,
    newPath: ItemPath
  ) => {
    const remap = (tab: WorkspaceTab): WorkspaceTab | null => {
      if (tab.kind === 'environment') {
        return tab;
      }
      if (tab.collectionPath === fromCollectionPath && tab.kind !== 'collection') {
        if (tab.path === fromPath || tab.path.startsWith(`${fromPath}.`)) {
          if (tab.path === fromPath) {
            return { ...tab, collectionPath: toCollectionPath, path: newPath };
          }
          // Descendant of a moved folder — close (requests-only move for now).
          return null;
        }
        if (fromCollectionPath === toCollectionPath) {
          // Same collection: delete then insert. Remap via delete then insert.
          const afterDelete = remapPathAfterDelete(tab.path, fromPath);
          if (afterDelete == null) {
            return null;
          }
          return { ...tab, path: remapPathAfterInsert(afterDelete, newPath) };
        }
        const afterDelete = remapPathAfterDelete(tab.path, fromPath);
        return afterDelete == null ? null : { ...tab, path: afterDelete };
      }
      if (
        tab.collectionPath === toCollectionPath &&
        fromCollectionPath !== toCollectionPath &&
        tab.kind !== 'collection'
      ) {
        return { ...tab, path: remapPathAfterInsert(tab.path, newPath) };
      }
      return tab;
    };

    setOpenTabs((current) => current.flatMap((tab) => remap(tab) ?? []));
    setActiveTab((active) => (active ? remap(active) : active));
  };

  const moveTreeItem = useCallback(
    (
      fromCollectionPath: string,
      fromPath: ItemPath,
      toCollectionPath: string,
      target: MoveTarget
    ) => {
      const fromEntry = collectionsRef.current.find(
        (candidate) => candidate.filePath === fromCollectionPath
      );
      const toEntry = collectionsRef.current.find(
        (candidate) => candidate.filePath === toCollectionPath
      );
      if (!fromEntry || !toEntry) {
        return;
      }
      const source = getItemByPath(fromEntry.collection.item, fromPath);
      if (!source || !isRequest(source)) {
        return;
      }

      try {
        if (fromCollectionPath === toCollectionPath) {
          const result = moveItem(fromEntry.collection, fromPath, target);
          if (result.newPath === fromPath && result.collection === fromEntry.collection) {
            return;
          }
          applyCollectionUpdate(fromCollectionPath, result.collection);
          remapTabsAfterMove(
            fromCollectionPath,
            fromPath,
            toCollectionPath,
            result.newPath
          );
          if (target.relation === 'into' && target.path) {
            updateUi(toCollectionPath, (ui) => ({
              ...ui,
              expanded: new Set(ui.expanded).add(target.path!),
              collectionExpanded: true
            }));
          }
          return;
        }

        const moved = JSON.parse(JSON.stringify(source)) as PostmanItem;
        const without = deleteItem(fromEntry.collection, fromPath);
        let inserted: { collection: PostmanCollection; newPath: ItemPath };
        if (target.relation === 'into') {
          inserted = insertItem(toEntry.collection, target.path, moved);
        } else if (target.relation === 'after') {
          inserted = insertItem(
            toEntry.collection,
            parentPathOf(target.path),
            moved,
            target.path
          );
        } else {
          const index = Number(target.path.split('.').at(-1));
          inserted = insertItem(
            toEntry.collection,
            parentPathOf(target.path),
            moved,
            undefined,
            index
          );
        }
        applyCollectionUpdate(fromCollectionPath, without);
        applyCollectionUpdate(toCollectionPath, inserted.collection);
        remapTabsAfterMove(
          fromCollectionPath,
          fromPath,
          toCollectionPath,
          inserted.newPath
        );
        if (target.relation === 'into' && target.path) {
          updateUi(toCollectionPath, (ui) => ({
            ...ui,
            expanded: new Set(ui.expanded).add(target.path!),
            collectionExpanded: true
          }));
        } else {
          updateUi(toCollectionPath, (ui) =>
            ui.collectionExpanded ? ui : { ...ui, collectionExpanded: true }
          );
        }
      } catch (error) {
        setStatus({ kind: 'error', message: errorMessage(error) });
      }
    },
    [applyCollectionUpdate, updateUi]
  );

  const runTarget = (target: TreeTarget | CollectionTarget) => {
    const { collectionPath } = target;
    if (target.kind === 'collection') {
      const tab: WorkspaceTab = { kind: 'collection', collectionPath };
      openTab(tab);
      void runScope(tab);
      return;
    }
    if (target.kind === 'folder') {
      const tab: WorkspaceTab = { kind: 'folder', collectionPath, path: target.path };
      openTab(tab);
      void runScope(tab);
      return;
    }
    const requestTab: WorkspaceTab = { kind: 'request', collectionPath, path: target.path };
    openTab(requestTab);
    void runSingleRequest(requestTab);
  };

  const openContextMenu = (
    event: { clientX: number; clientY: number; preventDefault: () => void },
    target: ContextTarget
  ) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, target });
  };

  const shortcutMod = navigator.userAgent.includes('Mac') ? '⌘' : 'Ctrl';
  const shortcutAlt = navigator.userAgent.includes('Mac') ? '⌥' : 'Alt';

  const contextMenuItems = ((): ContextMenuItem[] => {
    if (!contextMenu) {
      return [];
    }
    const { target } = contextMenu;
    if (target.kind === 'tab') {
      return [
        { id: 'new-request', label: 'New Request', shortcut: `${shortcutMod} T` },
        {
          id: 'duplicate-tab',
          label: 'Duplicate Tab',
          disabled: target.tab.kind === 'collection' || target.tab.kind === 'environment'
        },
        ...(target.tab.kind === 'request'
          ? [
              // A draft is not a pin the user chose, so it only offers Save As.
              ...(isDraftTab(target.tab)
                ? []
                : [
                    {
                      id: pinnedByKey[tabKey(target.tab)] ? 'unpin-request' : 'pin-request',
                      label: pinnedByKey[tabKey(target.tab)] ? 'Unpin' : 'Pin',
                      separatorBefore: true
                    }
                  ]),
              { id: 'save-as', label: 'Save As…', separatorBefore: isDraftTab(target.tab) }
            ]
          : []),
        {
          id: 'close-tab',
          label: 'Close Tab',
          shortcut: `${shortcutMod} W`,
          separatorBefore: true
        },
        {
          id: 'force-close-tab',
          label: 'Force Close Tab',
          shortcut: `${shortcutAlt} ${shortcutMod} W`
        },
        { id: 'close-other-tabs', label: 'Close Other Tabs' },
        { id: 'close-all-tabs', label: 'Close All Tabs' },
        { id: 'force-close-all-tabs', label: 'Force Close All Tabs' },
        {
          id: 'reveal-in-sidebar',
          label: 'Reveal in Sidebar',
          separatorBefore: true
        }
      ];
    }
    if (target.kind === 'environment') {
      const isActive = activeEnvironmentPath === target.environmentPath;
      return [
        {
          id: isActive ? 'clear-active-environment' : 'set-active-environment',
          label: isActive ? 'Clear active' : 'Set active'
        },
        { id: 'rename', label: 'Rename' },
        { id: 'delete', label: 'Close', danger: true, separatorBefore: true }
      ];
    }
    if (target.kind === 'change') {
      const { entry } = target;
      const compare = compareByPath[target.collectionPath];
      const canRestore =
        Boolean(compare) &&
        (entry.type === 'collection-variables' ||
          (entry.type === 'current' &&
            (entry.changeKind === 'modified' || entry.changeKind === 'moved')));
      return [
        { id: 'open-change', label: 'Open' },
        ...(canRestore
          ? [
              {
                id: 'restore-from-base',
                label: `Restore from ${compare!.baseRef}`,
                separatorBefore: true
              }
            ]
          : [])
      ];
    }
    if (target.kind === 'run-result') {
      const busy = Boolean(runningKey) || Boolean(rerunningRow);
      return [
        {
          id: 'rerun-request',
          label: 'Run again',
          disabled: busy
        },
        {
          id: 'reveal-in-sidebar',
          label: 'Reveal in Sidebar',
          separatorBefore: true
        }
      ];
    }
    if (target.kind === 'collection') {
      return [
        { id: 'new-request', label: 'New Request', shortcut: `${shortcutMod} T` },
        { id: 'run', label: 'Run collection' },
        { id: 'rename', label: 'Rename' },
        { id: 'reload-from-disk', label: 'Reload from disk', separatorBefore: true },
        { id: 'expand-all', label: 'Expand all', separatorBefore: true },
        { id: 'collapse-all', label: 'Collapse all' },
        { id: 'delete', label: 'Close', danger: true, separatorBefore: true }
      ];
    }
    const compare =
      'collectionPath' in target
        ? compareByPath[target.collectionPath]
        : null;
    const status =
      compare && 'path' in target
        ? compare.diff.statusByPath.get(target.path)
        : undefined;
    const canRestore =
      Boolean(compare) &&
      (status === 'modified' || status === 'unchanged') &&
      (target.kind === 'request' || target.kind === 'folder');
    return [
      ...(target.kind === 'folder'
        ? [{ id: 'new-request', label: 'New Request', shortcut: `${shortcutMod} T` }]
        : []),
      ...(target.kind === 'request'
        ? [
            {
              id: pinnedByKey[tabKey({ kind: 'request', collectionPath: target.collectionPath, path: target.path })]
                ? 'unpin-request'
                : 'pin-request',
              label: pinnedByKey[
                tabKey({
                  kind: 'request',
                  collectionPath: target.collectionPath,
                  path: target.path
                })
              ]
                ? 'Unpin'
                : 'Pin'
            },
            { id: 'save-as', label: 'Save As…' }
          ]
        : []),
      { id: 'run', label: target.kind === 'folder' ? 'Run folder' : 'Run' },
      { id: 'rename', label: 'Rename' },
      { id: 'duplicate', label: 'Duplicate' },
      ...(canRestore
        ? [
            {
              id: 'restore-from-base',
              label: `Restore from ${compare!.baseRef}`,
              separatorBefore: true
            }
          ]
        : []),
      { id: 'delete', label: 'Delete', danger: true, separatorBefore: true }
    ];
  })();

  const scrollSidebarTargetIntoView = useCallback((tab: WorkspaceTab) => {
    const key = tabKey(tab);
    window.requestAnimationFrame(() => {
      const element = document.querySelector(
        `[data-sidebar-key="${CSS.escape(key)}"]`
      );
      if (element instanceof HTMLElement) {
        element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }, []);

  const revealInSidebar = useCallback(
    (tab: WorkspaceTab, options?: { activate?: boolean }) => {
      const activate = options?.activate !== false;

      if (tab.kind === 'environment') {
        setSidebar((current) =>
          current.environmentsExpanded
            ? current
            : { ...current, environmentsExpanded: true }
        );
        if (activate) {
          setActiveTab(tab);
        }
        scrollSidebarTargetIntoView(tab);
        return;
      }

      if (tab.kind === 'collection') {
        updateUi(tab.collectionPath, (ui) =>
          ui.collectionExpanded ? ui : { ...ui, collectionExpanded: true }
        );
        setSidebar((current) =>
          current.collectionsExpanded
            ? current
            : { ...current, collectionsExpanded: true }
        );
        if (activate) {
          setActiveTab(tab);
        }
        scrollSidebarTargetIntoView(tab);
        return;
      }

      const indexes = tab.path.split('.');
      updateUi(tab.collectionPath, (ui) => {
        const expanded = new Set(ui.expanded);
        let changed = !ui.collectionExpanded;
        for (let depth = 1; depth < indexes.length; depth += 1) {
          const ancestor = indexes.slice(0, depth).join('.');
          if (!expanded.has(ancestor)) {
            expanded.add(ancestor);
            changed = true;
          }
        }
        if (tab.kind === 'folder' && !expanded.has(tab.path)) {
          expanded.add(tab.path);
          changed = true;
        }
        if (!changed) {
          return ui;
        }
        return { ...ui, expanded, collectionExpanded: true };
      });
      setSidebar((current) =>
        current.collectionsExpanded
          ? current
          : { ...current, collectionsExpanded: true }
      );
      if (activate) {
        setActiveTab(tab);
      }
      window.setTimeout(() => scrollSidebarTargetIntoView(tab), 0);
    },
    [scrollSidebarTargetIntoView, updateUi]
  );

  const revealRunExecution = useCallback(
    (
      collectionPath: string,
      scopePath: ItemPath | null,
      executions: NewmanRunView['executions'],
      index: number
    ) => {
      const entry = collectionsRef.current.find(
        (candidate) => candidate.filePath === collectionPath
      );
      if (!entry) {
        return;
      }
      const path = resolveRunExecutionPath(
        entry.collection.item,
        scopePath,
        executions,
        index
      );
      if (!path) {
        return;
      }
      setRunSidebarFocus({ collectionPath, path });
      revealInSidebar(
        { kind: 'request', collectionPath, path },
        { activate: false }
      );
    },
    [revealInSidebar]
  );

  const focusChangeEntry = useCallback(
    (collectionPath: string, entry: ChangeListEntry) => {
      setFocusedChangeKey(entry.key);
      setSidebar((current) => {
        const next = {
          ...current,
          collectionsExpanded: true,
          changesExpanded: true
        };
        return current.collectionsExpanded && current.changesExpanded ? current : next;
      });
      updateUi(collectionPath, (ui) =>
        ui.collectionExpanded ? ui : { ...ui, collectionExpanded: true }
      );

      if (entry.type === 'collection-variables') {
        setRemovedDiffView(null);
        openTab({ kind: 'collection', collectionPath });
        revealInSidebar(
          { kind: 'collection', collectionPath },
          { activate: false }
        );
        return;
      }

      if (entry.type === 'current') {
        setRemovedDiffView(null);
        if (entry.nodeKind === 'request') {
          openRequestTab(collectionPath, entry.path, { viewMode: 'diff' });
          revealInSidebar(
            { kind: 'request', collectionPath, path: entry.path },
            { activate: false }
          );
        } else {
          openFolderTab(collectionPath, entry.path);
          revealInSidebar(
            { kind: 'folder', collectionPath, path: entry.path },
            { activate: false }
          );
        }
        return;
      }

      const parentPath = entry.parentPath;
      if (parentPath) {
        openFolderTab(collectionPath, parentPath);
        updateUi(collectionPath, (ui) => {
          const expanded = new Set(ui.expanded);
          const parts = parentPath.split('.');
          let changed = false;
          for (let depth = 1; depth <= parts.length; depth += 1) {
            const ancestor = parts.slice(0, depth).join('.');
            if (!expanded.has(ancestor)) {
              expanded.add(ancestor);
              changed = true;
            }
          }
          return changed ? { ...ui, expanded } : ui;
        });
      } else {
        updateUi(collectionPath, (ui) =>
          ui.collectionExpanded ? ui : { ...ui, collectionExpanded: true }
        );
      }

      if (entry.nodeKind === 'request') {
        const collectionEntry = collectionsRef.current.find(
          (candidate) => candidate.filePath === collectionPath
        );
        const compare = compareByPathRef.current[collectionPath];
        if (collectionEntry && compare) {
          const baseItem = findRemovedBaseItem(
            collectionEntry.collection,
            compare.baseCollection,
            entry.ghost
          );
          if (baseItem && isRequest(baseItem)) {
            setRemovedDiffView({
              collectionPath,
              ghostKey: entry.key,
              item: baseItem,
              name: entry.name
            });
          } else {
            setRemovedDiffView(null);
          }
        } else {
          setRemovedDiffView(null);
        }
      } else {
        setRemovedDiffView(null);
      }

      window.requestAnimationFrame(() => {
        const element = document.querySelector(
          `[data-sidebar-key="${CSS.escape(entry.key)}"]`
        );
        if (element instanceof HTMLElement) {
          element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      });
    },
    [openFolderTab, openRequestTab, openTab, revealInSidebar, updateUi]
  );

  const cycleChange = useCallback(
    (delta: number) => {
      if (!activeCollection || changeList.length === 0) {
        return;
      }
      const currentIndex = focusedChangeKey
        ? changeList.findIndex((entry) => entry.key === focusedChangeKey)
        : -1;
      const nextIndex =
        currentIndex === -1
          ? delta > 0
            ? 0
            : changeList.length - 1
          : (currentIndex + delta + changeList.length) % changeList.length;
      focusChangeEntry(activeCollection.filePath, changeList[nextIndex]);
    },
    [activeCollection, changeList, focusChangeEntry, focusedChangeKey]
  );

  useEffect(() => {
    return window.clara.onCommand((command: AppCommand) => {
      if (command.type === 'next-change') {
        cycleChange(1);
      } else if (command.type === 'prev-change') {
        cycleChange(-1);
      }
    });
  }, [cycleChange]);

  const selectRemovedGhost = useCallback(
    (collectionPath: string, ghost: RemovedGhost) => {
      const entry = changeList.find(
        (candidate) => candidate.type === 'removed' && candidate.key === ghost.key
      );
      if (entry) {
        focusChangeEntry(collectionPath, entry);
      }
    },
    [changeList, focusChangeEntry]
  );

  useEffect(() => {
    if (!sessionHydrated || !sidebar.followActiveTab || !activeTab) {
      return;
    }
    revealInSidebar(activeTab, { activate: false });
  }, [sessionHydrated, sidebar.followActiveTab, activeTab, revealInSidebar]);

  const applyEnvironmentUpdate = (
    environmentPath: string,
    environment: PostmanEnvironment
  ) => {
    setEnvironments((list) =>
      list.map((entry) =>
        entry.filePath === environmentPath ? { ...entry, environment } : entry
      )
    );
    void refreshEnvCompare(environmentPath, environment);
  };

  /** Writes the environment to disk so the edit lands clean instead of pending a Save. */
  const persistEnvironment = async (
    environmentPath: string,
    environment: PostmanEnvironment
  ) => {
    const entry = environmentsRef.current.find(
      (candidate) => candidate.filePath === environmentPath
    );
    const contents = serializeEnvironment(environment, {
      trailingNewline: entry ? trailingNewlineFromRaw(entry.originalRaw) : true
    });
    await window.clara.saveEnvironment(environmentPath, contents);
    setEnvironments((list) =>
      list.map((entry) =>
        entry.filePath === environmentPath
          ? { ...entry, environment, originalRaw: contents }
          : entry
      )
    );
    await refreshEnvCompare(environmentPath, environment);
  };

  const restoreRequestFromBase = useCallback(
    async (collectionPath: string, path: ItemPath) => {
      const entry = collectionsRef.current.find(
        (candidate) => candidate.filePath === collectionPath
      );
      const compare = compareByPathRef.current[collectionPath];
      if (!entry || !compare) {
        return;
      }
      const label = getItemByPath(entry.collection.item, path)?.name?.trim() || path;
      if (
        !window.confirm(
          `Restore “${label}” from ${compare.baseRef}? This writes the file (git is not modified).`
        )
      ) {
        return;
      }
      try {
        await persistCollection(
          collectionPath,
          restoreItemFromBase(entry.collection, path, compare.baseCollection)
        );
        setStatus({ kind: 'ok', message: `Restored from ${compare.baseRef} · saved` });
      } catch (error) {
        setStatus({ kind: 'error', message: errorMessage(error) });
      }
    },
    [persistCollection]
  );

  const restoreRequestSection = useCallback(
    async (collectionPath: string, path: ItemPath, section: RequestSectionKey) => {
      const entry = collectionsRef.current.find(
        (candidate) => candidate.filePath === collectionPath
      );
      const compare = compareByPathRef.current[collectionPath];
      if (!entry || !compare) {
        return;
      }
      const current = getItemByPath(entry.collection.item, path);
      const base = findPairedBaseItem(
        entry.collection.item,
        compare.baseCollection.item,
        path
      );
      if (!current || !base) {
        return;
      }
      if (
        !window.confirm(`Restore ${section} from ${compare.baseRef}? This writes the file.`)
      ) {
        return;
      }
      try {
        await persistCollection(collectionPath, {
          ...entry.collection,
          item: updateItemByPath(entry.collection.item, path, () =>
            restoreRequestSectionFromBase(current, base, section)
          )
        });
        setStatus({
          kind: 'ok',
          message: `Restored ${section} from ${compare.baseRef} · saved`
        });
      } catch (error) {
        setStatus({ kind: 'error', message: errorMessage(error) });
      }
    },
    [persistCollection]
  );

  const restoreFolderFromBase = useCallback(
    async (collectionPath: string, path: ItemPath) => {
      const entry = collectionsRef.current.find(
        (candidate) => candidate.filePath === collectionPath
      );
      const compare = compareByPathRef.current[collectionPath];
      if (!entry || !compare) {
        return;
      }
      const label = getItemByPath(entry.collection.item, path)?.name?.trim() || path;
      if (
        !window.confirm(
          `Restore folder “${label}” (including nested items) from ${compare.baseRef}? This writes the file.`
        )
      ) {
        return;
      }
      try {
        await persistCollection(
          collectionPath,
          restoreFolderSubtreeFromBase(entry.collection, path, compare.baseCollection)
        );
        setStatus({ kind: 'ok', message: `Restored folder from ${compare.baseRef} · saved` });
      } catch (error) {
        setStatus({ kind: 'error', message: errorMessage(error) });
      }
    },
    [persistCollection]
  );

  const restoreCollectionVariables = useCallback(
    async (collectionPath: string) => {
      const entry = collectionsRef.current.find(
        (candidate) => candidate.filePath === collectionPath
      );
      const compare = compareByPathRef.current[collectionPath];
      if (!entry || !compare) {
        return;
      }
      if (
        !window.confirm(
          `Restore collection variables from ${compare.baseRef}? This writes the file.`
        )
      ) {
        return;
      }
      try {
        await persistCollection(
          collectionPath,
          restoreCollectionVariablesFromBase(entry.collection, compare.baseCollection)
        );
        setStatus({
          kind: 'ok',
          message: `Restored collection variables from ${compare.baseRef} · saved`
        });
      } catch (error) {
        setStatus({ kind: 'error', message: errorMessage(error) });
      }
    },
    [persistCollection]
  );

  const renameEnvironmentTarget = async (environmentPath: string) => {
    const entry = environments.find((candidate) => candidate.filePath === environmentPath);
    if (!entry) {
      return;
    }
    const current = entry.environment.name ?? '';
    const next = await askText({
      title: 'Rename environment',
      label: 'Name',
      defaultValue: current,
      confirmLabel: 'Rename'
    });
    if (next == null || next === current) {
      return;
    }
    applyEnvironmentUpdate(environmentPath, renameEnvironment(entry.environment, next));
  };

  const handleContextAction = (id: string) => {
    if (!contextMenu) {
      return;
    }
    const { target } = contextMenu;
    if (target.kind === 'tab') {
      if (id === 'new-request') {
        createNewRequestNear(target.tab);
      } else if (id === 'duplicate-tab' && target.tab.kind === 'request') {
        duplicateTabAsDraft(target.tab);
      } else if (id === 'duplicate-tab' && target.tab.kind === 'folder') {
        duplicateTarget(target.tab);
      } else if (id === 'close-tab') {
        closeTab(target.tab);
      } else if (id === 'force-close-tab') {
        closeTab(target.tab, { force: true });
      } else if (id === 'close-other-tabs') {
        closeOtherTabs(target.tab);
      } else if (id === 'close-all-tabs') {
        closeAllTabs();
      } else if (id === 'force-close-all-tabs') {
        closeAllTabs({ force: true });
      } else if (id === 'reveal-in-sidebar') {
        revealInSidebar(target.tab);
      } else if (id === 'pin-request' && target.tab.kind === 'request') {
        const requestTab = target.tab;
        const entry = collectionsRef.current.find(
          (candidate) => candidate.filePath === requestTab.collectionPath
        );
        const item = entry
          ? getItemByPath(entry.collection.item, requestTab.path)
          : null;
        if (entry && item && isRequest(item)) {
          setPinnedByKey((current) => ({
            ...current,
            [tabKey(requestTab)]: createPinnedRequest(
              requestTab.collectionPath,
              requestTab.path,
              item
            )
          }));
          setStatus({
            kind: 'ok',
            message: `Pinned “${item.name?.trim() || 'Untitled'}”`
          });
        }
      } else if (id === 'unpin-request' && target.tab.kind === 'request') {
        unpinRequestTab(target.tab);
      } else if (id === 'save-as' && target.tab.kind === 'request') {
        void saveRequestAs(target.tab);
      }
      return;
    }
    if (target.kind === 'environment') {
      if (id === 'set-active-environment') {
        setActiveEnvironmentPath(target.environmentPath);
      } else if (id === 'clear-active-environment') {
        setActiveEnvironmentPath(null);
      } else if (id === 'rename') {
        void renameEnvironmentTarget(target.environmentPath);
      } else if (id === 'delete') {
        closeEnvironment(target.environmentPath);
      }
      return;
    }
    if (target.kind === 'change') {
      if (id === 'open-change') {
        focusChangeEntry(target.collectionPath, target.entry);
      } else if (id === 'restore-from-base') {
        if (target.entry.type === 'collection-variables') {
          void restoreCollectionVariables(target.collectionPath);
        } else if (target.entry.type === 'current') {
          if (target.entry.nodeKind === 'folder') {
            void restoreFolderFromBase(target.collectionPath, target.entry.path);
          } else {
            void restoreRequestFromBase(target.collectionPath, target.entry.path);
          }
        }
      }
      return;
    }
    if (target.kind === 'run-result') {
      const result = scopeRuns[tabKey(target.tab)];
      if (id === 'rerun-request') {
        if (!result) {
          return;
        }
        void rerunScopeExecution(target.tab, result.executions, target.index);
      } else if (id === 'reveal-in-sidebar') {
        if (!result) {
          return;
        }
        revealRunExecution(
          target.tab.collectionPath,
          target.tab.kind === 'folder' ? target.tab.path : null,
          result.executions,
          target.index
        );
      }
      return;
    }
    if (id === 'run') {
      runTarget(target);
    } else if (id === 'pin-request' && target.kind === 'request') {
      const entry = collectionsRef.current.find(
        (candidate) => candidate.filePath === target.collectionPath
      );
      const item = entry ? getItemByPath(entry.collection.item, target.path) : null;
      if (entry && item && isRequest(item)) {
        const tab = {
          kind: 'request' as const,
          collectionPath: target.collectionPath,
          path: target.path
        };
        openRequestTab(target.collectionPath, target.path);
        setPinnedByKey((current) => ({
          ...current,
          [tabKey(tab)]: createPinnedRequest(target.collectionPath, target.path, item)
        }));
        setStatus({
          kind: 'ok',
          message: `Pinned “${item.name?.trim() || 'Untitled'}”`
        });
      }
    } else if (id === 'unpin-request' && target.kind === 'request') {
      unpinRequestTab({
        kind: 'request',
        collectionPath: target.collectionPath,
        path: target.path
      });
    } else if (id === 'save-as' && target.kind === 'request') {
      void saveRequestAs({
        kind: 'request',
        collectionPath: target.collectionPath,
        path: target.path
      });
    } else if (id === 'new-request') {
      if (target.kind === 'collection') {
        createNewRequestNear({
          kind: 'collection',
          collectionPath: target.collectionPath
        });
      } else if (target.kind === 'folder') {
        createNewRequestNear({
          kind: 'folder',
          collectionPath: target.collectionPath,
          path: target.path
        });
      }
    } else if (id === 'rename') {
      void renameTarget(target);
    } else if (id === 'delete') {
      void deleteTarget(target);
    } else if (id === 'duplicate' && target.kind !== 'collection') {
      duplicateTarget(target);
    } else if (
      id === 'restore-from-base' &&
      (target.kind === 'request' || target.kind === 'folder')
    ) {
      if (target.kind === 'folder') {
        restoreFolderFromBase(target.collectionPath, target.path);
      } else {
        restoreRequestFromBase(target.collectionPath, target.path);
      }
    } else if (id === 'expand-all' && target.kind === 'collection') {
      const entry = collections.find(
        (candidate) => candidate.filePath === target.collectionPath
      );
      if (entry) {
        updateUi(entry.filePath, (ui) => ({
          ...ui,
          collectionExpanded: true,
          expanded: collectFolderPaths(entry.collection.item)
        }));
      }
    } else if (id === 'collapse-all' && target.kind === 'collection') {
      updateUi(target.collectionPath, (ui) => ({ ...ui, expanded: new Set() }));
    } else if (id === 'reload-from-disk' && target.kind === 'collection') {
      void syncCollectionFromDisk(target.collectionPath, { force: true });
    }
  };

  const editCollectionVariables = (
    updater: (variables: PostmanVariable[]) => PostmanVariable[]
  ) => {
    if (!activeCollection) {
      return;
    }
    applyCollectionUpdate(
      activeCollection.filePath,
      setCollectionVariables(
        activeCollection.collection,
        updater(getCollectionVariables(activeCollection.collection))
      )
    );
  };

  const editFolderVariables = (
    path: ItemPath,
    updater: (variables: PostmanVariable[]) => PostmanVariable[]
  ) => {
    if (!activeCollection) {
      return;
    }
    applyCollectionUpdate(activeCollection.filePath, {
      ...activeCollection.collection,
      item: updateItemByPath(activeCollection.collection.item, path, (item) =>
        setItemVariables(item, updater(getItemVariables(item)))
      )
    });
  };

  const nudgeChangedOnlyMode = useCallback(() => {
    setChangedOnlyNudge((current) => current + 1);
    showClaraTooltip({
      selector: '[data-changed-only-toggle]',
      text: 'Changed only is on — only changed items are shown. Click the source-control button to show all.',
      delayMs: 0
    });
  }, []);

  useEffect(() => {
    if (changedOnlyNudge === 0) {
      return;
    }
    const timer = window.setTimeout(() => setChangedOnlyNudge(0), 1200);
    return () => window.clearTimeout(timer);
  }, [changedOnlyNudge]);

  const toggleFolder = (collectionPath: string, path: ItemPath) => {
    const ui = uiByPathRef.current[collectionPath] ?? EMPTY_UI;
    const expanding = !ui.expanded.has(path);
    updateUi(collectionPath, (current) => {
      const expanded = new Set(current.expanded);
      if (expanded.has(path)) {
        expanded.delete(path);
      } else {
        expanded.add(path);
      }
      return { ...current, expanded };
    });
    if (
      expanding &&
      sidebarRef.current.changedOnly &&
      Boolean(compareByPathRef.current[collectionPath])
    ) {
      nudgeChangedOnlyMode();
    }
  };

  const titlebarName =
    activeEnvironment?.environment.name?.trim() ||
    activeCollection?.collection.info?.name ||
    (collections.length === 0 && environments.length === 0
      ? 'Postman collection editor'
      : collections.length === 1 && environments.length === 0
        ? (collections[0]?.collection.info?.name ?? 'Untitled collection')
        : environments.length === 1 && collections.length === 0
          ? (environments[0]?.environment.name ?? 'Untitled environment')
          : [
              collections.length > 0
                ? `${collections.length} collection${collections.length === 1 ? '' : 's'}`
                : null,
              environments.length > 0
                ? `${environments.length} environment${environments.length === 1 ? '' : 's'}`
                : null
            ]
              .filter(Boolean)
              .join(' · '));

  const statusbarCollection = activeCollection ?? collections[0] ?? null;
  const statusbarEnvironment =
    activeEnvironment ??
    selectedActiveEnvironment ??
    environments[0] ??
    null;

  const onSidebarResizePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    sidebarResizeRef.current = {
      startX: event.clientX,
      startWidth: sidebar.width
    };
  };

  const onSidebarResizePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = sidebarResizeRef.current;
    if (!drag) {
      return;
    }
    const next = clampSidebarWidth(drag.startWidth + (event.clientX - drag.startX));
    setSidebar((current) =>
      current.width === next ? current : { ...current, width: next }
    );
  };

  const onSidebarResizePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (sidebarResizeRef.current) {
      sidebarResizeRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // ignore if already released
      }
    }
  };

  const onSidebarResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const delta = event.key === 'ArrowRight' ? 10 : -10;
      setSidebar((current) => ({
        ...current,
        width: clampSidebarWidth(current.width + delta)
      }));
    }
  };

  const maxEnvironmentPanelHeight = () => {
    const sidebarElement = environmentPanelRef.current?.parentElement;
    return sidebarElement
      ? Math.max(
          CHANGES_MIN_HEIGHT,
          Math.floor(sidebarElement.clientHeight * 0.45)
        )
      : undefined;
  };

  const collapseEnvironmentPanel = () => {
    setSidebar((current) =>
      current.environmentsExpanded
        ? { ...current, environmentsExpanded: false }
        : current
    );
  };

  const maxTerminalHeight = () =>
    Math.max(140, Math.floor(window.innerHeight * 0.55));

  const onTerminalResizePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    terminalResizeRef.current = {
      startY: event.clientY,
      startHeight: terminalHeight
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onTerminalResizePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = terminalResizeRef.current;
    if (!drag) {
      return;
    }
    const delta = drag.startY - event.clientY;
    const next = Math.min(
      maxTerminalHeight(),
      Math.max(140, drag.startHeight + delta)
    );
    setTerminalHeight(next);
  };

  const onTerminalResizePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (terminalResizeRef.current) {
      terminalResizeRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // already released
      }
    }
  };

  const onEnvironmentResizePointerDown = (
    event: PointerEvent<HTMLDivElement>
  ) => {
    event.preventDefault();
    if (!sidebar.environmentsExpanded) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    environmentResizeRef.current = {
      startY: event.clientY,
      startHeight: environmentPanelHeight
    };
  };

  const onEnvironmentResizePointerMove = (
    event: PointerEvent<HTMLDivElement>
  ) => {
    const drag = environmentResizeRef.current;
    if (!drag) {
      return;
    }
    const next = drag.startHeight + (drag.startY - event.clientY);
    if (next <= CHANGES_COLLAPSE_HEIGHT) {
      environmentResizeRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // already released
      }
      collapseEnvironmentPanel();
      return;
    }
    setEnvironmentPanelHeight(
      clampChangesHeight(next, maxEnvironmentPanelHeight())
    );
  };

  const onEnvironmentResizePointerUp = (
    event: PointerEvent<HTMLDivElement>
  ) => {
    if (!environmentResizeRef.current) {
      return;
    }
    environmentResizeRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // already released
    }
  };

  const toggleEnvironmentPanel = () => {
    if (sidebar.environmentsExpanded) {
      collapseEnvironmentPanel();
      return;
    }
    setEnvironmentPanelHeight(
      clampChangesHeight(CHANGES_DEFAULT_HEIGHT, maxEnvironmentPanelHeight())
    );
    setSidebar((current) => ({ ...current, environmentsExpanded: true }));
  };

  return (
    <div className={`app ${navigator.userAgent.includes('Mac') ? 'platform-mac' : ''}`}>
      <header className="titlebar">
        <div className="brand-mark" aria-hidden>
          C
        </div>
        <strong>Clara</strong>
        <span className="titlebar-separator" />
        <span className="titlebar-collection">
          {titlebarName}
          {anyDirty ? <span className="dirty-dot" title="Unsaved changes" /> : null}
        </span>
        <div className="titlebar-actions">
          <button type="button" onClick={() => void createNewCollection()} title="⌘N / Ctrl+N">
            New
          </button>
          <button type="button" onClick={() => void openCollection()} title="⌘O / Ctrl+O">
            Open
          </button>
          <button
            type="button"
            className={anyDirty ? 'save-dirty' : ''}
            disabled={!hasResources}
            onClick={() => void saveActiveTab()}
            title="Save active tab · ⌘S / Ctrl+S"
          >
            Save
          </button>
          <button
            type="button"
            className={anyDirty ? 'save-dirty' : ''}
            disabled={!hasResources || !anyDirty}
            onClick={() => void saveAllDirty()}
            title="Save all dirty files · ⇧⌘S / Ctrl+Shift+S"
          >
            Save All
          </button>
          <button
            type="button"
            disabled={activeTab?.kind !== 'request'}
            onClick={() => {
              if (activeTab?.kind === 'request') {
                void saveRequestAs(activeTab);
              }
            }}
            title="Save a copy with a new name or location"
          >
            Save As
          </button>
        </div>
      </header>

      {!hasResources && (
        <main className="welcome">
          <div className="welcome-mark" aria-hidden>
            C
          </div>
          <h1>Open a Postman collection</h1>
          <p>Edit the JSON in your repository directly. No import or export cycle.</p>
          <div className="welcome-actions">
            <button type="button" className="primary" onClick={() => void createNewCollection()}>
              New collection
            </button>
            <button type="button" onClick={() => void openCollection()}>
              Open collection
            </button>
            <button type="button" onClick={() => void openEnvironment()}>
              Open environment
            </button>
          </div>
          {sessionHome ? (
            <p className="welcome-session">Session data: {sessionHome}</p>
          ) : null}
        </main>
      )}

      {hasResources && (
        <div className="workspace">
          <aside
            className="sidebar"
            style={{ width: sidebar.width, flexBasis: sidebar.width }}
          >
            <div className="sidebar-search">
              <input
                type="search"
                value={sidebarQuery}
                onChange={(event) => setSidebarQuery(event.target.value)}
                placeholder="Search…"
                aria-label="Search collections and environments"
                spellCheck={false}
              />
              {sidebarQuery ? (
                <button
                  type="button"
                  className="sidebar-search-clear"
                  aria-label="Clear search"
                  onClick={() => setSidebarQuery('')}
                >
                  ✕
                </button>
              ) : null}
            </div>

            <div className="sidebar-section sidebar-section-collections">
              <div className="sidebar-section-title">
                <button
                  type="button"
                  className="sidebar-section-toggle"
                  aria-expanded={collectionsSectionOpen}
                  aria-label={
                    collectionsSectionOpen
                      ? 'Collapse collections'
                      : 'Expand collections'
                  }
                  onClick={() =>
                    setSidebar((current) => ({
                      ...current,
                      collectionsExpanded: !current.collectionsExpanded
                    }))
                  }
                >
                  <span className="sidebar-chevron" aria-hidden>
                    {collectionsSectionOpen ? '▾' : '▸'}
                  </span>
                  <strong>Collections</strong>
                  <span className="sidebar-count">{totalRequests}</span>
                </button>
                <button
                  type="button"
                  className={`sidebar-follow ${sidebar.followActiveTab ? 'is-active' : ''}`}
                  aria-label={
                    sidebar.followActiveTab
                      ? 'Stop following active tab in sidebar'
                      : 'Follow active tab in sidebar'
                  }
                  aria-pressed={sidebar.followActiveTab}
                  title={
                    sidebar.followActiveTab
                      ? 'Following active tab'
                      : 'Follow active tab'
                  }
                  onClick={() => {
                    setSidebar((current) => {
                      const next = !current.followActiveTab;
                      if (next && activeTabRef.current) {
                        window.setTimeout(() => {
                          revealInSidebar(activeTabRef.current!, { activate: false });
                        }, 0);
                      }
                      return { ...current, followActiveTab: next };
                    });
                  }}
                >
                  <span className="sidebar-follow-icon" aria-hidden>
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                      <circle cx="8" cy="8" r="5.25" stroke="currentColor" strokeWidth="1.25" />
                      <circle cx="8" cy="8" r="1.6" fill="currentColor" />
                      <path
                        d="M8 1.25v2.1M8 12.65v2.1M1.25 8h2.1M12.65 8h2.1"
                        stroke="currentColor"
                        strokeWidth="1.25"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                </button>
                <button
                  type="button"
                  data-changed-only-toggle
                  className={`sidebar-changed-only ${sidebar.changedOnly ? 'is-active' : ''} ${
                    changedOnlyNudge > 0 ? 'is-nudged' : ''
                  }`}
                  aria-label={
                    sidebar.changedOnly
                      ? 'Show all collection items'
                      : 'Show only changed items vs base branch'
                  }
                  aria-pressed={sidebar.changedOnly}
                  title={
                    sidebar.changedOnly
                      ? 'Changed only is on — only changed items are shown. Click to show all.'
                      : 'Changed only — hide unchanged items vs base'
                  }
                  onClick={() =>
                    setSidebar((current) => ({
                      ...current,
                      changedOnly: !current.changedOnly
                    }))
                  }
                >
                  <span className="sidebar-changed-only-icon" aria-hidden>
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                      <circle cx="5" cy="3.25" r="1.55" stroke="currentColor" strokeWidth="1.25" />
                      <circle cx="5" cy="12.75" r="1.55" stroke="currentColor" strokeWidth="1.25" />
                      <circle cx="11.75" cy="8" r="1.55" stroke="currentColor" strokeWidth="1.25" />
                      <path
                        d="M5 4.8v6.4M5 9.1c0-2.2 1.55-3.35 5.2-3.35"
                        stroke="currentColor"
                        strokeWidth="1.25"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </button>
                <button
                  type="button"
                  className="sidebar-add"
                  aria-label="New collection"
                  title="New collection"
                  onClick={() => void createNewCollection()}
                >
                  +
                </button>
                <button
                  type="button"
                  className="sidebar-add"
                  aria-label="Open collection"
                  title="Open collection"
                  onClick={() => void openCollection()}
                >
                  ↗
                </button>
              </div>

              {collectionsSectionOpen
                ? collections.flatMap((entry) => {
                    const collectionName =
                      entry.collection.info?.name?.trim() || 'Untitled collection';
                    const collectionNameMatch = textMatchesQuery(
                      collectionName,
                      sidebarFilter
                    );
                    const treeMatch =
                      !isSearching ||
                      collectionNameMatch ||
                      (entry.collection.item ?? []).some((item) =>
                        itemMatchesQuery(item, sidebarFilter)
                      );
                    if (isSearching && !treeMatch) {
                      return [];
                    }

                    const ui = uiByPath[entry.filePath] ?? EMPTY_UI;
                    const counts = countsByPath[entry.filePath] ?? {
                      folders: 0,
                      requests: 0
                    };
                    const target: CollectionTarget = {
                      kind: 'collection',
                      collectionPath: entry.filePath
                    };
                    const headingSelected =
                      activeTab?.kind === 'collection' &&
                      activeTab.collectionPath === entry.filePath;
                    const treeSelectedPath =
                      runSidebarFocus?.collectionPath === entry.filePath
                        ? runSidebarFocus.path
                        : activeTab &&
                            activeTab.kind !== 'environment' &&
                            activeTab.collectionPath === entry.filePath &&
                            (activeTab.kind === 'request' || activeTab.kind === 'folder')
                          ? activeTab.path
                          : null;
                    const collectionExpanded = ui.collectionExpanded;
                    const compare = compareByPath[entry.filePath];
                    const collectionDirty = ui.collectionDirty || ui.structureDirty;
                    const collectionTooltip = [
                      collectionName,
                      entry.filePath,
                      `${counts.folders} folder${counts.folders === 1 ? '' : 's'} · ${counts.requests} request${counts.requests === 1 ? '' : 's'}`,
                      compare
                        ? `vs ${compare.baseRef} · ${compare.diff.changedCount} changed`
                        : null,
                      collectionDirty ? 'Unsaved changes' : null
                    ]
                      .filter(Boolean)
                      .join('\n');

                    return [
                      <div className="sidebar-collection" key={entry.filePath}>
                        <div
                          className={`collection-heading ${headingSelected ? 'selected' : ''} ${
                            collectionExpanded ? 'expanded' : 'collapsed'
                          } ${
                            collectionDropPath === entry.filePath ? 'drop-into' : ''
                          }`.trim()}
                          data-sidebar-key={tabKey({
                            kind: 'collection',
                            collectionPath: entry.filePath
                          })}
                          onContextMenu={(event) => openContextMenu(event, target)}
                          onDragOver={(event) => {
                            if (!Array.from(event.dataTransfer.types).includes(ITEM_PATH_MIME)) {
                              return;
                            }
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'move';
                            setCollectionDropPath(entry.filePath);
                          }}
                          onDragLeave={(event) => {
                            if (
                              event.currentTarget.contains(event.relatedTarget as Node | null)
                            ) {
                              return;
                            }
                            setCollectionDropPath((current) =>
                              current === entry.filePath ? null : current
                            );
                          }}
                          onDrop={(event) => {
                            const payload = decodeItemDrag(
                              event.dataTransfer.getData(ITEM_PATH_MIME)
                            );
                            setCollectionDropPath(null);
                            if (!payload) {
                              return;
                            }
                            event.preventDefault();
                            moveTreeItem(
                              payload.collectionPath,
                              payload.path,
                              entry.filePath,
                              { relation: 'into', path: null }
                            );
                          }}
                        >
                          <button
                            type="button"
                            className="collection-chevron-button"
                            aria-label={
                              collectionExpanded
                                ? 'Collapse collection'
                                : 'Expand collection'
                            }
                            aria-expanded={collectionExpanded}
                            onClick={(event) => {
                              event.stopPropagation();
                              const expanding = !collectionExpanded;
                              updateUi(entry.filePath, (current) => ({
                                ...current,
                                collectionExpanded: !current.collectionExpanded
                              }));
                              if (expanding && sidebar.changedOnly && compare) {
                                nudgeChangedOnlyMode();
                              }
                            }}
                          >
                            <span className="collection-chevron" aria-hidden>
                              {collectionExpanded ? '▾' : '▸'}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="collection-heading-select"
                            onClick={(event) => {
                              setRunSidebarFocus(null);
                              openTab(
                                {
                                  kind: 'collection',
                                  collectionPath: entry.filePath
                                },
                                event.metaKey || event.ctrlKey
                                  ? { forceNew: true }
                                  : undefined
                              );
                            }}
                            title={collectionTooltip}
                          >
                            <span className="collection-icon" aria-hidden>
                              ◇
                            </span>
                            <strong>{collectionName}</strong>
                          </button>
                          <button
                            type="button"
                            className="tree-more collection-more"
                            aria-label="Collection actions"
                            title="Collection actions"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              openContextMenu(event, target);
                            }}
                          >
                            ···
                          </button>
                        </div>
                        {collectionExpanded ? (
                          <CollectionTree
                            collectionPath={entry.filePath}
                            items={entry.collection.item}
                            expanded={ui.expanded}
                            selectedPath={treeSelectedPath}
                            filterQuery={sidebarFilter}
                            changedOnly={sidebar.changedOnly && Boolean(compare)}
                            structuralDiff={compare?.diff ?? null}
                            onToggleFolder={(path) => toggleFolder(entry.filePath, path)}
                            onSelectFolder={(path, options) => {
                              setRunSidebarFocus(null);
                              openFolderTab(entry.filePath, path, options);
                            }}
                            onSelectRequest={(path, options) => {
                              setRunSidebarFocus(null);
                              openRequestTab(entry.filePath, path, options);
                            }}
                            focusedRemovedKey={
                              compare && focusedChangeKey?.startsWith('__removed__')
                                ? focusedChangeKey
                                : null
                            }
                            onSelectRemoved={(ghost) =>
                              selectRemovedGhost(entry.filePath, ghost)
                            }
                            onContextMenu={(event, treeTarget) =>
                              openContextMenu(event, treeTarget)
                            }
                            onMoveItem={moveTreeItem}
                          />
                        ) : null}
                      </div>
                    ];
                  })
                : null}
              {collectionsSectionOpen &&
              isSearching &&
              collections.every((entry) => {
                const collectionName =
                  entry.collection.info?.name?.trim() || 'Untitled collection';
                return (
                  !textMatchesQuery(collectionName, sidebarFilter) &&
                  !(entry.collection.item ?? []).some((item) =>
                    itemMatchesQuery(item, sidebarFilter)
                  )
                );
              }) ? (
                <p className="sidebar-empty">No matching collections</p>
              ) : null}
            </div>

            {activeCompare && activeCollection ? (
              <ChangeListPanel
                baseRef={activeCompare.baseRef}
                defaultBase={activeCompare.git.defaultBase}
                branches={activeCompare.git.branches}
                recentRevisions={activeCompare.git.recentRevisions}
                currentBranch={activeCompare.currentBranch}
                compareSource={activeCompare.compareSource}
                collection={activeCollection.collection}
                collectionName={
                  activeCollection.collection.info?.name?.trim() ||
                  fileName(activeCollection.filePath)
                }
                collectionPath={activeCollection.filePath}
                entries={changeList}
                activeKey={focusedChangeKey}
                expanded={sidebar.changesExpanded}
                onExpandedChange={(expanded) =>
                  setSidebar((current) =>
                    current.changesExpanded === expanded
                      ? current
                      : { ...current, changesExpanded: expanded }
                  )
                }
                onSelect={(entry) => {
                  focusChangeEntry(activeCollection.filePath, entry);
                }}
                onContextMenu={(event, entry) => {
                  openContextMenu(event, {
                    kind: 'change',
                    collectionPath: activeCollection.filePath,
                    entry
                  });
                }}
                onPrev={() => cycleChange(-1)}
                onNext={() => cycleChange(1)}
                onChangeBase={(baseRef) => {
                  void setCompareBaseRef(activeCollection.filePath, baseRef);
                }}
                onChangeSource={(source) => {
                  void setCompareSource(activeCollection.filePath, source);
                }}
                onRefresh={() => {
                  void reloadCompareBase(activeCollection.filePath);
                }}
              />
            ) : null}

            <div
              ref={environmentPanelRef}
              className={`sidebar-section sidebar-section-environments ${
                environmentsSectionOpen ? '' : 'is-collapsed'
              }`.trim()}
              style={
                environmentsSectionOpen
                  ? { height: environmentPanelHeight }
                  : undefined
              }
            >
              <div
                className="change-list-resize environment-list-resize"
                role="separator"
                aria-orientation="horizontal"
                aria-valuemin={CHANGES_COLLAPSE_HEIGHT}
                aria-valuemax={maxEnvironmentPanelHeight() ?? 800}
                aria-valuenow={
                  environmentsSectionOpen
                    ? environmentPanelHeight
                    : CHANGES_COLLAPSE_HEIGHT
                }
                aria-label="Resize environments panel"
                aria-disabled={!environmentsSectionOpen}
                tabIndex={environmentsSectionOpen ? 0 : -1}
                onPointerDown={onEnvironmentResizePointerDown}
                onPointerMove={onEnvironmentResizePointerMove}
                onPointerUp={onEnvironmentResizePointerUp}
                onPointerCancel={onEnvironmentResizePointerUp}
                onKeyDown={(event) => {
                  if (
                    !environmentsSectionOpen ||
                    (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')
                  ) {
                    return;
                  }
                  event.preventDefault();
                  const delta = event.key === 'ArrowUp' ? 16 : -16;
                  const next = environmentPanelHeight + delta;
                  if (next <= CHANGES_COLLAPSE_HEIGHT) {
                    collapseEnvironmentPanel();
                    return;
                  }
                  setEnvironmentPanelHeight(
                    clampChangesHeight(next, maxEnvironmentPanelHeight())
                  );
                }}
              />
              <div className="sidebar-section-title">
                <button
                  type="button"
                  className="sidebar-section-toggle"
                  aria-expanded={environmentsSectionOpen}
                  aria-label={
                    environmentsSectionOpen
                      ? 'Collapse environments'
                      : 'Expand environments'
                  }
                  onClick={toggleEnvironmentPanel}
                >
                  <span className="sidebar-chevron" aria-hidden>
                    {environmentsSectionOpen ? '▾' : '▸'}
                  </span>
                  <strong>Environments</strong>
                  <span className="sidebar-count">{environments.length}</span>
                </button>
                <button
                  type="button"
                  className="sidebar-add"
                  aria-label="New environment"
                  title="New environment"
                  onClick={() => void createNewEnvironment()}
                >
                  +
                </button>
                <button
                  type="button"
                  className="sidebar-add"
                  aria-label="Open environment"
                  title="Open environment"
                  onClick={() => void openEnvironment()}
                >
                  ↗
                </button>
              </div>

              {environmentsSectionOpen ? (
                <div className="environment-list">
                  {environments.flatMap((entry) => {
                    const envName =
                      entry.environment.name?.trim() || 'Untitled environment';
                    const envFile = fileName(entry.filePath);
                    if (
                      isSearching &&
                      !textMatchesQuery(envName, sidebarFilter) &&
                      !textMatchesQuery(envFile, sidebarFilter)
                    ) {
                      return [];
                    }

                    const target: EnvironmentTarget = {
                      kind: 'environment',
                      environmentPath: entry.filePath
                    };
                    const selected =
                      activeTab?.kind === 'environment' &&
                      activeTab.environmentPath === entry.filePath;
                    const isActive = activeEnvironmentPath === entry.filePath;
                    const dirty = isEnvironmentDirty(
                      entry.environment,
                      entry.originalRaw
                    );
                    return [
                      <div
                        key={entry.filePath}
                        className={`environment-row-item ${selected ? 'selected' : ''}`}
                        data-sidebar-key={tabKey({
                          kind: 'environment',
                          environmentPath: entry.filePath
                        })}
                        onContextMenu={(event) => openContextMenu(event, target)}
                      >
                        <button
                          type="button"
                          className={`environment-active ${isActive ? 'is-active' : ''}`}
                          aria-label={
                            isActive
                              ? `Active environment ${envName}`
                              : `Set ${envName} active`
                          }
                          aria-pressed={isActive}
                          title={isActive ? 'Clear active' : 'Set active'}
                          onClick={(event) => {
                            event.stopPropagation();
                            setActiveEnvironmentPath((current) =>
                              current === entry.filePath ? null : entry.filePath
                            );
                          }}
                        >
                          <span aria-hidden>{isActive ? '●' : '○'}</span>
                        </button>
                        <button
                          type="button"
                          className="environment-select"
                          title={entry.filePath}
                          onClick={(event) =>
                            openTab(
                              {
                                kind: 'environment',
                                environmentPath: entry.filePath
                              },
                              event.metaKey || event.ctrlKey
                                ? { forceNew: true }
                                : undefined
                            )
                          }
                        >
                          <strong>{envName}</strong>
                          <span>{envFile}</span>
                        </button>
                        {dirty ? (
                          <span className="dirty-dot" title="Unsaved changes" />
                        ) : null}
                        <button
                          type="button"
                          className="tree-more environment-more"
                          aria-label="Environment actions"
                          title="Environment actions"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            openContextMenu(event, target);
                          }}
                        >
                          ···
                        </button>
                      </div>
                    ];
                  })}
                  {isSearching &&
                  environments.every((entry) => {
                    const envName =
                      entry.environment.name?.trim() || 'Untitled environment';
                    return (
                      !textMatchesQuery(envName, sidebarFilter) &&
                      !textMatchesQuery(fileName(entry.filePath), sidebarFilter)
                    );
                  }) ? (
                    <p className="sidebar-empty">No matching environments</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </aside>

          <div
            className="sidebar-resize"
            role="separator"
            aria-orientation="vertical"
            aria-valuemin={SIDEBAR_MIN_WIDTH}
            aria-valuemax={SIDEBAR_MAX_WIDTH}
            aria-valuenow={sidebar.width}
            aria-label="Resize sidebar"
            tabIndex={0}
            onPointerDown={onSidebarResizePointerDown}
            onPointerMove={onSidebarResizePointerMove}
            onPointerUp={onSidebarResizePointerUp}
            onPointerCancel={onSidebarResizePointerUp}
            onKeyDown={onSidebarResizeKeyDown}
          />

          <section className="main-workspace">
            <RequestTabs
              tabs={tabs}
              activeTab={activeTab}
              onSelect={setActiveTab}
              onClose={closeTab}
              onDropRequest={(collectionPath, path) =>
                openRequestTab(collectionPath, path, { forceNew: true })
              }
              onReorder={reorderTabs}
              onContextMenu={(event, tab) =>
                openContextMenu(event, { kind: 'tab', tab })
              }
              onNewRequest={
                collections.length > 0
                  ? () => createBlankDraftRequest(activeTab)
                  : null
              }
            />

            <main className="detail">
              {!activeTab && (
                <div className="empty-state">
                  <span className="empty-state-icon" aria-hidden>
                    ↖
                  </span>
                  <h2>Select a collection, folder, request, or environment</h2>
                  <p>Open a tab from the sidebar to edit or run.</p>
                </div>
              )}

              {activeTab?.kind === 'environment' && activeEnvironment && (
                <EnvironmentPane
                  name={activeEnvironment.environment.name?.trim() || 'Untitled environment'}
                  filePath={activeEnvironment.filePath}
                  values={getEnvironmentValues(activeEnvironment.environment)}
                  compareBaseRef={activeEnvCompare?.baseRef ?? null}
                  baseValues={
                    activeEnvCompare
                      ? getEnvironmentValues(activeEnvCompare.baseEnvironment)
                      : null
                  }
                  valueStatusByIndex={activeEnvCompare?.diff.byCurrentIndex ?? null}
                  removedKeys={activeEnvCompare?.diff.removed ?? null}
                  onRestoreAll={
                    activeEnvCompare
                      ? async () => {
                          if (
                            !window.confirm(
                              `Restore all environment values from ${activeEnvCompare.baseRef}? This writes the file.`
                            )
                          ) {
                            return;
                          }
                          try {
                            await persistEnvironment(
                              activeEnvironment.filePath,
                              restoreAllEnvironmentValuesFromBase(
                                activeEnvironment.environment,
                                activeEnvCompare.baseEnvironment
                              )
                            );
                            setStatus({
                              kind: 'ok',
                              message: `Restored from ${activeEnvCompare.baseRef} · saved`
                            });
                          } catch (error) {
                            setStatus({ kind: 'error', message: errorMessage(error) });
                          }
                        }
                      : null
                  }
                  onRestoreKey={
                    activeEnvCompare
                      ? async (key) => {
                          if (
                            !window.confirm(
                              `Restore “${key}” from ${activeEnvCompare.baseRef}? This writes the file.`
                            )
                          ) {
                            return;
                          }
                          try {
                            await persistEnvironment(
                              activeEnvironment.filePath,
                              restoreEnvironmentValueFromBase(
                                activeEnvironment.environment,
                                activeEnvCompare.baseEnvironment,
                                key
                              )
                            );
                            setStatus({
                              kind: 'ok',
                              message: `Restored “${key}” from ${activeEnvCompare.baseRef} · saved`
                            });
                          } catch (error) {
                            setStatus({ kind: 'error', message: errorMessage(error) });
                          }
                        }
                      : null
                  }
                  onAdd={() =>
                    applyEnvironmentUpdate(
                      activeEnvironment.filePath,
                      setEnvironmentValues(
                        activeEnvironment.environment,
                        addEnvironmentValue(
                          getEnvironmentValues(activeEnvironment.environment)
                        )
                      )
                    )
                  }
                  onChange={(index, patch) =>
                    applyEnvironmentUpdate(
                      activeEnvironment.filePath,
                      setEnvironmentValues(
                        activeEnvironment.environment,
                        updateEnvironmentValue(
                          getEnvironmentValues(activeEnvironment.environment),
                          index,
                          patch
                        )
                      )
                    )
                  }
                  onToggleEnabled={(index, enabled) =>
                    applyEnvironmentUpdate(
                      activeEnvironment.filePath,
                      setEnvironmentValues(
                        activeEnvironment.environment,
                        setEnvironmentValueEnabled(
                          getEnvironmentValues(activeEnvironment.environment),
                          index,
                          enabled
                        )
                      )
                    )
                  }
                  onRemove={(index) =>
                    applyEnvironmentUpdate(
                      activeEnvironment.filePath,
                      setEnvironmentValues(
                        activeEnvironment.environment,
                        removeEnvironmentValue(
                          getEnvironmentValues(activeEnvironment.environment),
                          index
                        )
                      )
                    )
                  }
                />
              )}

              {showingRemovedDiff &&
                removedDiffView &&
                removedFieldDiff &&
                (compareByPath[removedDiffView.collectionPath]?.baseRef ?? null) && (
                  <div className="detail-split detail-split-single">
                    <div className="detail-request">
                      <RequestDiffPane
                        key={`removed:${removedDiffView.ghostKey}`}
                        name={removedDiffView.name}
                        path={`removed · ${removedDiffView.ghostKey}`}
                        baseRef={compareByPath[removedDiffView.collectionPath]!.baseRef}
                        fieldDiff={removedFieldDiff}
                        onSwitchToEdit={null}
                        onRestoreRequest={null}
                        onRestoreSection={null}
                      />
                    </div>
                  </div>
                )}

              {!showingRemovedDiff &&
                activeTab?.kind === 'collection' &&
                activeCollection &&
                activeCounts && (
                <CollectionRunPane
                  title={activeCollection.collection.info?.name ?? 'Untitled collection'}
                  subtitle={`Run all ${activeCounts.requests} request${
                    activeCounts.requests === 1 ? '' : 's'
                  } with Newman. Uses in-memory edits — Save is not required.`}
                  runLabel="Run collection"
                  requestCount={activeCounts.requests}
                  result={scopeRuns[tabKey(activeTab)] ?? null}
                  running={runningKey === tabKey(activeTab)}
                  onRun={() => void runScope(activeTab)}
                  onNewRequest={() => createNewRequestNear(activeTab)}
                  onRevealRequest={(_execution, index) => {
                    const result = scopeRuns[tabKey(activeTab)];
                    if (!result) {
                      return;
                    }
                    revealRunExecution(
                      activeTab.collectionPath,
                      null,
                      result.executions,
                      index
                    );
                  }}
                  onRerunRequest={(_execution, index) => {
                    const result = scopeRuns[tabKey(activeTab)];
                    if (!result) {
                      return;
                    }
                    void rerunScopeExecution(activeTab, result.executions, index);
                  }}
                  rerunningIndex={
                    rerunningRow?.runKey === tabKey(activeTab)
                      ? rerunningRow.index
                      : null
                  }
                  onContextMenu={(event, execution, index) => {
                    if (activeTab.kind !== 'collection') {
                      return;
                    }
                    openContextMenu(event, {
                      kind: 'run-result',
                      tab: activeTab,
                      index,
                      name: execution.name
                    });
                  }}
                  onNewmanReady={(version) => {
                    const key = tabKey(activeTab);
                    setScopeRuns((runs) => {
                      const next = { ...runs };
                      delete next[key];
                      return next;
                    });
                    setStatus({
                      kind: 'ok',
                      message: `Newman ${version} ready — Run again`
                    });
                  }}
                  variablesSlot={
                    <VariablesPane
                      scopeLabel="collection"
                      variables={getCollectionVariables(activeCollection.collection)}
                      compareBaseRef={activeCompare?.baseRef ?? null}
                      baseVariables={
                        activeCompare
                          ? getCollectionVariables(activeCompare.baseCollection)
                          : null
                      }
                      valueStatusByIndex={collectionVariableDiff?.byCurrentIndex ?? null}
                      removedKeys={collectionVariableDiff?.removed ?? null}
                      onRestoreAll={
                        activeCompare
                          ? async () => {
                              if (
                                !window.confirm(
                                  `Restore all collection variables from ${activeCompare.baseRef}? This writes the file.`
                                )
                              ) {
                                return;
                              }
                              try {
                                await persistCollection(
                                  activeCollection.filePath,
                                  setCollectionVariables(
                                    activeCollection.collection,
                                    restoreAllVariablesFromBase(
                                      getCollectionVariables(activeCompare.baseCollection)
                                    )
                                  )
                                );
                                setStatus({
                                  kind: 'ok',
                                  message: `Restored collection variables from ${activeCompare.baseRef} · saved`
                                });
                              } catch (error) {
                                setStatus({ kind: 'error', message: errorMessage(error) });
                              }
                            }
                          : null
                      }
                      onRestoreKey={
                        activeCompare
                          ? async (key) => {
                              if (
                                !window.confirm(
                                  `Restore “${key}” from ${activeCompare.baseRef}? This writes the file.`
                                )
                              ) {
                                return;
                              }
                              try {
                                await persistCollection(
                                  activeCollection.filePath,
                                  setCollectionVariables(
                                    activeCollection.collection,
                                    restoreVariableFromBase(
                                      getCollectionVariables(activeCollection.collection),
                                      getCollectionVariables(activeCompare.baseCollection),
                                      key
                                    )
                                  )
                                );
                                setStatus({
                                  kind: 'ok',
                                  message: `Restored “${key}” from ${activeCompare.baseRef} · saved`
                                });
                              } catch (error) {
                                setStatus({ kind: 'error', message: errorMessage(error) });
                              }
                            }
                          : null
                      }
                      onAdd={() => editCollectionVariables((vars) => addVariable(vars))}
                      onChange={(index, patch) =>
                        editCollectionVariables((vars) => updateVariable(vars, index, patch))
                      }
                      onToggleDisabled={(index, disabled) =>
                        editCollectionVariables((vars) =>
                          setVariableDisabled(vars, index, disabled)
                        )
                      }
                      onRemove={(index) =>
                        editCollectionVariables((vars) => removeVariable(vars, index))
                      }
                    />
                  }
                />
              )}

              {!showingRemovedDiff &&
                activeTab?.kind === 'folder' &&
                activeCollection &&
                activeFolder &&
                isFolder(activeFolder) && (
                <CollectionRunPane
                  title={activeFolder.name?.trim() || 'Folder'}
                  subtitle={`Run this folder (${countRequestsUnder(activeFolder)} request${
                    countRequestsUnder(activeFolder) === 1 ? '' : 's'
                  }) via Newman --folder. Uses in-memory edits — Save is not required.`}
                  runLabel="Run folder"
                  requestCount={countRequestsUnder(activeFolder)}
                  result={scopeRuns[tabKey(activeTab)] ?? null}
                  running={runningKey === tabKey(activeTab)}
                  onRun={() => void runScope(activeTab)}
                  onNewRequest={() => createNewRequestNear(activeTab)}
                  onRevealRequest={(_execution, index) => {
                    const result = scopeRuns[tabKey(activeTab)];
                    if (!result || activeTab.kind !== 'folder') {
                      return;
                    }
                    revealRunExecution(
                      activeTab.collectionPath,
                      activeTab.path,
                      result.executions,
                      index
                    );
                  }}
                  onRerunRequest={(_execution, index) => {
                    const result = scopeRuns[tabKey(activeTab)];
                    if (!result) {
                      return;
                    }
                    void rerunScopeExecution(activeTab, result.executions, index);
                  }}
                  rerunningIndex={
                    rerunningRow?.runKey === tabKey(activeTab)
                      ? rerunningRow.index
                      : null
                  }
                  onContextMenu={(event, execution, index) => {
                    if (activeTab.kind !== 'folder') {
                      return;
                    }
                    openContextMenu(event, {
                      kind: 'run-result',
                      tab: activeTab,
                      index,
                      name: execution.name
                    });
                  }}
                  onNewmanReady={(version) => {
                    const key = tabKey(activeTab);
                    setScopeRuns((runs) => {
                      const next = { ...runs };
                      delete next[key];
                      return next;
                    });
                    setStatus({
                      kind: 'ok',
                      message: `Newman ${version} ready — Run again`
                    });
                  }}
                  variablesSlot={
                    <VariablesPane
                      scopeLabel="folder"
                      variables={getItemVariables(activeFolder)}
                      compareBaseRef={activeCompare?.baseRef ?? null}
                      baseVariables={
                        folderBaseItem ? getItemVariables(folderBaseItem) : null
                      }
                      valueStatusByIndex={folderVariableDiff?.byCurrentIndex ?? null}
                      removedKeys={folderVariableDiff?.removed ?? null}
                      onRestoreAll={
                        activeCompare && folderBaseItem
                          ? async () => {
                              if (
                                !window.confirm(
                                  `Restore all folder variables from ${activeCompare.baseRef}? This writes the file.`
                                )
                              ) {
                                return;
                              }
                              try {
                                await persistCollection(activeCollection.filePath, {
                                  ...activeCollection.collection,
                                  item: updateItemByPath(
                                    activeCollection.collection.item,
                                    activeTab.path,
                                    (item) =>
                                      setItemVariables(
                                        item,
                                        restoreAllVariablesFromBase(
                                          getItemVariables(folderBaseItem)
                                        )
                                      )
                                  )
                                });
                                setStatus({
                                  kind: 'ok',
                                  message: `Restored folder variables from ${activeCompare.baseRef} · saved`
                                });
                              } catch (error) {
                                setStatus({ kind: 'error', message: errorMessage(error) });
                              }
                            }
                          : null
                      }
                      onRestoreKey={
                        activeCompare && folderBaseItem
                          ? async (key) => {
                              if (
                                !window.confirm(
                                  `Restore “${key}” from ${activeCompare.baseRef}? This writes the file.`
                                )
                              ) {
                                return;
                              }
                              try {
                                await persistCollection(activeCollection.filePath, {
                                  ...activeCollection.collection,
                                  item: updateItemByPath(
                                    activeCollection.collection.item,
                                    activeTab.path,
                                    (item) =>
                                      setItemVariables(
                                        item,
                                        restoreVariableFromBase(
                                          getItemVariables(item),
                                          getItemVariables(folderBaseItem),
                                          key
                                        )
                                      )
                                  )
                                });
                                setStatus({
                                  kind: 'ok',
                                  message: `Restored “${key}” from ${activeCompare.baseRef} · saved`
                                });
                              } catch (error) {
                                setStatus({ kind: 'error', message: errorMessage(error) });
                              }
                            }
                          : null
                      }
                      onAdd={() =>
                        editFolderVariables(activeTab.path, (vars) => addVariable(vars))
                      }
                      onChange={(index, patch) =>
                        editFolderVariables(activeTab.path, (vars) =>
                          updateVariable(vars, index, patch)
                        )
                      }
                      onToggleDisabled={(index, disabled) =>
                        editFolderVariables(activeTab.path, (vars) =>
                          setVariableDisabled(vars, index, disabled)
                        )
                      }
                      onRemove={(index) =>
                        editFolderVariables(activeTab.path, (vars) =>
                          removeVariable(vars, index)
                        )
                      }
                    />
                  }
                />
              )}

              {!showingRemovedDiff &&
                activeTab?.kind === 'request' &&
                !(activeRequestPath && selectedItem && selectedRequest) && (
                  <div className="empty-state">
                    <span className="empty-state-icon" aria-hidden>
                      ↖
                    </span>
                    <h2>Select a request</h2>
                    <p>Choose a request from the collection tree to start editing.</p>
                  </div>
                )}

              {!showingRemovedDiff &&
                activeTab?.kind === 'request' &&
                activeRequestPath &&
                selectedItem &&
                selectedRequest && (
                  <div
                    className={`detail-split${
                      showingRequestDiff ? ' detail-split-single' : ''
                    }`}
                  >
                    <div className="detail-request">
                      {activeRequestViewMode === 'diff' &&
                      requestFieldDiff &&
                      activeCompare ? (
                        <RequestDiffPane
                          key={`diff:${tabKey(activeTab)}`}
                          name={selectedItem.name?.trim() || 'Untitled request'}
                          path={activeRequestPath}
                          baseRef={activeCompare.baseRef}
                          fieldDiff={requestFieldDiff}
                          onSwitchToEdit={() =>
                            setRequestViewModeByKey((current) => ({
                              ...current,
                              [tabKey(activeTab)]: 'edit'
                            }))
                          }
                          onRestoreRequest={
                            !requestFieldDiff.semantic.isAdded &&
                            requestFieldDiff.semantic.hasChanges
                              ? () =>
                                  restoreRequestFromBase(
                                    activeTab.collectionPath,
                                    activeRequestPath
                                  )
                              : null
                          }
                          onRestoreSection={
                            !requestFieldDiff.semantic.isAdded
                              ? (section) =>
                                  restoreRequestSection(
                                    activeTab.collectionPath,
                                    activeRequestPath,
                                    section
                                  )
                              : null
                          }
                        />
                      ) : (
                      <RequestPane
                        key={tabKey(activeTab)}
                        item={selectedItem}
                        request={selectedRequest}
                        path={activeRequestPath}
                        urlPreviewVariables={urlPreviewVariables}
                        pinned={Boolean(activePin)}
                        pinnedDetached={activePinDetached}
                        draft={isDraftTab(activeTab)}
                        onPin={activePin ? null : () => pinActiveRequest()}
                        onUnpin={
                          activePin
                            ? () => {
                                unpinRequestTab(activeTab);
                                setStatus({ kind: 'ok', message: 'Unpinned request' });
                              }
                            : null
                        }
                        onSaveAs={() => void saveRequestAs(activeTab)}
                        semanticDiff={requestSemanticDiff}
                        compareBaseRef={activeCompare?.baseRef ?? null}
                        onSwitchToDiff={
                          requestFieldDiff &&
                          (requestFieldDiff.semantic.hasChanges ||
                            requestFieldDiff.semantic.isAdded)
                            ? () =>
                                setRequestViewModeByKey((current) => ({
                                  ...current,
                                  [tabKey(activeTab)]: 'diff'
                                }))
                            : null
                        }
                        onRestoreRequest={
                          activeCompare &&
                          requestSemanticDiff &&
                          !requestSemanticDiff.isAdded &&
                          requestSemanticDiff.hasChanges
                            ? () =>
                                restoreRequestFromBase(
                                  activeTab.collectionPath,
                                  activeRequestPath
                                )
                            : null
                        }
                        onRestoreSection={
                          activeCompare &&
                          requestSemanticDiff &&
                          !requestSemanticDiff.isAdded
                            ? (section) =>
                                restoreRequestSection(
                                  activeTab.collectionPath,
                                  activeRequestPath,
                                  section
                                )
                            : null
                        }
                        onRename={(name) =>
                          editSelectedItem((item) => ({ ...item, name }))
                        }
                        onChangeMethod={(method) =>
                          editSelectedItem((item) => setRequestMethod(item, method))
                        }
                        onChangeUrl={(raw) =>
                          editSelectedItem((item) => setRequestUrl(item, raw))
                        }
                        onAddQueryParam={() =>
                          editSelectedItem((item) => addRequestQueryParam(item))
                        }
                        onChangeQueryParam={(index, patch) =>
                          editSelectedItem((item) => updateRequestQueryParam(item, index, patch))
                        }
                        onToggleQueryParamDisabled={(index, disabled) =>
                          editSelectedItem((item) =>
                            setRequestQueryParamDisabled(item, index, disabled)
                          )
                        }
                        onRemoveQueryParam={(index) =>
                          editSelectedItem((item) => removeRequestQueryParam(item, index))
                        }
                        onAddHeader={() => editSelectedItem((item) => addRequestHeader(item))}
                        onChangeHeader={(index, patch) =>
                          editSelectedItem((item) => updateRequestHeader(item, index, patch))
                        }
                        onToggleHeaderDisabled={(index, disabled) =>
                          editSelectedItem((item) =>
                            setRequestHeaderDisabled(item, index, disabled)
                          )
                        }
                        onRemoveHeader={(index) =>
                          editSelectedItem((item) => removeRequestHeader(item, index))
                        }
                        onChangeBodyMode={(mode) =>
                          editSelectedItem((item) => setRequestBodyMode(item, mode))
                        }
                        onChangeBodyRaw={(raw) =>
                          editSelectedItem((item) => setRequestBodyRaw(item, raw))
                        }
                        onAddUrlEncoded={() =>
                          editSelectedItem((item) => addRequestUrlEncodedParam(item))
                        }
                        onChangeUrlEncoded={(index, patch) =>
                          editSelectedItem((item) =>
                            updateRequestUrlEncodedParam(item, index, patch)
                          )
                        }
                        onToggleUrlEncodedDisabled={(index, disabled) =>
                          editSelectedItem((item) =>
                            setRequestUrlEncodedParamDisabled(item, index, disabled)
                          )
                        }
                        onRemoveUrlEncoded={(index) =>
                          editSelectedItem((item) => removeRequestUrlEncodedParam(item, index))
                        }
                        onChangeAuthType={(type) =>
                          editSelectedItem((item) => setRequestAuthType(item, type))
                        }
                        onChangeBearerToken={(token) =>
                          editSelectedItem((item) => setRequestBearerToken(item, token))
                        }
                        onChangeBasicAuth={(patch) =>
                          editSelectedItem((item) => setRequestBasicAuth(item, patch))
                        }
                        onChangeApiKeyAuth={(patch) =>
                          editSelectedItem((item) => setRequestApiKeyAuth(item, patch))
                        }
                        onChangePrerequestScript={(source) =>
                          editSelectedItem((item) =>
                            setItemScriptSource(item, 'prerequest', source)
                          )
                        }
                        onChangeTestScript={(source) =>
                          editSelectedItem((item) => setItemScriptSource(item, 'test', source))
                        }
                        onSend={() => void sendRequest()}
                        sending={sendingKeys.has(tabKey(activeTab))}
                      />
                      )}
                    </div>
                    {showingRequestDiff ? null : (
                    <div className="detail-response">
                      <ResponsePane
                        result={
                          requestRuns[
                            requestRunKey(
                              activeTab.collectionPath,
                              activeRequestPath,
                              activeTab.draftId
                            )
                          ] ?? null
                        }
                        running={sendingKeys.has(tabKey(activeTab))}
                        onNewmanReady={(version) => {
                          const key = requestRunKey(
                            activeTab.collectionPath,
                            activeRequestPath,
                            activeTab.draftId
                          );
                          setRequestRuns((runs) => {
                            const next = { ...runs };
                            delete next[key];
                            return next;
                          });
                          setStatus({
                            kind: 'ok',
                            message: `Newman ${version} ready — Send again`
                          });
                        }}
                      />
                    </div>
                    )}
                  </div>
                )}
            </main>
          </section>
        </div>
      )}

      {terminalOpen ? (
        <TerminalPane
          entries={terminalEntries}
          height={terminalHeight}
          onResizePointerDown={onTerminalResizePointerDown}
          onResizePointerMove={onTerminalResizePointerMove}
          onResizePointerUp={onTerminalResizePointerUp}
          onClear={() => setTerminalEntries([])}
          onClose={() => setTerminalOpen(false)}
        />
      ) : null}

      <footer className="statusbar">
        <span className={`status-indicator ${status.kind}`} aria-hidden />
        <span role="status">
          {status.kind === 'idle'
            ? hasResources
              ? (() => {
                  const compares = Object.values(compareByPath).filter(Boolean) as CollectionCompareState[];
                  if (compares.length === 1) {
                    const compare = compares[0];
                    return `Comparing vs ${compare.baseRef} · ${compare.diff.changedCount} changed`;
                  }
                  if (compares.length > 1) {
                    const total = compares.reduce((sum, entry) => sum + entry.diff.changedCount, 0);
                    return `Comparing ${compares.length} collections · ${total} changed`;
                  }
                  return anyDirty ? 'Unsaved changes' : 'Ready';
                })()
              : 'No collection open'
            : status.message}
        </span>
        <span className="statusbar-spacer" />
        {statusbarEnvironment ? (
          <>
            <span title={statusbarEnvironment.filePath}>
              env: {statusbarEnvironment.environment.name?.trim() || fileName(statusbarEnvironment.filePath)}
              {activeEnvironmentPath === statusbarEnvironment.filePath ? ' · active' : ''}
            </span>
            <span className="statusbar-spacer-sm" />
          </>
        ) : null}
        {statusbarCollection ? (
          <>
            <span title={statusbarCollection.filePath}>
              {fileName(statusbarCollection.filePath)}
            </span>
            <span>Postman v2.1</span>
            <span className="statusbar-spacer-sm" />
          </>
        ) : null}
        <button
          type="button"
          className={`statusbar-terminal ${terminalOpen ? 'is-active' : ''} ${
            terminalUnread && !terminalOpen ? 'has-unread' : ''
          }`.trim()}
          aria-pressed={terminalOpen}
          title={terminalOpen ? 'Hide Terminal' : 'Show Terminal (Newman CLI output)'}
          onClick={() => {
            setTerminalOpen((open) => {
              const next = !open;
              if (next) {
                setTerminalUnread(false);
              }
              return next;
            });
          }}
        >
          Terminal
          {terminalUnread && !terminalOpen ? (
            <span className="statusbar-terminal-dot" aria-hidden />
          ) : null}
        </button>
      </footer>
      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onSelect={handleContextAction}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
      {prompt ? (
        <PromptDialog
          title={prompt.title}
          label={prompt.label}
          defaultValue={prompt.defaultValue}
          confirmLabel={prompt.confirmLabel}
          placeholder={prompt.placeholder}
          onConfirm={(value) => {
            prompt.resolve(value);
            setPrompt(null);
          }}
          onCancel={() => {
            prompt.resolve(null);
            setPrompt(null);
          }}
        />
      ) : null}
      {saveAsPrompt ? (
        <SaveAsDialog
          title={saveAsPrompt.title}
          defaultName={saveAsPrompt.defaultName}
          locations={saveAsPrompt.locations}
          defaultParentPath={saveAsPrompt.defaultParentPath}
          confirmLabel={saveAsPrompt.confirmLabel}
          onConfirm={(value) => {
            saveAsPrompt.resolve(value);
            setSaveAsPrompt(null);
          }}
          onCancel={() => {
            saveAsPrompt.resolve(null);
            setSaveAsPrompt(null);
          }}
        />
      ) : null}
    </div>
  );
}
