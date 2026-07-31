import { useEffect, useRef } from 'react';
import './ContextMenu.css';

export type ContextMenuItem = {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
};

type ContextMenuProps = {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onSelect: (id: string) => void;
  onClose: () => void;
};

export default function ContextMenu({ x, y, items, onSelect, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
    };
  }, [onClose]);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const rect = element.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 8;
    const maxY = window.innerHeight - rect.height - 8;
    element.style.left = `${Math.max(8, Math.min(x, maxX))}px`;
    element.style.top = `${Math.max(8, Math.min(y, maxY))}px`;
  }, [x, y, items]);

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: x, top: y }}
      role="menu"
    >
      {items.map((item) => (
        <div key={item.id}>
          {item.separatorBefore ? <div className="context-menu-separator" /> : null}
          <button
            type="button"
            role="menuitem"
            className={`context-menu-item ${item.danger ? 'danger' : ''}`.trim()}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) {
                return;
              }
              onSelect(item.id);
              onClose();
            }}
          >
            <span className="context-menu-label">{item.label}</span>
            {item.shortcut ? (
              <span className="context-menu-shortcut">{item.shortcut}</span>
            ) : null}
          </button>
        </div>
      ))}
    </div>
  );
}
