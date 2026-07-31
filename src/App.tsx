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
  sameTab,
  tabKey,
  toSessionTab,
  type WorkspaceTab
} from './workspace/tabs.ts';
import { computeDirtyState } from './workspace/dirty.ts';
import './App.css';

type LoadedCollection = {
  filePath: string;
  /** Original file bytes as text — used for dirty-free save. */
  originalRaw: string;
  collection: PostmanCollection;
};

type Status = { kind: 'idle' } | { kind: 'ok'; message: string } | { kind: 'error'; message: string };

function fileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

function filterValidTabs(
  items: PostmanItem[] | undefined,
  tabs: WorkspaceTab[]
): WorkspaceTab[] {
  return tabs.filter((tab) => {
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
  const [loaded, setLoaded] = useState<LoadedCollection | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [expanded, setExpanded] = useState<Set<ItemPath>>(new Set());
  const [openTabs, setOpenTabs] = useState<WorkspaceTab[]>([]);
  const [activeTab, setActiveTab] = useState<WorkspaceTab | null>(null);
  const [dirtyPaths, setDirtyPaths] = useState<Set<ItemPath>>(new Set());
  const [dirtyFolderPaths, setDirtyFolderPaths] = useState<Set<ItemPath>>(new Set());
  const [collectionDirty, setCollectionDirty] = useState(false);
  const [structureDirty, setStructureDirty] = useState(false);
  const [collectionExpanded, setCollectionExpanded] = useState(true);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [sessionHome, setSessionHome] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [requestRuns, setRequestRuns] = useState<Record<string, NewmanRunView>>({});
  const [scopeRuns, setScopeRuns] = useState<Record<string, NewmanRunView>>({});
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target:
      | TreeTarget
      | { kind: 'collection' }
      | { kind: 'tab'; tab: WorkspaceTab };
  } | null>(null);

  const dirty =
    dirtyPaths.size > 0 ||
    dirtyFolderPaths.size > 0 ||
    collectionDirty ||
    structureDirty;

  const loadedRef = useRef(loaded);
  const openTabsRef = useRef(openTabs);
  const activeTabRef = useRef(activeTab);
  const dirtyPathsRef = useRef(dirtyPaths);
  const dirtyFolderPathsRef = useRef(dirtyFolderPaths);
  const collectionDirtyRef = useRef(collectionDirty);
  const structureDirtyRef = useRef(structureDirty);
  loadedRef.current = loaded;
  openTabsRef.current = openTabs;
  activeTabRef.current = activeTab;
  dirtyPathsRef.current = dirtyPaths;
  dirtyFolderPathsRef.current = dirtyFolderPaths;
  collectionDirtyRef.current = collectionDirty;
  structureDirtyRef.current = structureDirty;

  const counts = useMemo(
    () => (loaded ? countItems(loaded.collection.item) : null),
    [loaded]
  );

  const tabs = useMemo<WorkspaceTabView[]>(() => {
    if (!loaded) {
      return [];
    }
    return openTabs.flatMap((tab): WorkspaceTabView[] => {
      if (tab.kind === 'collection') {
        return [
          {
            tab,
            name: loaded.collection.info?.name?.trim() || 'Collection',
            badge: 'COL',
            badgeClass: 'badge-collection',
            dirty: collectionDirty || structureDirty
          }
        ];
      }
      const item = getItemByPath(loaded.collection.item, tab.path);
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
            dirty: dirtyFolderPaths.has(tab.path)
          }
        ];
      }
      const request = getRequestByPath(loaded.collection.item, tab.path);
      if (!request || !isRequest(item)) {
        return [];
      }
      return [
        {
          tab,
          name: item.name?.trim() || 'Untitled request',
          badge: (request.method ?? 'GET').toUpperCase(),
          badgeClass: `method-${(request.method ?? 'GET').toLowerCase()}`,
          dirty: dirtyPaths.has(tab.path)
        }
      ];
    });
  }, [loaded, openTabs, dirtyPaths, dirtyFolderPaths, collectionDirty, structureDirty]);

  const activeRequestPath =
    activeTab?.kind === 'request' ? activeTab.path : null;

  const selectedItem = useMemo(() => {
    if (!loaded || !activeRequestPath) {
      return null;
    }
    return getItemByPath(loaded.collection.item, activeRequestPath) ?? null;
  }, [loaded, activeRequestPath]);

  const selectedRequest = useMemo(() => {
    if (!loaded || !activeRequestPath) {
      return null;
    }
    return getRequestByPath(loaded.collection.item, activeRequestPath) ?? null;
  }, [loaded, activeRequestPath]);

  const activeFolder =
    activeTab?.kind === 'folder' && loaded
      ? getItemByPath(loaded.collection.item, activeTab.path)
      : null;

  const resetWorkspace = () => {
    setOpenTabs([]);
    setActiveTab(null);
    setDirtyPaths(new Set());
    setDirtyFolderPaths(new Set());
    setCollectionDirty(false);
    setStructureDirty(false);
    setRequestRuns({});
    setScopeRuns({});
    setRunningKey(null);
    setContextMenu(null);
  };

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
      if (result.canceled) {
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(result.raw);
      } catch {
        throw new Error('File is not valid JSON');
      }

      const collection = assertPostmanCollection(parsed);
      setLoaded({
        filePath: result.filePath,
        originalRaw: result.raw,
        collection
      });
      setExpanded(collectFolderPaths(collection.item));
      resetWorkspace();
      openTab({ kind: 'collection' });
      setStatus({
        kind: 'ok',
        message: `Opened ${collection.info?.name ?? 'collection'}`
      });
    } catch (error) {
      setLoaded(null);
      setExpanded(new Set());
      resetWorkspace();
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }, [openTab]);

  const saveCollection = useCallback(async () => {
    const current = loadedRef.current;
    if (!current) {
      return;
    }

    setStatus({ kind: 'idle' });
    try {
      const hasDirty =
        dirtyPathsRef.current.size > 0 ||
        dirtyFolderPathsRef.current.size > 0 ||
        collectionDirtyRef.current ||
        structureDirtyRef.current;
      const contents = hasDirty
        ? serializeCollection(current.collection)
        : current.originalRaw;

      await window.clara.saveCollection(current.filePath, contents);
      setLoaded({ ...current, originalRaw: contents });
      setDirtyPaths(new Set());
      setDirtyFolderPaths(new Set());
      setCollectionDirty(false);
      setStructureDirty(false);
      setStatus({ kind: 'ok', message: `Saved ${current.filePath}` });
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }, []);

  const sendRequest = useCallback(async () => {
    const current = loadedRef.current;
    const tab = activeTabRef.current;
    if (!current || !tab || tab.kind !== 'request' || sending) {
      return;
    }

    const path = tab.path;
    const key = tabKey(tab);
    setSending(true);
    setRunningKey(key);
    setStatus({ kind: 'idle' });
    try {
      const runCollection = buildSingleRequestCollection(current.collection, path);
      const result = await window.clara.runNewman(serializeCollection(runCollection));
      setRequestRuns((runs) => ({ ...runs, [path]: result }));
      const code = result.execution?.code;
      const unsaved = dirtyPathsRef.current.has(path);
      setStatus({
        kind: result.error && !result.execution ? 'error' : 'ok',
        message: result.execution
          ? `Newman ${code ?? '—'} ${result.execution.status}${
              unsaved ? ' · unsaved edits' : ''
            }`.trim()
          : result.error ?? 'Newman finished'
      });
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setSending(false);
      setRunningKey(null);
    }
  }, [sending]);

  const runScope = useCallback(
    async (tab: WorkspaceTab) => {
      const current = loadedRef.current;
      if (!current || runningKey) {
        return;
      }
      if (tab.kind !== 'collection' && tab.kind !== 'folder') {
        return;
      }

      const key = tabKey(tab);
      let folderName: string | undefined;
      if (tab.kind === 'folder') {
        const folder = getItemByPath(current.collection.item, tab.path);
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
          serializeCollection(current.collection),
          folderName ? { folder: folderName } : undefined
        );
        setScopeRuns((runs) => ({ ...runs, [key]: result }));
        const total = result.executions.length;
        const failed = result.failures.length;
        setStatus({
          kind: result.error && total === 0 ? 'error' : 'ok',
          message: result.error
            ? result.error
            : `${tab.kind === 'folder' ? 'Folder' : 'Collection'} run · ${total} request${
                total === 1 ? '' : 's'
              }${failed ? ` · ${failed} failure${failed === 1 ? '' : 's'}` : ''}${
                dirtyPathsRef.current.size > 0 ? ' · unsaved edits' : ''
              }`
        });
      } catch (error) {
        setStatus({
          kind: 'error',
          message: error instanceof Error ? error.message : String(error)
        });
      } finally {
        setRunningKey(null);
      }
    },
    [runningKey]
  );

  const openRequestTab = useCallback(
    (path: ItemPath) => {
      const current = loadedRef.current;
      if (!current) {
        return;
      }
      const item = getItemByPath(current.collection.item, path);
      if (!item || !isRequest(item)) {
        return;
      }
      openTab({ kind: 'request', path });
    },
    [openTab]
  );

  const openFolderTab = useCallback(
    (path: ItemPath) => {
      const current = loadedRef.current;
      if (!current) {
        return;
      }
      const item = getItemByPath(current.collection.item, path);
      if (!item || !isFolder(item)) {
        return;
      }
      openTab({ kind: 'folder', path });
      setExpanded((currentExpanded) => {
        if (currentExpanded.has(path)) {
          return currentExpanded;
        }
        const next = new Set(currentExpanded);
        next.add(path);
        return next;
      });
    },
    [openTab]
  );

  const openCollectionTab = useCallback(() => {
    openTab({ kind: 'collection' });
  }, [openTab]);

  const closeTab = useCallback((tab: WorkspaceTab, options?: { force?: boolean }) => {
    const force = options?.force ?? false;
    const isDirty =
      tab.kind === 'collection'
        ? collectionDirtyRef.current || structureDirtyRef.current
        : tab.kind === 'folder'
          ? dirtyFolderPathsRef.current.has(tab.path)
          : dirtyPathsRef.current.has(tab.path);
    if (!force && isDirty) {
      if (!window.confirm('This tab has unsaved changes. Close anyway?')) {
        return;
      }
    }
    setOpenTabs((current) => {
      const index = current.findIndex((entry) => sameTab(entry, tab));
      if (index === -1) {
        return current;
      }
      const next = current.filter((entry) => !sameTab(entry, tab));
      setActiveTab((active) =>
        active && sameTab(active, tab)
          ? next[Math.min(index, next.length - 1)] ?? null
          : active
      );
      return next;
    });
  }, []);

  const closeOtherTabs = useCallback(
    (keep: WorkspaceTab, options?: { force?: boolean }) => {
      const force = options?.force ?? false;
      const others = openTabsRef.current.filter((tab) => !sameTab(tab, keep));
      if (
        !force &&
        others.some((tab) => {
          if (tab.kind === 'collection') {
            return collectionDirtyRef.current || structureDirtyRef.current;
          }
          if (tab.kind === 'folder') {
            return dirtyFolderPathsRef.current.has(tab.path);
          }
          return dirtyPathsRef.current.has(tab.path);
        })
      ) {
        if (!window.confirm('Some tabs have unsaved changes. Close them anyway?')) {
          return;
        }
      }
      setOpenTabs([keep]);
      setActiveTab(keep);
    },
    []
  );

  const closeAllTabs = useCallback((options?: { force?: boolean }) => {
    const force = options?.force ?? false;
    if (
      !force &&
      (dirtyPathsRef.current.size > 0 ||
        dirtyFolderPathsRef.current.size > 0 ||
        collectionDirtyRef.current ||
        structureDirtyRef.current) &&
      openTabsRef.current.length > 0
    ) {
      if (!window.confirm('Some tabs have unsaved changes. Close all anyway?')) {
        return;
      }
    }
    setOpenTabs([]);
    setActiveTab(null);
  }, []);

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

        if (!session.collectionPath) {
          return;
        }

        try {
          const result = await window.clara.readCollection(session.collectionPath);
          if (cancelled) {
            return;
          }
          let parsed: unknown;
          try {
            parsed = JSON.parse(result.raw);
          } catch {
            throw new Error('File is not valid JSON');
          }
          const collection = assertPostmanCollection(parsed);
          const restoredTabs = filterValidTabs(
            collection.item,
            (session.openTabs ?? []).map(fromSessionTab)
          );
          const restoredActive =
            session.activeTabKey != null
              ? parseTabKey(session.activeTabKey)
              : null;
          const active =
            restoredActive &&
            restoredTabs.some((tab) => sameTab(tab, restoredActive))
              ? restoredActive
              : (restoredTabs[0] ?? null);

          setLoaded({
            filePath: result.filePath,
            originalRaw: result.raw,
            collection
          });
          setExpanded(
            session.expandedPaths.length
              ? new Set(session.expandedPaths)
              : collectFolderPaths(collection.item)
          );
          setOpenTabs(restoredTabs);
          setActiveTab(active);
          setDirtyPaths(new Set());
          setStatus({
            kind: 'ok',
            message: `Restored ${collection.info?.name ?? 'collection'}`
          });
        } catch (error) {
          setStatus({
            kind: 'error',
            message: `Could not restore session: ${
              error instanceof Error ? error.message : String(error)
            }`
          });
        }
      } catch (error) {
        if (!cancelled) {
          setStatus({
            kind: 'error',
            message: error instanceof Error ? error.message : String(error)
          });
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

  useEffect(() => {
    if (!sessionHydrated) {
      return;
    }

    const handle = window.setTimeout(() => {
      void window.clara.saveSession({
        version: 2,
        collectionPath: loaded?.filePath ?? null,
        openTabs: openTabs.map(toSessionTab),
        activeTabKey: activeTab ? tabKey(activeTab) : null,
        expandedPaths: [...expanded]
      });
    }, 250);

    return () => window.clearTimeout(handle);
  }, [sessionHydrated, loaded?.filePath, openTabs, activeTab, expanded]);

  const syncDirty = useCallback((collection: PostmanCollection, originalRaw: string) => {
    try {
      const baseline = assertPostmanCollection(JSON.parse(originalRaw));
      const snap = computeDirtyState(collection, baseline);
      setDirtyPaths(snap.dirtyPaths);
      setDirtyFolderPaths(snap.dirtyFolderPaths);
      setCollectionDirty(snap.collectionDirty);
      setStructureDirty(snap.structureDirty);
    } catch {
      setStructureDirty(true);
    }
  }, []);

  const createNewRequestNear = useCallback(
    (tab: WorkspaceTab) => {
      const current = loadedRef.current;
      if (!current) {
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
      const result = insertItem(current.collection, parent, createRequestItem(), after);
      setLoaded((prev) => (prev ? { ...prev, collection: result.collection } : prev));
      syncDirty(result.collection, current.originalRaw);
      if (parent) {
        setExpanded((paths) => new Set(paths).add(parent!));
      }
      setCollectionExpanded(true);
      openTab({ kind: 'request', path: result.newPath });
    },
    [openTab, syncDirty]
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
        case 'new-request':
          if (activeTabRef.current) {
            createNewRequestNear(activeTabRef.current);
          } else if (loadedRef.current) {
            createNewRequestNear({ kind: 'collection' });
          }
          break;
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
    if (!loaded || !activeRequestPath) {
      return;
    }

    try {
      const collection = updateCollectionItem(loaded.collection, activeRequestPath, updater);
      setLoaded({ ...loaded, collection });
      syncDirty(collection, loaded.originalRaw);
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  };

  const applyCollectionUpdate = (collection: PostmanCollection) => {
    const originalRaw = loadedRef.current?.originalRaw;
    setLoaded((current) => (current ? { ...current, collection } : current));
    if (originalRaw) {
      syncDirty(collection, originalRaw);
    } else {
      setStructureDirty(true);
    }
  };

  const remapTabsAfterDelete = (deleted: ItemPath) => {
    setOpenTabs((tabs) =>
      tabs.flatMap((tab) => {
        if (tab.kind === 'collection') {
          return [tab];
        }
        const nextPath = remapPathAfterDelete(tab.path, deleted);
        if (nextPath == null) {
          return [];
        }
        return [{ ...tab, path: nextPath } as WorkspaceTab];
      })
    );
    setActiveTab((active) => {
      if (!active || active.kind === 'collection') {
        return active;
      }
      const nextPath = remapPathAfterDelete(active.path, deleted);
      if (nextPath == null) {
        return null;
      }
      return { ...active, path: nextPath } as WorkspaceTab;
    });
  };

  const remapTabsAfterDuplicate = (original: ItemPath, created: ItemPath) => {
    setOpenTabs((tabs) =>
      tabs.map((tab) => {
        if (tab.kind === 'collection') {
          return tab;
        }
        return {
          ...tab,
          path: remapPathAfterDuplicate(tab.path, original, created)
        } as WorkspaceTab;
      })
    );
    setActiveTab((active) => {
      if (!active || active.kind === 'collection') {
        return active;
      }
      return {
        ...active,
        path: remapPathAfterDuplicate(active.path, original, created)
      } as WorkspaceTab;
    });
  };

  const renameTarget = (target: TreeTarget | { kind: 'collection' }) => {
    if (!loaded) {
      return;
    }
    if (target.kind === 'collection') {
      const current = loaded.collection.info?.name ?? '';
      const next = window.prompt('Rename collection', current);
      if (next == null || next.trim() === '' || next === current) {
        return;
      }
      applyCollectionUpdate(renameCollection(loaded.collection, next.trim()));
      return;
    }
    const item = getItemByPath(loaded.collection.item, target.path);
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
    applyCollectionUpdate(renameItem(loaded.collection, target.path, next.trim()));
  };

  const deleteTarget = (target: TreeTarget | { kind: 'collection' }) => {
    if (!loaded) {
      return;
    }
    if (target.kind === 'collection') {
      if (!window.confirm('Close this collection? Unsaved changes will be lost.')) {
        return;
      }
      setLoaded(null);
      setExpanded(new Set());
      resetWorkspace();
      setStatus({ kind: 'ok', message: 'Collection closed' });
      return;
    }
    const item = getItemByPath(loaded.collection.item, target.path);
    const label = item?.name?.trim() || target.kind;
    if (!window.confirm(`Delete "${label}"?`)) {
      return;
    }
    applyCollectionUpdate(deleteItem(loaded.collection, target.path));
    remapTabsAfterDelete(target.path);
  };

  const duplicateTarget = (target: TreeTarget) => {
    if (!loaded) {
      return;
    }
    const result = duplicateItem(loaded.collection, target.path);
    applyCollectionUpdate(result.collection);
    remapTabsAfterDuplicate(target.path, result.newPath);
    openTab({ kind: target.kind, path: result.newPath });
  };

  const runTarget = (target: TreeTarget | { kind: 'collection' }) => {
    if (target.kind === 'collection') {
      openTab({ kind: 'collection' });
      void runScope({ kind: 'collection' });
      return;
    }
    if (target.kind === 'folder') {
      openTab({ kind: 'folder', path: target.path });
      void runScope({ kind: 'folder', path: target.path });
      return;
    }
    openTab({ kind: 'request', path: target.path });
    // send after tab is active — use direct call with path
    void (async () => {
      const current = loadedRef.current;
      if (!current) {
        return;
      }
      setActiveTab({ kind: 'request', path: target.path });
      setSending(true);
      setRunningKey(tabKey({ kind: 'request', path: target.path }));
      try {
        const runCollection = buildSingleRequestCollection(current.collection, target.path);
        const result = await window.clara.runNewman(serializeCollection(runCollection));
        setRequestRuns((runs) => ({ ...runs, [target.path]: result }));
        setStatus({
          kind: result.error && !result.execution ? 'error' : 'ok',
          message: result.execution
            ? `Newman ${result.execution.code ?? '—'} ${result.execution.status}`
            : result.error ?? 'Newman finished'
        });
      } catch (error) {
        setStatus({
          kind: 'error',
          message: error instanceof Error ? error.message : String(error)
        });
      } finally {
        setSending(false);
        setRunningKey(null);
      }
    })();
  };

  const openContextMenu = (
    event: { clientX: number; clientY: number; preventDefault: () => void },
    target: TreeTarget | { kind: 'collection' } | { kind: 'tab'; tab: WorkspaceTab }
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
      setCollectionExpanded(true);
      setActiveTab(tab);
      return;
    }
    setCollectionExpanded(true);
    const indexes = tab.path.split('.');
    setExpanded((current) => {
      const next = new Set(current);
      for (let depth = 1; depth < indexes.length; depth += 1) {
        next.add(indexes.slice(0, depth).join('.'));
      }
      if (tab.kind === 'folder') {
        next.add(tab.path);
      }
      return next;
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
    } else if (id === 'expand-all' && target.kind === 'collection' && loaded) {
      setCollectionExpanded(true);
      setExpanded(collectFolderPaths(loaded.collection.item));
    } else if (id === 'collapse-all' && target.kind === 'collection') {
      setExpanded(new Set());
    }
  };

  const editCollectionVariables = (updater: (variables: PostmanVariable[]) => PostmanVariable[]) => {
    if (!loaded) {
      return;
    }
    const next = setCollectionVariables(
      loaded.collection,
      updater(getCollectionVariables(loaded.collection))
    );
    applyCollectionUpdate(next);
  };

  const editFolderVariables = (
    path: ItemPath,
    updater: (variables: PostmanVariable[]) => PostmanVariable[]
  ) => {
    if (!loaded) {
      return;
    }
    const next = {
      ...loaded.collection,
      item: updateItemByPath(loaded.collection.item, path, (item) =>
        setItemVariables(item, updater(getItemVariables(item)))
      )
    };
    applyCollectionUpdate(next);
  };

  const toggleFolder = (path: ItemPath) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const treeSelectedPath =
    activeTab?.kind === 'request' || activeTab?.kind === 'folder'
      ? activeTab.path
      : null;

  return (
    <div className={`app ${navigator.userAgent.includes('Mac') ? 'platform-mac' : ''}`}>
      <header className="titlebar">
        <div className="brand-mark" aria-hidden>
          C
        </div>
        <strong>Clara</strong>
        <span className="titlebar-separator" />
        <span className="titlebar-collection">
          {loaded?.collection.info?.name ?? 'Postman collection editor'}
          {dirty ? <span className="dirty-dot" title="Unsaved changes" /> : null}
        </span>
        <div className="titlebar-actions">
          <button type="button" onClick={() => void openCollection()} title="⌘O / Ctrl+O">
            Open
          </button>
          <button
            type="button"
            className={dirty ? 'save-dirty' : ''}
            disabled={!loaded}
            onClick={() => void saveCollection()}
            title="⌘S / Ctrl+S"
          >
            Save
          </button>
        </div>
      </header>

      {!loaded && (
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

      {loaded && counts && (
        <div className="workspace">
          <aside className="sidebar">
            <div className="sidebar-section-title">
              <span className="sidebar-chevron" aria-hidden>
                ⌄
              </span>
              <strong>Collections</strong>
              <span className="sidebar-count">{counts.requests}</span>
            </div>
            <div
              className={`collection-heading ${
                activeTab?.kind === 'collection' ? 'selected' : ''
              } ${collectionExpanded ? 'expanded' : 'collapsed'}`}
              onContextMenu={(event) => openContextMenu(event, { kind: 'collection' })}
            >
              <button
                type="button"
                className="collection-chevron-button"
                aria-label={collectionExpanded ? 'Collapse collection' : 'Expand collection'}
                aria-expanded={collectionExpanded}
                onClick={(event) => {
                  event.stopPropagation();
                  setCollectionExpanded((current) => !current);
                }}
              >
                <span className="collection-chevron" aria-hidden>
                  {collectionExpanded ? '▾' : '▸'}
                </span>
              </button>
              <button
                type="button"
                className="collection-heading-select"
                onClick={openCollectionTab}
              >
                <span className="collection-icon" aria-hidden>
                  ◇
                </span>
                <div>
                  <strong>{loaded.collection.info?.name ?? 'Untitled collection'}</strong>
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
                  openContextMenu(event, { kind: 'collection' });
                }}
              >
                ···
              </button>
            </div>
            {collectionExpanded ? (
              <CollectionTree
                items={loaded.collection.item}
                expanded={expanded}
                selectedPath={treeSelectedPath}
                onToggleFolder={toggleFolder}
                onSelectFolder={openFolderTab}
                onSelectRequest={openRequestTab}
                onContextMenu={(event, target) => openContextMenu(event, target)}
              />
            ) : null}
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

              {activeTab?.kind === 'collection' && (
                <CollectionRunPane
                  title={loaded.collection.info?.name ?? 'Untitled collection'}
                  subtitle={`Run all ${counts.requests} request${
                    counts.requests === 1 ? '' : 's'
                  } with Newman. Uses in-memory edits — Save is not required.`}
                  runLabel="Run collection"
                  requestCount={counts.requests}
                  result={scopeRuns[tabKey(activeTab)] ?? null}
                  running={runningKey === tabKey(activeTab)}
                  onRun={() => void runScope(activeTab)}
                  variablesSlot={
                    <VariablesPane
                      scopeLabel="collection"
                      variables={getCollectionVariables(loaded.collection)}
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
                        key={activeRequestPath}
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
                        result={requestRuns[activeRequestPath] ?? null}
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
            ? loaded
              ? dirty
                ? 'Unsaved changes'
                : 'Ready'
              : 'No collection open'
            : status.message}
        </span>
        {loaded ? (
          <>
            <span className="statusbar-spacer" />
            <span title={loaded.filePath}>{fileName(loaded.filePath)}</span>
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
