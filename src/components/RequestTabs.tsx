import { useLayoutEffect, useRef, useState, type DragEvent } from 'react';
import type { ItemPath } from '../postman/tree.ts';
import { ITEM_PATH_MIME } from './dnd.ts';
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

export default function RequestTabs({
  tabs,
  activePath,
  onSelect,
  onClose,
  onDropRequest
}: RequestTabsProps) {
  const [dropTarget, setDropTarget] = useState(false);

  const readDraggedPath = (event: DragEvent): string | null => {
    const path = event.dataTransfer.getData(ITEM_PATH_MIME);
    return path ? path : null;
  };

  return (
    <div
      className={`request-tabs ${dropTarget ? 'drop-target' : ''}`}
      role="tablist"
      aria-label="Open requests"
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(ITEM_PATH_MIME)) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setDropTarget(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return;
        }
        setDropTarget(false);
      }}
      onDrop={(event) => {
        const path = readDraggedPath(event);
        setDropTarget(false);
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
          className={`request-tab ${tab.path === activePath ? 'active' : ''}`}
          role="tab"
          aria-selected={tab.path === activePath}
          tabIndex={tab.path === activePath ? 0 : -1}
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
