import { useLayoutEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import type { WorkspaceTab } from '../workspace/tabs.ts';
import { sameTab, tabKey } from '../workspace/tabs.ts';
import { decodeItemDrag, ITEM_PATH_MIME, TAB_PATH_MIME } from './dnd.ts';
import './RequestTabs.css';

export type WorkspaceTabView = {
  tab: WorkspaceTab;
  name: string;
  badge: string;
  badgeClass?: string;
  dirty: boolean;
  tooltip?: string;
};

type RequestTabsProps = {
  tabs: WorkspaceTabView[];
  activeTab: WorkspaceTab | null;
  onSelect: (tab: WorkspaceTab) => void;
  /** Reveal the tab's item in the sidebar (same effect as Follow for one shot). */
  onRevealInSidebar?: ((tab: WorkspaceTab) => void) | null;
  onClose: (tab: WorkspaceTab) => void;
  onDropRequest: (collectionPath: string, path: string) => void;
  onReorder: (from: WorkspaceTab, to: WorkspaceTab, place: 'before' | 'after') => void;
  onContextMenu: (event: MouseEvent, tab: WorkspaceTab) => void;
  /** Opens a blank unsaved request tab. Null hides the + control. */
  onNewRequest?: (() => void) | null;
};

/** Generous window so a slow second click still reveals the sidebar target. */
const TAB_REVEAL_DOUBLE_CLICK_MS = 1500;

function TabLabel({ children, tooltip }: { children: string; tooltip?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const measure = () => setOverflowing(element.scrollWidth > element.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [children]);

  return (
    <span
      ref={ref}
      className={`request-tab-name ${overflowing ? 'faded' : ''}`}
      title={tooltip ?? children}
    >
      {children}
    </span>
  );
}

function dropPlace(event: DragEvent<HTMLElement>): 'before' | 'after' {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
}

export default function RequestTabs({
  tabs,
  activeTab,
  onSelect,
  onRevealInSidebar = null,
  onClose,
  onDropRequest,
  onReorder,
  onContextMenu,
  onNewRequest = null
}: RequestTabsProps) {
  const [treeDropTarget, setTreeDropTarget] = useState(false);
  const [reorderOver, setReorderOver] = useState<{
    key: string;
    place: 'before' | 'after';
  } | null>(null);
  const lastTabClickRef = useRef<{ key: string; at: number } | null>(null);

  const hasType = (event: DragEvent, mime: string) =>
    Array.from(event.dataTransfer.types).includes(mime);

  const handleTabClick = (tab: WorkspaceTab) => {
    const key = tabKey(tab);
    const now = Date.now();
    const previous = lastTabClickRef.current;
    const isDouble =
      Boolean(onRevealInSidebar) &&
      previous != null &&
      previous.key === key &&
      now - previous.at <= TAB_REVEAL_DOUBLE_CLICK_MS;

    onSelect(tab);

    if (isDouble && onRevealInSidebar) {
      lastTabClickRef.current = null;
      onRevealInSidebar(tab);
      return;
    }
    lastTabClickRef.current = { key, at: now };
  };

  return (
    <div
      className={`request-tabs ${treeDropTarget ? 'drop-target' : ''}`}
      role="tablist"
      aria-label="Open tabs"
      onDragOver={(event) => {
        if (hasType(event, TAB_PATH_MIME)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          return;
        }
        if (!hasType(event, ITEM_PATH_MIME)) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setTreeDropTarget(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return;
        }
        setTreeDropTarget(false);
        setReorderOver(null);
      }}
      onDrop={(event) => {
        setTreeDropTarget(false);
        setReorderOver(null);
        if (hasType(event, TAB_PATH_MIME)) {
          return;
        }
        const payload = decodeItemDrag(event.dataTransfer.getData(ITEM_PATH_MIME));
        if (!payload) {
          return;
        }
        event.preventDefault();
        onDropRequest(payload.collectionPath, payload.path);
      }}
    >
      {tabs.length === 0 && (
        <span className="request-tabs-hint">
          Select a collection, folder, or request to open a tab
        </span>
      )}

      {tabs.map((entry) => {
        const key = tabKey(entry.tab);
        const active = activeTab ? sameTab(entry.tab, activeTab) : false;
        return (
          <div
            key={key}
            className={[
              'request-tab',
              entry.tab.kind === 'collection' ? 'request-tab-collection' : '',
              active ? 'active' : '',
              reorderOver?.key === key ? `reorder-${reorderOver.place}` : ''
            ]
              .filter(Boolean)
              .join(' ')}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            draggable
            title={
              onRevealInSidebar
                ? 'Double-click to reveal in the sidebar'
                : undefined
            }
            onClick={() => handleTabClick(entry.tab)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleTabClick(entry.tab);
              }
            }}
            onAuxClick={(event) => {
              if (event.button === 1) {
                event.preventDefault();
                onClose(entry.tab);
              }
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              onContextMenu(event, entry.tab);
            }}
            onDragStart={(event) => {
              event.dataTransfer.setData(TAB_PATH_MIME, key);
              event.dataTransfer.setData('text/plain', entry.name);
              event.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => setReorderOver(null)}
            onDragOver={(event) => {
              if (!hasType(event, TAB_PATH_MIME)) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = 'move';
              setReorderOver({ key, place: dropPlace(event) });
            }}
            onDrop={(event) => {
              if (!hasType(event, TAB_PATH_MIME)) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              const fromKey = event.dataTransfer.getData(TAB_PATH_MIME);
              setReorderOver(null);
              const fromTab = tabs.find((candidate) => tabKey(candidate.tab) === fromKey)?.tab;
              if (!fromTab || sameTab(fromTab, entry.tab)) {
                return;
              }
              onReorder(fromTab, entry.tab, dropPlace(event));
            }}
          >
            {entry.tab.kind !== 'collection' ? (
              <span
                className={`request-tab-method ${entry.badgeClass ?? ''}`.trim()}
              >
                {entry.badge}
              </span>
            ) : null}
            <TabLabel tooltip={entry.tooltip}>{entry.name}</TabLabel>
            <button
              type="button"
              className={`request-tab-close ${entry.dirty ? 'dirty' : ''}`}
              aria-label={
                entry.dirty ? `Close ${entry.name} (unsaved changes)` : `Close ${entry.name}`
              }
              title={entry.dirty ? 'Unsaved changes' : 'Close tab'}
              onClick={(event) => {
                event.stopPropagation();
                onClose(entry.tab);
              }}
            >
              <span className="close-glyph" aria-hidden>
                ✕
              </span>
              <span className="dirty-glyph" aria-hidden>
                ●
              </span>
            </button>
          </div>
        );
      })}

      {onNewRequest ? (
        <button
          type="button"
          className="request-tabs-new"
          aria-label="New request"
          title="New unsaved request"
          onClick={onNewRequest}
        >
          +
        </button>
      ) : null}
    </div>
  );
}
