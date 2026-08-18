import { useEffect, useMemo, useRef, useState } from 'react';
import type { CollectionSearchHit } from '../workspace/collectionSearch.ts';
import './CommandPalette.css';

type CommandPaletteProps = {
  query: string;
  hits: CollectionSearchHit[];
  onQueryChange: (query: string) => void;
  onSelect: (hit: CollectionSearchHit) => void;
  onClose: () => void;
};

export default function CommandPalette({
  query,
  hits,
  onQueryChange,
  onSelect,
  onClose
}: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, hits.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const activeHit = hits[activeIndex] ?? null;
  const emptyLabel = useMemo(() => {
    if (query.trim()) {
      return 'No matches in open collections';
    }
    return 'Type to search names, URLs, bodies, headers, and scripts';
  }, [query]);

  return (
    <div className="command-palette-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search collections"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-palette-input-row">
          <input
            ref={inputRef}
            type="search"
            value={query}
            spellCheck={false}
            autoComplete="off"
            placeholder="Search collections…"
            aria-label="Search collections"
            aria-controls="command-palette-results"
            aria-activedescendant={activeHit ? `command-palette-hit-${activeIndex}` : undefined}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                if (hits.length === 0) {
                  return;
                }
                setActiveIndex((current) => (current + 1) % hits.length);
                return;
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                if (hits.length === 0) {
                  return;
                }
                setActiveIndex((current) => (current - 1 + hits.length) % hits.length);
                return;
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                if (activeHit) {
                  onSelect(activeHit);
                }
              }
            }}
          />
          <kbd className="command-palette-kbd">esc</kbd>
        </div>

        <div
          id="command-palette-results"
          className="command-palette-results"
          role="listbox"
          aria-label="Search results"
        >
          {hits.length === 0 ? (
            <p className="command-palette-empty">{emptyLabel}</p>
          ) : (
            hits.map((hit, index) => {
              const active = index === activeIndex;
              return (
                <button
                  key={hit.id}
                  id={`command-palette-hit-${index}`}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`command-palette-hit${active ? ' active' : ''}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => onSelect(hit)}
                >
                  <span
                    className={`command-palette-method method-${hit.method.toLowerCase()}${
                      hit.kind === 'folder' ? ' badge-folder' : ''
                    }`}
                  >
                    {hit.method}
                  </span>
                  <span className="command-palette-hit-main">
                    <span className="command-palette-hit-title">
                      <span className="command-palette-hit-name">{hit.name}</span>
                      <span className="command-palette-hit-field">{hit.fieldLabel}</span>
                    </span>
                    <span className="command-palette-hit-meta">
                      <span className="command-palette-hit-path">{hit.breadcrumb}</span>
                      <span className="command-palette-hit-snippet">{hit.snippet}</span>
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
