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

Install a launchable macOS app into `/Applications` (unsigned local build):

```bash
make install-app
open -a Clara
```

Newman (required for Send / Run):

```bash
npm install -g newman
newman --version
```

If Send shows “Newman is not installed”, use **Install with npm** in the guide (or run
`npm install -g newman` in a terminal). Click **Check again**, or **restart Clara** so the
GUI picks up PATH changes on macOS.

| Target | What it does |
|--------|-----------|
| `make install` | `npm install` |
| `make install-app` | Build + copy `Clara.app` into `/Applications` (macOS) |
| `make package` | Production build + unsigned `.app` under `release/` |
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
| `make check-stage12` | Git compare plumbing (discover / show at ref) |
| `make check-stage13` | Git structural tree diff (markers / changed-only) |
| `make check-stage14` | Git semantic request diff (section badges) |
| `make check-stage15` | Git change list flatten / navigation order |
| `make check-stage16` | Git compare base selector / session bases |
| `make check-stage17` | Git restore from base + env/variable keyed diff |
| `make check-stage18` | External file changes (watcher / reload decisions) |
| `make check-stage19` | Request field diff view (text / keyed / stacked) |

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

## Files changed outside Clara

Open collections and environments are watched, so edits from your editor, a
`git checkout`, or a second Clara window are picked up automatically and the
compare counts refresh. When you have unsaved edits, Clara keeps them and warns
instead; **Reload from disk** (collection context menu) discards them and takes
the file as-is. The ↻ button in **Changes** reloads both the file and the base ref.

## Shortcuts

| Shortcut | Action |
|--------|------|
| `⌘/Ctrl+N` | New collection |
| `⌘/Ctrl+O` | Open collection |
| `⌘/Ctrl+S` | Save |
| `⌘/Ctrl+W` | Close active tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tab |
| `⌘/Ctrl+1…9` | Go to tab N |
| `⌘/Ctrl+Enter` | Send (Newman) |
| Click sidebar item | Open / replace active tab if it is not dirty |
| `⌘/Ctrl`+click sidebar | Open in a new tab |
| Drag tab | Reorder |
| Drag request from tree → bar | Open tab |

## Compare (git)

When a collection lives in a git repo, Clara compares the open tree against a base
ref (`main`/`master` by default, or any branch/tag/SHA you pick). Markers show
added / removed / modified requests; open a request to see which sections differ.
Click a row in **Changes** to open the request in a read-only **Diff** view
(stacked URL, paired headers/params/auth, unified body/script diffs). Toggle
**Edit** to return to the editor. Environments and collection/folder variables
offer the same **Edit | Diff** keyed comparison when Compare is active. You can
restore a request, section, folder, or environment value from the base as an
**unsaved edit** (Save writes the file — compare never runs `git checkout`).
Files that do not exist at the base ref (new or untracked) simply show no comparison.

See [docs/EPIC-git-compare.md](./docs/EPIC-git-compare.md).

## Progress

First MVP checklist: [docs/MVP.md](./docs/MVP.md)

Git compare epic: [docs/EPIC-git-compare.md](./docs/EPIC-git-compare.md)
