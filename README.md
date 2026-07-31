# Clara

Lightweight editor for Postman collections versioned in the repository.

- In-memory schema = Postman JSON (v2.1), with no conversion to another format
- Persistence to the same collection file
- Execution via Newman (`Send` / `⌘Enter`; assumes `newman` on PATH)

## Setup

```bash
make install
make dev
```

| Target | What it does |
|--------|-----------|
| `make install` | `npm install` |
| `make dev` | Electron + Vite |
| `make build` | Production build |
| `make typecheck` | `tsc --noEmit` |
| `make check` | Typecheck + all stage checks |
| `make check-stage0` | Skeleton open/save |
| `make check-stage1` | Tree / paths |
| `make check-stage2` | Method / URL editing |
| `make check-stage3` | Headers (key / value / disabled) |
| `make check-stage4` | Body (raw / urlencoded) |
| `make check-stage5` | Auth (bearer / basic / apikey) |
| `make check-stage6` | Query params (`url.query`) |
| `make check-stage7` | Scripts (`prerequest` / `test`) |
| `make check-stage8` | Newman run (temp collection / parse) |

## Usage (Send / Newman)

1. `make dev` — requires `newman` on `PATH` (`npm i -g newman`)
2. Open a request → **Send** or `⌘/Ctrl+Enter`
3. Clara writes a temporary 1-request collection under `~/.clara/runs/` and invokes Newman
4. The collection file in the repo is **not** modified by the run
5. **Response** panel: status, time, size, Body / Headers / Test results
6. Clicking the collection or a folder opens a Run tab
7. **Run collection** / **Run folder** (`newman --folder <name>`)

## Session (`~/.clara`)

Clara stores session metadata in `~/.clara/session.json` (open collection,
tabs, expanded folder). Unsaved edits do **not** go into that file — only the
on-disk collection JSON does.

## Shortcuts

| Shortcut | Action |
|--------|------|
| `⌘/Ctrl+O` | Open collection |
| `⌘/Ctrl+S` | Save |
| `⌘/Ctrl+W` | Close active tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tab |
| `⌘/Ctrl+1…9` | Go to tab N |
| `⌘/Ctrl+Enter` | Send (Newman) |
| Drag tab | Reorder |
| Drag request from tree → bar | Open tab |

## Progress

First MVP checklist: [docs/MVP.md](./docs/MVP.md)
