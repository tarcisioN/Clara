import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppCommand } from '../electron/commands.ts';
import CollectionTree from './components/CollectionTree.tsx';
import RequestPane from './components/RequestPane.tsx';
import RequestTabs, { type RequestTab } from './components/RequestTabs.tsx';
import {
  assertPostmanCollection,
  countItems,
  serializeCollection,
  type PostmanCollection,
  type PostmanItem
} from './postman/types.ts';
import {
  collectFolderPaths,
  getItemByPath,
  getRequestByPath,
  isRequest,
  type ItemPath
} from './postman/tree.ts';
import {
  addRequestHeader,
  addRequestQueryParam,
  addRequestUrlEncodedParam,
  promoteRequestUrlToObject,
  removeRequestHeader,
  removeRequestQueryParam,
  removeRequestUrlEncodedParam,
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

function filterValidRequestPaths(
  items: PostmanItem[] | undefined,
  paths: ItemPath[]
): ItemPath[] {
  return paths.filter((path) => {
    const item = getItemByPath(items, path);
    return Boolean(item && isRequest(item));
  });
}

function applyCollection(
  filePath: string,
  raw: string,
  preferred?: {
    openPaths?: ItemPath[];
    activePath?: ItemPath | null;
    expandedPaths?: ItemPath[];
  }
): {
  loaded: LoadedCollection;
  expanded: Set<ItemPath>;
  openPaths: ItemPath[];
  activePath: ItemPath | null;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('File is not valid JSON');
  }

  const collection = assertPostmanCollection(parsed);
  const openPaths = filterValidRequestPaths(collection.item, preferred?.openPaths ?? []);
  const activePath =
    preferred?.activePath && openPaths.includes(preferred.activePath)
      ? preferred.activePath
      : (openPaths[0] ?? null);
  const expanded = new Set(
    preferred?.expandedPaths?.length
      ? preferred.expandedPaths
      : [...collectFolderPaths(collection.item)]
  );

  return {
    loaded: { filePath, originalRaw: raw, collection },
    expanded,
    openPaths,
    activePath
  };
}

