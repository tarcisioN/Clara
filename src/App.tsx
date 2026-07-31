import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppCommand } from '../electron/commands.ts';
import CollectionTree, { type TreeTarget } from './components/CollectionTree.tsx';
import CollectionRunPane from './components/CollectionRunPane.tsx';
import ContextMenu, { type ContextMenuItem } from './components/ContextMenu.tsx';
import RequestPane from './components/RequestPane.tsx';
import RequestTabs, { type WorkspaceTabView } from './components/RequestTabs.tsx';
import ResponsePane from './components/ResponsePane.tsx';
import VariablesPane from './components/VariablesPane.tsx';
import { buildSingleRequestCollection } from './newman/buildRunCollection.ts';
import type { NewmanRunView } from './newman/parseResult.ts';
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
import './App.css';

type LoadedCollection = {
  filePath: string;
  /** Original file bytes as text — used for dirty-free save. */
  originalRaw: string;
  collection: PostmanCollection;
};

type CollectionTarget = { kind: 'collection'; collectionPath: string };
type ContextTarget = TreeTarget | CollectionTarget | { kind: 'tab'; tab: WorkspaceTab };

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

/** Keep only the tabs that belong to `collectionPath` and still point at a live item. */
function filterValidTabs(
  collectionPath: string,
  items: PostmanItem[] | undefined,
  tabs: WorkspaceTab[]
): WorkspaceTab[] {
  return tabs.filter((tab) => {
    if (tab.collectionPath !== collectionPath) {
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
  const [uiByPath, setUiByPath] = useState<Record<string, CollectionUiState>>({});
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [openTabs, setOpenTabs] = useState<WorkspaceTab[]>([]);
  const [activeTab, setActiveTab] = useState<WorkspaceTab | null>(null);
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
  const uiByPathRef = useRef(uiByPath);
  const openTabsRef = useRef(openTabs);
  const activeTabRef = useRef(activeTab);
  const sendingRef = useRef(sending);
  const runningKeyRef = useRef(runningKey);
  collectionsRef.current = collections;
  uiByPathRef.current = uiByPath;
  openTabsRef.current = openTabs;
  activeTabRef.current = activeTab;
  sendingRef.current = sending;
  runningKeyRef.current = runningKey;

  const anyDirty = collections.some((entry) =>
    isCollectionDirty(uiByPath[entry.filePath] ?? EMPTY_UI)
  );

  const activeCollection =
    collections.find((entry) => entry.filePath === activeTab?.collectionPath) ?? null;

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
  }, [collections, uiByPath, openTabs]);

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

  const activeFolder =
    activeTab?.kind === 'folder' && activeCollection
      ? getItemByPath(activeCollection.collection.item, activeTab.path)
      : null;

  const updateUi = useCallback(
    (collectionPath: string, updater: (ui: CollectionUiState) => CollectionUiState) => {
      setUiByPath((current) => ({
        ...current,
        [collectionPath]: updater(current[collectionPath] ?? createCollectionUiState())
      }));
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
    },
    [syncDirty, updateUi]
  );

  const openTab = useCallback((tab: WorkspaceTab) => {
    setOpenTabs((current) =>
      current.some((entry) => sameTab(entry, tab)) ? current : [...current, tab]
    );
    setActiveTab(tab);
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
          openTab({ kind: 'collection', collectionPath: file.filePath });
          opened.push(collection.info?.name ?? fileName(file.filePath));
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
  }, [openTab]);

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

    const remaining = openTabsRef.current.filter(
      (tab) => tab.collectionPath !== collectionPath
    );
    setOpenTabs(remaining);
    setActiveTab((active) =>
      active && active.collectionPath === collectionPath ? (remaining[0] ?? null) : active
    );

    const runPrefix = requestRunKey(collectionPath, '');
    setRequestRuns((runs) =>
      Object.fromEntries(Object.entries(runs).filter(([key]) => !key.startsWith(runPrefix)))
    );
    setScopeRuns((runs) =>
      Object.fromEntries(
        Object.entries(runs).filter(
          ([key]) => parseTabKey(key)?.collectionPath !== collectionPath
        )
      )
    );
    setContextMenu(null);
    setStatus({ kind: 'ok', message: `Closed ${fileName(collectionPath)}` });
  }, []);

  /** Save the collection behind the active tab; fall back to the first dirty one. */
  const saveCollection = useCallback(async () => {
    const list = collectionsRef.current;
    if (list.length === 0) {
      return;
    }
    const activePath = activeTabRef.current?.collectionPath;
    const target =
      (activePath ? list.find((entry) => entry.filePath === activePath) : undefined) ??
      list.find((entry) =>
        isCollectionDirty(uiByPathRef.current[entry.filePath] ?? EMPTY_UI)
      ) ??
      list[0];
    if (!target) {
      return;
    }

    setStatus({ kind: 'idle' });
    try {
      const hasDirty = isCollectionDirty(uiByPathRef.current[target.filePath] ?? EMPTY_UI);
      const contents = hasDirty
        ? serializeCollection(target.collection)
        : target.originalRaw;

      await window.clara.saveCollection(target.filePath, contents);
      setCollections((current) =>
        current.map((entry) =>
          entry.filePath === target.filePath ? { ...entry, originalRaw: contents } : entry
        )
      );
      setUiByPath((current) => ({
        ...current,
        [target.filePath]: clearCollectionDirty(
          current[target.filePath] ?? createCollectionUiState()
        )
      }));
      setStatus({ kind: 'ok', message: `Saved ${target.filePath}` });
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
      const result = await window.clara.runNewman(serializeCollection(runCollection));
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
  }, []);

  const sendRequest = useCallback(async () => {
    const tab = activeTabRef.current;
    if (!tab || tab.kind !== 'request') {
      return;
    }
    await runSingleRequest(tab.collectionPath, tab.path);
  }, [runSingleRequest]);

  const runScope = useCallback(async (tab: WorkspaceTab) => {
    const entry = collectionsRef.current.find(
      (candidate) => candidate.filePath === tab.collectionPath
    );
    if (!entry || runningKeyRef.current) {
      return;
    }
    if (tab.kind !== 'collection' && tab.kind !== 'folder') {
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
      const result = await window.clara.runNewman(
        serializeCollection(entry.collection),
        folderName ? { folder: folderName } : undefined
      );
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
  }, []);

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

        const entries = session.collections ?? [];
        if (entries.length === 0) {
          return;
        }

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

        if (cancelled) {
          return;
        }

        const sessionTabs = (session.openTabs ?? []).map(fromSessionTab);
        const validKeys = new Set(
          restored.flatMap((entry) =>
            filterValidTabs(entry.filePath, entry.collection.item, sessionTabs).map(tabKey)
          )
        );
        const restoredTabs = sessionTabs.filter((tab) => validKeys.has(tabKey(tab)));
        const restoredActive =
          session.activeTabKey != null ? parseTabKey(session.activeTabKey) : null;
        const active =
          restoredActive && restoredTabs.some((tab) => sameTab(tab, restoredActive))
            ? restoredActive
            : (restoredTabs[0] ?? null);

        setCollections(restored);
        setUiByPath(restoredUi);
        setOpenTabs(restoredTabs);
        setActiveTab(active);

        if (failures.length > 0) {
          setStatus({
            kind: 'error',
            message: `Could not restore ${failures.length} collection${
              failures.length === 1 ? '' : 's'
            }: ${failures.join('; ')}`
          });
        } else {
          setStatus({
            kind: 'ok',
            message: `Restored ${restored.length} collection${
              restored.length === 1 ? '' : 's'
            }`
          });
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
  }, []);

  const collectionPathsKey = collections.map((entry) => entry.filePath).join('\u0000');

  useEffect(() => {
    if (!sessionHydrated) {
      return;
    }

    const handle = window.setTimeout(() => {
      void window.clara.saveSession({
        version: 3,
        collections: collectionsRef.current.map((entry) => {
          const ui = uiByPathRef.current[entry.filePath] ?? EMPTY_UI;
          return {
            path: entry.filePath,
            expandedPaths: [...ui.expanded],
            collectionExpanded: ui.collectionExpanded
          };
        }),
        openTabs: openTabs.map(toSessionTab),
        activeTabKey: activeTab ? tabKey(activeTab) : null
      });
    }, 250);

    return () => window.clearTimeout(handle);
  }, [sessionHydrated, collectionPathsKey, uiByPath, openTabs, activeTab]);

  const createNewRequestNear = useCallback(
    (tab: WorkspaceTab) => {
      const entry = collectionsRef.current.find(
        (candidate) => candidate.filePath === tab.collectionPath
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
        case 'save':
          void saveCollection();
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
    saveCollection,
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
      if (tab.collectionPath !== collectionPath || tab.kind === 'collection') {
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
      if (tab.collectionPath !== collectionPath || tab.kind === 'collection') {
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
          disabled: target.tab.kind === 'collection'
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

  const revealInSidebar = (tab: WorkspaceTab) => {
    if (tab.kind === 'collection') {
      updateUi(tab.collectionPath, (ui) => ({ ...ui, collectionExpanded: true }));
      setActiveTab(tab);
      return;
    }
    const indexes = tab.path.split('.');
    updateUi(tab.collectionPath, (ui) => {
      const expanded = new Set(ui.expanded);
      for (let depth = 1; depth < indexes.length; depth += 1) {
        expanded.add(indexes.slice(0, depth).join('.'));
      }
      if (tab.kind === 'folder') {
        expanded.add(tab.path);
      }
      return { ...ui, expanded, collectionExpanded: true };
    });
    setActiveTab(tab);
  };

  const handleContextAction = (id: string) => {
    if (!contextMenu) {
      return;
    }
    const { target } = contextMenu;
    if (target.kind === 'tab') {
      if (id === 'new-request') {
        createNewRequestNear(target.tab);
      } else if (id === 'duplicate-tab' && target.tab.kind !== 'collection') {
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
    activeCollection?.collection.info?.name ??
    (collections.length === 0
      ? 'Postman collection editor'
      : collections.length === 1
        ? (collections[0]?.collection.info?.name ?? 'Untitled collection')
        : `${collections.length} collections`);

  const statusbarCollection = activeCollection ?? collections[0] ?? null;

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
            disabled={collections.length === 0}
            onClick={() => void saveCollection()}
            title="⌘S / Ctrl+S"
          >
            Save
          </button>
        </div>
      </header>

      {collections.length === 0 && (
        <main className="welcome">
          <div className="welcome-mark" aria-hidden>
            C
          </div>
          <h1>Open a Postman collection</h1>
          <p>Edit the JSON in your repository directly. No import or export cycle.</p>
          <button type="button" className="primary" onClick={() => void openCollection()}>
            Open collection
          </button>
          {sessionHome ? (
            <p className="welcome-session">Session data: {sessionHome}</p>
          ) : null}
        </main>
      )}

      {collections.length > 0 && (
        <div className="workspace">
          <aside className="sidebar">
            <div className="sidebar-section-title">
              <span className="sidebar-chevron" aria-hidden>
                ⌄
              </span>
              <strong>Collections</strong>
              <span className="sidebar-count">{totalRequests}</span>
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

            {collections.map((entry) => {
              const ui = uiByPath[entry.filePath] ?? EMPTY_UI;
              const counts = countsByPath[entry.filePath] ?? { folders: 0, requests: 0 };
              const target: CollectionTarget = {
                kind: 'collection',
                collectionPath: entry.filePath
              };
              const headingSelected =
                activeTab?.kind === 'collection' &&
                activeTab.collectionPath === entry.filePath;
              const treeSelectedPath =
                activeTab &&
                activeTab.collectionPath === entry.filePath &&
                (activeTab.kind === 'request' || activeTab.kind === 'folder')
                  ? activeTab.path
                  : null;

              return (
                <div className="sidebar-collection" key={entry.filePath}>
                  <div
                    className={`collection-heading ${headingSelected ? 'selected' : ''} ${
                      ui.collectionExpanded ? 'expanded' : 'collapsed'
                    }`}
                    onContextMenu={(event) => openContextMenu(event, target)}
                  >
                    <button
                      type="button"
                      className="collection-chevron-button"
                      aria-label={
                        ui.collectionExpanded ? 'Collapse collection' : 'Expand collection'
                      }
                      aria-expanded={ui.collectionExpanded}
                      onClick={(event) => {
                        event.stopPropagation();
                        updateUi(entry.filePath, (current) => ({
                          ...current,
                          collectionExpanded: !current.collectionExpanded
                        }));
                      }}
                    >
                      <span className="collection-chevron" aria-hidden>
                        {ui.collectionExpanded ? '▾' : '▸'}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="collection-heading-select"
                      onClick={() =>
                        openTab({ kind: 'collection', collectionPath: entry.filePath })
                      }
                      title={entry.filePath}
                    >
                      <span className="collection-icon" aria-hidden>
                        ◇
                      </span>
                      <div>
                        <strong>
                          {entry.collection.info?.name ?? 'Untitled collection'}
                        </strong>
                        <span>
                          {counts.folders} folders · {counts.requests} requests
                        </span>
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
                  {ui.collectionExpanded ? (
                    <CollectionTree
                      collectionPath={entry.filePath}
                      items={entry.collection.item}
                      expanded={ui.expanded}
                      selectedPath={treeSelectedPath}
                      onToggleFolder={(path) => toggleFolder(entry.filePath, path)}
                      onSelectFolder={(path) => openFolderTab(entry.filePath, path)}
                      onSelectRequest={(path) => openRequestTab(entry.filePath, path)}
                      onContextMenu={(event, treeTarget) =>
                        openContextMenu(event, treeTarget)
                      }
                    />
                  ) : null}
                </div>
              );
            })}
          </aside>

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
                  <h2>Select a collection, folder, or request</h2>
                  <p>Open a tab from the sidebar to edit or run.</p>
                </div>
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
            ? collections.length > 0
              ? anyDirty
                ? 'Unsaved changes'
                : 'Ready'
              : 'No collection open'
            : status.message}
        </span>
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
