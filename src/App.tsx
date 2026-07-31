import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { AppCommand } from '../electron/commands.ts';
import CollectionTree, { type TreeTarget } from './components/CollectionTree.tsx';
import CollectionRunPane from './components/CollectionRunPane.tsx';
import ContextMenu, { type ContextMenuItem } from './components/ContextMenu.tsx';
import EnvironmentPane from './components/EnvironmentPane.tsx';
import RequestPane from './components/RequestPane.tsx';
import RequestTabs, { type WorkspaceTabView } from './components/RequestTabs.tsx';
import ResponsePane from './components/ResponsePane.tsx';
import VariablesPane from './components/VariablesPane.tsx';
import { buildSingleRequestCollection } from './newman/buildRunCollection.ts';
import type { NewmanRunView } from './newman/parseResult.ts';
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
  type PostmanCollection,
  type PostmanItem
} from './postman/types.ts';
import {
  collectFolderPaths,
  countRequestsUnder,
  getItemByPath,
  getRequestByPath,
  isFolder,
  isRequest,
  updateItemByPath,
  type ItemPath
} from './postman/tree.ts';
import {
  createRequestItem,
  deleteItem,
  duplicateItem,
  insertItem,
  parentPathOf,
  remapPathAfterDelete,
  remapPathAfterDuplicate,
  renameCollection,
  renameItem
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
  promoteRequestUrlToObject,
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
  parseTabKey,
  requestRunKey,
  sameTab,
  tabKey,
  toSessionTab,
  type WorkspaceTab
} from './workspace/tabs.ts';
import {
  clearCollectionDirty,
  createCollectionUiState,
  isCollectionDirty,
  type CollectionUiState
} from './workspace/collectionUi.ts';
import { computeDirtyState } from './workspace/dirty.ts';
import {
  discoverForCollection,
  loadCollectionAtRef,
  type GitContext
} from './git/context.ts';
import {
  collectChangedFolderPaths,
  computeStructuralDiff,
  type StructuralDiff
} from './git/structuralDiff.ts';
import { resolveBaseRequestItem } from './git/resolveBaseItem.ts';
import { computeSemanticDiff } from './git/semanticDiff.ts';
import {
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
};

type CollectionTarget = { kind: 'collection'; collectionPath: string };
type EnvironmentTarget = { kind: 'environment'; environmentPath: string };
type ContextTarget =
  | TreeTarget
  | CollectionTarget
  | EnvironmentTarget
  | { kind: 'tab'; tab: WorkspaceTab };

type Status = { kind: 'idle' } | { kind: 'ok'; message: string } | { kind: 'error'; message: string };

const EMPTY_UI: CollectionUiState = createCollectionUiState();

function fileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
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
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [openTabs, setOpenTabs] = useState<WorkspaceTab[]>([]);
  const [activeTab, setActiveTab] = useState<WorkspaceTab | null>(null);
  const [activeEnvironmentPath, setActiveEnvironmentPath] = useState<string | null>(null);
  const [sidebar, setSidebar] = useState<SessionSidebar>({ ...DEFAULT_SIDEBAR });
  const [sidebarQuery, setSidebarQuery] = useState('');
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [sessionHome, setSessionHome] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [requestRuns, setRequestRuns] = useState<Record<string, NewmanRunView>>({});
  const [scopeRuns, setScopeRuns] = useState<Record<string, NewmanRunView>>({});
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target: ContextTarget;
  } | null>(null);

  const collectionsRef = useRef(collections);
  const environmentsRef = useRef(environments);
  const uiByPathRef = useRef(uiByPath);
  const compareByPathRef = useRef(compareByPath);
  const openTabsRef = useRef(openTabs);
  const activeTabRef = useRef(activeTab);
  const activeEnvironmentPathRef = useRef(activeEnvironmentPath);
  const sidebarRef = useRef(sidebar);
  const sendingRef = useRef(sending);
  const runningKeyRef = useRef(runningKey);
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  collectionsRef.current = collections;
  environmentsRef.current = environments;
  uiByPathRef.current = uiByPath;
  compareByPathRef.current = compareByPath;
  openTabsRef.current = openTabs;
  activeTabRef.current = activeTab;
  activeEnvironmentPathRef.current = activeEnvironmentPath;
  sidebarRef.current = sidebar;
  sendingRef.current = sending;
  runningKeyRef.current = runningKey;

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
        return [
          {
            tab,
            name: entry.collection.info?.name?.trim() || 'Collection',
            badge: 'COL',
            badgeClass: 'badge-collection',
            dirty: ui.collectionDirty || ui.structureDirty
          }
        ];
      }
      const item = getItemByPath(entry.collection.item, tab.path);
      if (!item) {
        return [];
      }
      if (tab.kind === 'folder') {
        if (!isFolder(item)) {
          return [];
        }
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
      const request = getRequestByPath(entry.collection.item, tab.path);
      if (!request || !isRequest(item)) {
        return [];
      }
      return [
        {
          tab,
          name: item.name?.trim() || 'Untitled request',
          badge: (request.method ?? 'GET').toUpperCase(),
          badgeClass: `method-${(request.method ?? 'GET').toLowerCase()}`,
          dirty: ui.dirtyPaths.has(tab.path)
        }
      ];
    });
  }, [collections, environments, uiByPath, openTabs]);

  const activeRequestPath = activeTab?.kind === 'request' ? activeTab.path : null;

  const selectedItem = useMemo(() => {
    if (!activeCollection || !activeRequestPath) {
      return null;
    }
    return getItemByPath(activeCollection.collection.item, activeRequestPath) ?? null;
  }, [activeCollection, activeRequestPath]);

  const selectedRequest = useMemo(() => {
    if (!activeCollection || !activeRequestPath) {
      return null;
    }
    return getRequestByPath(activeCollection.collection.item, activeRequestPath) ?? null;
  }, [activeCollection, activeRequestPath]);

  const activeCompare = activeCollection
    ? (compareByPath[activeCollection.filePath] ?? null)
    : null;

  const requestSemanticDiff = useMemo(() => {
    if (!activeCollection || !activeRequestPath || !selectedItem || !activeCompare) {
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
  }, [activeCollection, activeCompare, activeRequestPath, selectedItem]);

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
    async (collectionPath: string, collection: PostmanCollection) => {
      try {
        const existing = compareByPathRef.current[collectionPath];
        if (existing) {
          const diff = computeStructuralDiff(collection, existing.baseCollection);
          setCompareByPath((current) => ({
            ...current,
            [collectionPath]: { ...existing, diff }
          }));
          expandChangedFolders(collectionPath, collection, diff);
          return;
        }

        const git = await discoverForCollection(collectionPath);
        if (!git) {
          setCompareByPath((current) => ({ ...current, [collectionPath]: null }));
          return;
        }

        const baseCollection = await loadCollectionAtRef(collectionPath, git.defaultBase);
        const diff = computeStructuralDiff(collection, baseCollection);
        setCompareByPath((current) => ({
          ...current,
          [collectionPath]: {
            baseRef: git.defaultBase,
            currentBranch: git.currentBranch,
            git,
            baseCollection,
            diff
          }
        }));
        expandChangedFolders(collectionPath, collection, diff);
      } catch {
        setCompareByPath((current) => ({ ...current, [collectionPath]: null }));
      }
    },
    [expandChangedFolders]
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

  const openTab = useCallback((tab: WorkspaceTab) => {
    setOpenTabs((current) =>
      current.some((entry) => sameTab(entry, tab)) ? current : [...current, tab]
    );
    setActiveTab(tab);
  }, []);

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
          const collection = parseCollection(file.raw);
          setCollections((list) => [
            ...list,
            { filePath: file.filePath, originalRaw: file.raw, collection }
          ]);
          setUiByPath((current) => ({
            ...current,
            [file.filePath]: createCollectionUiState(collectFolderPaths(collection.item), true)
          }));
          setCompareByPath((current) => {
            const next = { ...current };
            delete next[file.filePath];
            return next;
          });
          {
            const cleared = { ...compareByPathRef.current };
            delete cleared[file.filePath];
            compareByPathRef.current = cleared;
          }
          openTab({ kind: 'collection', collectionPath: file.filePath });
          opened.push(collection.info?.name ?? fileName(file.filePath));
          focusPath = file.filePath;
          void refreshCompare(file.filePath, collection);
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
  }, [openTab, refreshCompare]);

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
          openTab({ kind: 'environment', environmentPath: file.filePath });
          if (activeEnvironmentPathRef.current == null) {
            setActiveEnvironmentPath(file.filePath);
          }
          opened.push(environment.name ?? fileName(file.filePath));
          focusPath = file.filePath;
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
  }, [openTab]);

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

  /** Save the resource behind the active tab; fall back to the first dirty one. */
  const saveActiveResource = useCallback(async () => {
    const collectionsList = collectionsRef.current;
    const environmentsList = environmentsRef.current;
    if (collectionsList.length === 0 && environmentsList.length === 0) {
      return;
    }

    const active = activeTabRef.current;
    let saveEnvironment: LoadedEnvironment | undefined;
    let saveCollection: LoadedCollection | undefined;

    if (active?.kind === 'environment') {
      saveEnvironment = environmentsList.find(
        (entry) => entry.filePath === active.environmentPath
      );
    } else if (active) {
      saveCollection = collectionsList.find(
        (entry) => entry.filePath === active.collectionPath
      );
    }

    if (!saveEnvironment && !saveCollection) {
      saveEnvironment = environmentsList.find((entry) =>
        isEnvironmentDirty(entry.environment, entry.originalRaw)
      );
      saveCollection = collectionsList.find((entry) =>
        isCollectionDirty(uiByPathRef.current[entry.filePath] ?? EMPTY_UI)
      );
    }

    if (!saveEnvironment && !saveCollection) {
      saveEnvironment = environmentsList[0];
      saveCollection = collectionsList[0];
    }

    // Prefer the kind matching the active tab when both somehow resolve.
    if (active?.kind === 'environment' && saveEnvironment) {
      saveCollection = undefined;
    } else if (active && active.kind !== 'environment' && saveCollection) {
      saveEnvironment = undefined;
    } else if (saveEnvironment && saveCollection) {
      // Active tab unclear — prefer first dirty; environments checked first above when no active match.
      saveCollection = undefined;
    }

    setStatus({ kind: 'idle' });
    try {
      if (saveEnvironment) {
        const hasDirty = isEnvironmentDirty(
          saveEnvironment.environment,
          saveEnvironment.originalRaw
        );
        const contents = hasDirty
          ? serializeEnvironment(saveEnvironment.environment)
          : saveEnvironment.originalRaw;
        await window.clara.saveEnvironment(saveEnvironment.filePath, contents);
        setEnvironments((current) =>
          current.map((entry) =>
            entry.filePath === saveEnvironment.filePath
              ? { ...entry, originalRaw: contents }
              : entry
          )
        );
        setStatus({ kind: 'ok', message: `Saved ${saveEnvironment.filePath}` });
        return;
      }

      if (!saveCollection) {
        return;
      }

      const hasDirty = isCollectionDirty(
        uiByPathRef.current[saveCollection.filePath] ?? EMPTY_UI
      );
      const contents = hasDirty
        ? serializeCollection(saveCollection.collection)
        : saveCollection.originalRaw;

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
      setStatus({ kind: 'ok', message: `Saved ${saveCollection.filePath}` });
    } catch (error) {
      setStatus({ kind: 'error', message: errorMessage(error) });
    }
  }, []);

  const runSingleRequest = useCallback(async (collectionPath: string, path: ItemPath) => {
    const entry = collectionsRef.current.find(
      (candidate) => candidate.filePath === collectionPath
    );
    if (!entry || sendingRef.current) {
      return;
    }

    const key = tabKey({ kind: 'request', collectionPath, path });
    setSending(true);
    setRunningKey(key);
    setStatus({ kind: 'idle' });
    try {
      const runCollection = buildSingleRequestCollection(entry.collection, path);
      const environmentJson = activeEnvironmentJson();
      const result = await window.clara.runNewman(serializeCollection(runCollection), {
        ...(environmentJson ? { environmentJson } : {})
      });
      setRequestRuns((runs) => ({ ...runs, [requestRunKey(collectionPath, path)]: result }));
      const code = result.execution?.code;
      const unsaved = uiByPathRef.current[collectionPath]?.dirtyPaths.has(path) ?? false;
      setStatus({
        kind: result.error && !result.execution ? 'error' : 'ok',
        message: result.execution
          ? `Newman ${code ?? '—'} ${result.execution.status}${
              unsaved ? ' · unsaved edits' : ''
            }`.trim()
          : result.error ?? 'Newman finished'
      });
    } catch (error) {
      setStatus({ kind: 'error', message: errorMessage(error) });
    } finally {
      setSending(false);
      setRunningKey(null);
    }
  }, [activeEnvironmentJson]);

  const sendRequest = useCallback(async () => {
    const tab = activeTabRef.current;
    if (!tab || tab.kind !== 'request') {
      return;
    }
    await runSingleRequest(tab.collectionPath, tab.path);
  }, [runSingleRequest]);

  const runScope = useCallback(async (tab: WorkspaceTab) => {
    if (tab.kind !== 'collection' && tab.kind !== 'folder') {
      return;
    }
    const entry = collectionsRef.current.find(
      (candidate) => candidate.filePath === tab.collectionPath
    );
    if (!entry || runningKeyRef.current) {
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
  }, [activeEnvironmentJson]);

  const openRequestTab = useCallback(
    (collectionPath: string, path: ItemPath) => {
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
      openTab({ kind: 'request', collectionPath, path });
    },
    [openTab]
  );

  const openFolderTab = useCallback(
    (collectionPath: string, path: ItemPath) => {
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
      openTab({ kind: 'folder', collectionPath, path });
      updateUi(collectionPath, (ui) =>
        ui.expanded.has(path)
          ? ui
          : { ...ui, expanded: new Set(ui.expanded).add(path) }
      );
    },
    [openTab, updateUi]
  );

  const isTabDirty = useCallback((tab: WorkspaceTab): boolean => {
    if (tab.kind === 'environment') {
      const entry = environmentsRef.current.find(
        (candidate) => candidate.filePath === tab.environmentPath
      );
      return entry ? isEnvironmentDirty(entry.environment, entry.originalRaw) : false;
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
  }, [refreshCompare]);

  const collectionPathsKey = collections.map((entry) => entry.filePath).join('\u0000');
  const environmentPathsKey = environments.map((entry) => entry.filePath).join('\u0000');

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
        openTabs: openTabs.map(toSessionTab),
        activeTabKey: activeTab ? tabKey(activeTab) : null,
        openedEnvironments: environmentsRef.current.map((entry) => entry.filePath),
        activeEnvironmentPath: activeEnvironmentPathRef.current,
        sidebar: sidebarRef.current
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
    sidebar
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
      setCollections((list) =>
        list.map((candidate) =>
          candidate.filePath === entry.filePath
            ? { ...candidate, collection: result.collection }
            : candidate
        )
      );
      syncDirty(entry.filePath, result.collection, entry.originalRaw);
      const parentPath = parent;
      updateUi(entry.filePath, (ui) => ({
        ...ui,
        expanded: parentPath ? new Set(ui.expanded).add(parentPath) : ui.expanded,
        collectionExpanded: true
      }));
      openTab({
        kind: 'request',
        collectionPath: entry.filePath,
        path: result.newPath
      });
    },
    [openTab, syncDirty, updateUi]
  );

  useEffect(() => {
    return window.clara.onCommand((command: AppCommand) => {
      switch (command.type) {
        case 'open':
          void openCollection();
          break;
        case 'open-environment':
          void openEnvironment();
          break;
        case 'save':
          void saveActiveResource();
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
    openEnvironment,
    saveActiveResource,
    sendRequest,
    closeTab,
    createNewRequestNear,
    cycleTab,
    selectTabAt
  ]);

  const editSelectedItem = (updater: (item: PostmanItem) => PostmanItem) => {
    if (!activeCollection || !activeRequestPath) {
      return;
    }

    try {
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

  const remapTabsAfterDelete = (collectionPath: string, deleted: ItemPath) => {
    const remap = (tab: WorkspaceTab): WorkspaceTab | null => {
      if (tab.kind === 'environment' || tab.collectionPath !== collectionPath || tab.kind === 'collection') {
        return tab;
      }
      const nextPath = remapPathAfterDelete(tab.path, deleted);
      if (nextPath == null) {
        return null;
      }
      return { ...tab, path: nextPath };
    };

    setOpenTabs((current) => current.flatMap((tab) => remap(tab) ?? []));
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

  const renameTarget = (target: TreeTarget | CollectionTarget) => {
    const entry = collections.find(
      (candidate) => candidate.filePath === target.collectionPath
    );
    if (!entry) {
      return;
    }
    if (target.kind === 'collection') {
      const current = entry.collection.info?.name ?? '';
      const next = window.prompt('Rename collection', current);
      if (next == null || next.trim() === '' || next === current) {
        return;
      }
      applyCollectionUpdate(
        entry.filePath,
        renameCollection(entry.collection, next.trim())
      );
      return;
    }
    const item = getItemByPath(entry.collection.item, target.path);
    if (!item) {
      return;
    }
    const current = item.name ?? '';
    const next = window.prompt(
      target.kind === 'folder' ? 'Rename folder' : 'Rename request',
      current
    );
    if (next == null || next.trim() === '' || next === current) {
      return;
    }
    applyCollectionUpdate(
      entry.filePath,
      renameItem(entry.collection, target.path, next.trim())
    );
  };

  const deleteTarget = (target: TreeTarget | CollectionTarget) => {
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
    if (!window.confirm(`Delete "${label}"?`)) {
      return;
    }
    applyCollectionUpdate(entry.filePath, deleteItem(entry.collection, target.path));
    remapTabsAfterDelete(entry.filePath, target.path);
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
    openTab({ kind: 'request', collectionPath, path: target.path });
    void runSingleRequest(collectionPath, target.path);
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
    if (target.kind === 'collection') {
      return [
        { id: 'run', label: 'Run collection' },
        { id: 'rename', label: 'Rename' },
        { id: 'expand-all', label: 'Expand all', separatorBefore: true },
        { id: 'collapse-all', label: 'Collapse all' },
        { id: 'delete', label: 'Close', danger: true, separatorBefore: true }
      ];
    }
    return [
      { id: 'run', label: target.kind === 'folder' ? 'Run folder' : 'Run' },
      { id: 'rename', label: 'Rename' },
      { id: 'duplicate', label: 'Duplicate' },
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
  };

  const renameEnvironmentTarget = (environmentPath: string) => {
    const entry = environments.find((candidate) => candidate.filePath === environmentPath);
    if (!entry) {
      return;
    }
    const current = entry.environment.name ?? '';
    const next = window.prompt('Rename environment', current);
    if (next == null || next.trim() === '' || next === current) {
      return;
    }
    applyEnvironmentUpdate(environmentPath, renameEnvironment(entry.environment, next.trim()));
  };

  const handleContextAction = (id: string) => {
    if (!contextMenu) {
      return;
    }
    const { target } = contextMenu;
    if (target.kind === 'tab') {
      if (id === 'new-request') {
        createNewRequestNear(target.tab);
      } else if (
        id === 'duplicate-tab' &&
        target.tab.kind !== 'collection' &&
        target.tab.kind !== 'environment'
      ) {
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
      }
      return;
    }
    if (target.kind === 'environment') {
      if (id === 'set-active-environment') {
        setActiveEnvironmentPath(target.environmentPath);
      } else if (id === 'clear-active-environment') {
        setActiveEnvironmentPath(null);
      } else if (id === 'rename') {
        renameEnvironmentTarget(target.environmentPath);
      } else if (id === 'delete') {
        closeEnvironment(target.environmentPath);
      }
      return;
    }
    if (id === 'run') {
      runTarget(target);
    } else if (id === 'rename') {
      renameTarget(target);
    } else if (id === 'delete') {
      deleteTarget(target);
    } else if (id === 'duplicate' && target.kind !== 'collection') {
      duplicateTarget(target);
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

  const toggleFolder = (collectionPath: string, path: ItemPath) => {
    updateUi(collectionPath, (ui) => {
      const expanded = new Set(ui.expanded);
      if (expanded.has(path)) {
        expanded.delete(path);
      } else {
        expanded.add(path);
      }
      return { ...ui, expanded };
    });
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
          <button type="button" onClick={() => void openCollection()} title="⌘O / Ctrl+O">
            Open
          </button>
          <button
            type="button"
            className={anyDirty ? 'save-dirty' : ''}
            disabled={!hasResources}
            onClick={() => void saveActiveResource()}
            title="⌘S / Ctrl+S"
          >
            Save
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
            <button type="button" className="primary" onClick={() => void openCollection()}>
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
                  className={`sidebar-changed-only ${sidebar.changedOnly ? 'is-active' : ''}`}
                  aria-label={
                    sidebar.changedOnly
                      ? 'Show all collection items'
                      : 'Show only changed items vs base branch'
                  }
                  aria-pressed={sidebar.changedOnly}
                  title={
                    sidebar.changedOnly ? 'Changed only (on)' : 'Changed only'
                  }
                  onClick={() =>
                    setSidebar((current) => ({
                      ...current,
                      changedOnly: !current.changedOnly
                    }))
                  }
                >
                  Δ
                </button>
                <button
                  type="button"
                  className="sidebar-add"
                  aria-label="Open collection"
                  title="Open collection"
                  onClick={() => void openCollection()}
                >
                  +
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
                      activeTab &&
                      activeTab.kind !== 'environment' &&
                      activeTab.collectionPath === entry.filePath &&
                      (activeTab.kind === 'request' || activeTab.kind === 'folder')
                        ? activeTab.path
                        : null;
                    const collectionExpanded = ui.collectionExpanded;
                    const compare = compareByPath[entry.filePath];
                    const compareCue = compare
                      ? `vs ${compare.baseRef} · ${compare.diff.changedCount} changed`
                      : null;

                    return [
                      <div className="sidebar-collection" key={entry.filePath}>
                        <div
                          className={`collection-heading ${headingSelected ? 'selected' : ''} ${
                            collectionExpanded ? 'expanded' : 'collapsed'
                          }`}
                          data-sidebar-key={tabKey({
                            kind: 'collection',
                            collectionPath: entry.filePath
                          })}
                          onContextMenu={(event) => openContextMenu(event, target)}
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
                              updateUi(entry.filePath, (current) => ({
                                ...current,
                                collectionExpanded: !current.collectionExpanded
                              }));
                            }}
                          >
                            <span className="collection-chevron" aria-hidden>
                              {collectionExpanded ? '▾' : '▸'}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="collection-heading-select"
                            onClick={() =>
                              openTab({
                                kind: 'collection',
                                collectionPath: entry.filePath
                              })
                            }
                            title={entry.filePath}
                          >
                            <span className="collection-icon" aria-hidden>
                              ◇
                            </span>
                            <div>
                              <strong>{collectionName}</strong>
                              <span>
                                {counts.folders} folders · {counts.requests} requests
                              </span>
                              {compareCue ? (
                                <span className="collection-compare-cue">{compareCue}</span>
                              ) : null}
                            </div>
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
                            onSelectFolder={(path) => openFolderTab(entry.filePath, path)}
                            onSelectRequest={(path) =>
                              openRequestTab(entry.filePath, path)
                            }
                            onContextMenu={(event, treeTarget) =>
                              openContextMenu(event, treeTarget)
                            }
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

            <div className="sidebar-section sidebar-section-environments">
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
                  onClick={() =>
                    setSidebar((current) => ({
                      ...current,
                      environmentsExpanded: !current.environmentsExpanded
                    }))
                  }
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
                  aria-label="Open environment"
                  title="Open environment"
                  onClick={() => void openEnvironment()}
                >
                  +
                </button>
              </div>

              {environmentsSectionOpen
                ? environments.flatMap((entry) => {
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
                          onClick={() =>
                            openTab({
                              kind: 'environment',
                              environmentPath: entry.filePath
                            })
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
                  })
                : null}
              {environmentsSectionOpen &&
              isSearching &&
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
              onDropRequest={openRequestTab}
              onReorder={reorderTabs}
              onContextMenu={(event, tab) =>
                openContextMenu(event, { kind: 'tab', tab })
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

              {activeTab?.kind === 'collection' && activeCollection && activeCounts && (
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
                  variablesSlot={
                    <VariablesPane
                      scopeLabel="collection"
                      variables={getCollectionVariables(activeCollection.collection)}
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

              {activeTab?.kind === 'folder' && activeFolder && isFolder(activeFolder) && (
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
                  variablesSlot={
                    <VariablesPane
                      scopeLabel="folder"
                      variables={getItemVariables(activeFolder)}
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

              {activeTab?.kind === 'request' &&
                !(activeRequestPath && selectedItem && selectedRequest) && (
                  <div className="empty-state">
                    <span className="empty-state-icon" aria-hidden>
                      ↖
                    </span>
                    <h2>Select a request</h2>
                    <p>Choose a request from the collection tree to start editing.</p>
                  </div>
                )}

              {activeTab?.kind === 'request' &&
                activeRequestPath &&
                selectedItem &&
                selectedRequest && (
                  <div className="detail-split">
                    <div className="detail-request">
                      <RequestPane
                        key={tabKey(activeTab)}
                        item={selectedItem}
                        request={selectedRequest}
                        path={activeRequestPath}
                        semanticDiff={requestSemanticDiff}
                        compareBaseRef={activeCompare?.baseRef ?? null}
                        onChangeMethod={(method) =>
                          editSelectedItem((item) => setRequestMethod(item, method))
                        }
                        onChangeUrl={(raw) =>
                          editSelectedItem((item) => setRequestUrl(item, raw))
                        }
                        onPromoteUrlToObject={() =>
                          editSelectedItem((item) => promoteRequestUrlToObject(item))
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
                        sending={sending}
                      />
                    </div>
                    <div className="detail-response">
                      <ResponsePane
                        result={
                          requestRuns[
                            requestRunKey(activeTab.collectionPath, activeRequestPath)
                          ] ?? null
                        }
                        running={sending && runningKey === tabKey(activeTab)}
                      />
                    </div>
                  </div>
                )}
            </main>
          </section>
        </div>
      )}

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
        {statusbarEnvironment ? (
          <>
            <span className="statusbar-spacer" />
            <span title={statusbarEnvironment.filePath}>
              env: {statusbarEnvironment.environment.name?.trim() || fileName(statusbarEnvironment.filePath)}
              {activeEnvironmentPath === statusbarEnvironment.filePath ? ' · active' : ''}
            </span>
          </>
        ) : null}
        {statusbarCollection ? (
          <>
            <span className="statusbar-spacer" />
            <span title={statusbarCollection.filePath}>
              {fileName(statusbarCollection.filePath)}
            </span>
            <span>Postman v2.1</span>
          </>
        ) : null}
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
    </div>
  );
}
