import { useLayoutEffect, useRef, useState, type DragEvent } from 'react';
import type { ItemPath } from '../postman/tree.ts';
import { ITEM_PATH_MIME, TAB_PATH_MIME } from './dnd.ts';
import './RequestTabs.css';

export type RequestTab = {
  path: ItemPath;
  name: string;
  method: string;
  dirty: boolean;
};

type RequestTabsProps = {
  tabs: RequestTab[];
  activePath: ItemPath | null;
  onSelect: (path: ItemPath) => void;
  onClose: (path: ItemPath) => void;
  onDropRequest: (path: ItemPath) => void;
  onReorder: (fromPath: ItemPath, toPath: ItemPath, place: 'before' | 'after') => void;
};

/**
 * Fades the tail of the label instead of cutting it with an ellipsis, which
 * needs to know whether the text actually overflows its box.
 */
function TabLabel({ children }: { children: string }) {
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
      title={children}
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
  activePath,
  onSelect,
  onClose,
  onDropRequest,
  onReorder
}: RequestTabsProps) {
  const [treeDropTarget, setTreeDropTarget] = useState(false);
  const [reorderOver, setReorderOver] = useState<{
    path: ItemPath;
    place: 'before' | 'after';
  } | null>(null);

  const hasType = (event: DragEvent, mime: string) =>
    Array.from(event.dataTransfer.types).includes(mime);

  return (
    <div
      className={`request-tabs ${treeDropTarget ? 'drop-target' : ''}`}
      role="tablist"
      aria-label="Open requests"
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
        const path = event.dataTransfer.getData(ITEM_PATH_MIME);
        if (!path) {
          return;
        }
        event.preventDefault();
        onDropRequest(path);
      }}
    >
      {tabs.length === 0 && (
        <span className="request-tabs-hint">
          Select or drag a request here to open a tab
        </span>
      )}

      {tabs.map((tab) => (
        <div
          key={tab.path}
          className={[
            'request-tab',
            tab.path === activePath ? 'active' : '',
            reorderOver?.path === tab.path ? `reorder-${reorderOver.place}` : ''
          ]
            .filter(Boolean)
            .join(' ')}
          role="tab"
          aria-selected={tab.path === activePath}
          tabIndex={tab.path === activePath ? 0 : -1}
          draggable
          onClick={() => onSelect(tab.path)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelect(tab.path);
            }
          }}
          onAuxClick={(event) => {
            if (event.button === 1) {
              event.preventDefault();
              onClose(tab.path);
            }
          }}
          onDragStart={(event) => {
            event.dataTransfer.setData(TAB_PATH_MIME, tab.path);
            event.dataTransfer.setData('text/plain', tab.name);
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
            setReorderOver({ path: tab.path, place: dropPlace(event) });
          }}
          onDrop={(event) => {
            if (!hasType(event, TAB_PATH_MIME)) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            const fromPath = event.dataTransfer.getData(TAB_PATH_MIME);
            setReorderOver(null);
            if (!fromPath || fromPath === tab.path) {
              return;
            }
            onReorder(fromPath, tab.path, dropPlace(event));
          }}
        >
          <span className={`request-tab-method method-${tab.method.toLowerCase()}`}>
            {tab.method}
          </span>
          <TabLabel>{tab.name}</TabLabel>
          <button
            type="button"
            className={`request-tab-close ${tab.dirty ? 'dirty' : ''}`}
            aria-label={tab.dirty ? `Close ${tab.name} (unsaved changes)` : `Close ${tab.name}`}
            title={tab.dirty ? 'Unsaved changes' : 'Close tab'}
            onClick={(event) => {
              event.stopPropagation();
              onClose(tab.path);
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
      ))}
    </div>
  );
}