export default function App() {
  const [loaded, setLoaded] = useState<LoadedCollection | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [expanded, setExpanded] = useState<Set<ItemPath>>(new Set());
  const [openPaths, setOpenPaths] = useState<ItemPath[]>([]);
  const [activePath, setActivePath] = useState<ItemPath | null>(null);
  const [dirtyPaths, setDirtyPaths] = useState<Set<ItemPath>>(new Set());
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [sessionHome, setSessionHome] = useState<string | null>(null);

  const dirty = dirtyPaths.size > 0;

  const loadedRef = useRef(loaded);
  const openPathsRef = useRef(openPaths);
  const activePathRef = useRef(activePath);
  const dirtyPathsRef = useRef(dirtyPaths);
  loadedRef.current = loaded;
  openPathsRef.current = openPaths;
  activePathRef.current = activePath;
  dirtyPathsRef.current = dirtyPaths;

  const counts = useMemo(
    () => (loaded ? countItems(loaded.collection.item) : null),
    [loaded]
  );

  const tabs = useMemo<RequestTab[]>(() => {
    if (!loaded) {
      return [];
    }
    return openPaths.flatMap((path) => {
      const item = getItemByPath(loaded.collection.item, path);
      const request = getRequestByPath(loaded.collection.item, path);
      if (!item || !request) {
        return [];
      }
      return [
        {
          path,
          name: item.name?.trim() || 'Untitled request',
          method: (request.method ?? 'GET').toUpperCase(),
          dirty: dirtyPaths.has(path)
        }
      ];
    });
  }, [loaded, openPaths, dirtyPaths]);

  const selectedItem = useMemo(() => {
    if (!loaded || !activePath) {
      return null;
    }
    return getItemByPath(loaded.collection.item, activePath) ?? null;
  }, [loaded, activePath]);

  const selectedRequest = useMemo(() => {
    if (!loaded || !activePath) {
      return null;
    }
    return getRequestByPath(loaded.collection.item, activePath) ?? null;
  }, [loaded, activePath]);

  const resetTabs = () => {
    setOpenPaths([]);
    setActivePath(null);
    setDirtyPaths(new Set());
  };

  const openCollection = useCallback(async () => {
    setStatus({ kind: 'idle' });
    try {
      const result = await window.clara.openCollection();
      if (result.canceled) {
        return;
      }

      const next = applyCollection(result.filePath, result.raw);
      setLoaded(next.loaded);
      setExpanded(next.expanded);
      setOpenPaths(next.openPaths);
      setActivePath(next.activePath);
      setDirtyPaths(new Set());
      setStatus({
        kind: 'ok',
        message: `Opened ${next.loaded.collection.info?.name ?? 'collection'}`
      });
    } catch (error) {
      setLoaded(null);
      setExpanded(new Set());
      resetTabs();
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }, []);

  const saveCollection = useCallback(async () => {
    const current = loadedRef.current;
    if (!current) {
      return;
    }

    setStatus({ kind: 'idle' });
    try {
      const hasDirty = dirtyPathsRef.current.size > 0;
      const contents = hasDirty
        ? serializeCollection(current.collection)
        : current.originalRaw;

      await window.clara.saveCollection(current.filePath, contents);
      setLoaded({ ...current, originalRaw: contents });
      setDirtyPaths(new Set());
      setStatus({ kind: 'ok', message: `Saved ${current.filePath}` });
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }, []);

  const closeRequestTab = useCallback((path: ItemPath) => {
    setOpenPaths((current) => {
      const index = current.indexOf(path);
      if (index === -1) {
        return current;
      }
      const next = current.filter((openPath) => openPath !== path);
      setActivePath((active) =>
        active === path ? next[Math.min(index, next.length - 1)] ?? null : active
      );
      return next;
    });
  }, []);

  const openRequestTab = useCallback((path: ItemPath) => {
    const current = loadedRef.current;
    if (!current) {
      return;
    }
    const item = getItemByPath(current.collection.item, path);
    if (!item || !isRequest(item)) {
      return;
    }
    setOpenPaths((paths) => (paths.includes(path) ? paths : [...paths, path]));
    setActivePath(path);
  }, []);

  const cycleTab = useCallback((delta: number) => {
    const paths = openPathsRef.current;
    if (paths.length === 0) {
      return;
    }
    const currentIndex = activePathRef.current
      ? paths.indexOf(activePathRef.current)
      : -1;
    const nextIndex =
      currentIndex === -1
        ? 0
        : (currentIndex + delta + paths.length) % paths.length;
    setActivePath(paths[nextIndex] ?? null);
  }, []);

  const selectTabAt = useCallback((index: number) => {
    const path = openPathsRef.current[index];
    if (path) {
      setActivePath(path);
    }
  }, []);

  const reorderTabs = useCallback(
    (fromPath: ItemPath, toPath: ItemPath, place: 'before' | 'after') => {
      setOpenPaths((current) => {
        const from = current.indexOf(fromPath);
        const to = current.indexOf(toPath);
        if (from === -1 || to === -1 || fromPath === toPath) {
          return current;
        }
        const next = current.filter((path) => path !== fromPath);
        let insertAt = next.indexOf(toPath);
        if (insertAt === -1) {
          return current;
        }
        if (place === 'after') {
          insertAt += 1;
        }
        next.splice(insertAt, 0, fromPath);
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
          const next = applyCollection(result.filePath, result.raw, {
            openPaths: session.openPaths,
            activePath: session.activePath,
            expandedPaths: session.expandedPaths
          });
          setLoaded(next.loaded);
          setExpanded(next.expanded);
          setOpenPaths(next.openPaths);
          setActivePath(next.activePath);
          setDirtyPaths(new Set());
          setStatus({
            kind: 'ok',
            message: `Restored ${next.loaded.collection.info?.name ?? 'collection'}`
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
        version: 1,
        collectionPath: loaded?.filePath ?? null,
        openPaths,
        activePath,
        expandedPaths: [...expanded]
      });
    }, 250);

    return () => window.clearTimeout(handle);
  }, [sessionHydrated, loaded?.filePath, openPaths, activePath, expanded]);

  useEffect(() => {
    return window.clara.onCommand((command: AppCommand) => {
      switch (command.type) {
        case 'open':
          void openCollection();
          break;
        case 'save':
          void saveCollection();
          break;
        case 'close-tab':
          if (activePathRef.current) {
            closeRequestTab(activePathRef.current);
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
  }, [openCollection, saveCollection, closeRequestTab, cycleTab, selectTabAt]);

  const editSelectedItem = (updater: (item: PostmanItem) => PostmanItem) => {
    if (!loaded || !activePath) {
      return;
    }

    try {
      const collection = updateCollectionItem(loaded.collection, activePath, updater);
      setLoaded({ ...loaded, collection });
      setDirtyPaths((current) => new Set(current).add(activePath));
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error)
      });
    }
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
            <div className="collection-heading">
              <span className="collection-icon" aria-hidden>
                ◇
              </span>
              <div>
                <strong>{loaded.collection.info?.name ?? 'Untitled collection'}</strong>
                <span>
                  {counts.folders} folders · {counts.requests} requests
                </span>
              </div>
            </div>
            <CollectionTree
              items={loaded.collection.item}
              expanded={expanded}
              selectedPath={activePath}
              onToggleFolder={toggleFolder}
              onSelectRequest={openRequestTab}
            />
          </aside>

          <section className="main-workspace">
            <RequestTabs
              tabs={tabs}
              activePath={activePath}
              onSelect={setActivePath}
              onClose={closeRequestTab}
              onDropRequest={openRequestTab}
              onReorder={reorderTabs}
            />

            <main className="detail">
              {!(activePath && selectedItem && selectedRequest) && (
                <div className="empty-state">
                  <span className="empty-state-icon" aria-hidden>
                    ↖
                  </span>
                  <h2>Select a request</h2>
                  <p>Choose a request from the collection tree to start editing.</p>
                </div>
              )}
              {activePath && selectedItem && selectedRequest && (
                <RequestPane
                  key={activePath}
                  item={selectedItem}
                  request={selectedRequest}
                  path={activePath}
                  onChangeMethod={(method) =>
                    editSelectedItem((item) => setRequestMethod(item, method))
                  }
                  onChangeUrl={(raw) => editSelectedItem((item) => setRequestUrl(item, raw))}
                  onPromoteUrlToObject={() =>
                    editSelectedItem((item) => promoteRequestUrlToObject(item))
                  }
                  onAddQueryParam={() => editSelectedItem((item) => addRequestQueryParam(item))}
                  onChangeQueryParam={(index, patch) =>
                    editSelectedItem((item) => updateRequestQueryParam(item, index, patch))
                  }
                  onToggleQueryParamDisabled={(index, disabled) =>
                    editSelectedItem((item) => setRequestQueryParamDisabled(item, index, disabled))
                  }
                  onRemoveQueryParam={(index) =>
                    editSelectedItem((item) => removeRequestQueryParam(item, index))
                  }
                  onAddHeader={() => editSelectedItem((item) => addRequestHeader(item))}
                  onChangeHeader={(index, patch) =>
                    editSelectedItem((item) => updateRequestHeader(item, index, patch))
                  }
                  onToggleHeaderDisabled={(index, disabled) =>
                    editSelectedItem((item) => setRequestHeaderDisabled(item, index, disabled))
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
                    editSelectedItem((item) => updateRequestUrlEncodedParam(item, index, patch))
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
                    editSelectedItem((item) => setItemScriptSource(item, 'prerequest', source))
                  }
                  onChangeTestScript={(source) =>
                    editSelectedItem((item) => setItemScriptSource(item, 'test', source))
                  }
                />
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
                ? `Unsaved changes in ${dirtyPaths.size} request${dirtyPaths.size > 1 ? 's' : ''}`
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
    </div>
  );
}
