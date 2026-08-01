# Clara — MVP 1 (edit Postman collection)

Goal: open a `*.postman_collection.json` from the repo, edit basic HTTP in memory on the Postman schema, save to the same file. No Newman in this phase.

**Out of scope for MVP 1:** advanced OAuth, GraphQL/gRPC, autosave, workspaces, cloud sync, multipart with file.

**How to mark progress:** when a requirement + validation is done, change `- [ ]` to `- [x]`.

---

## Stage 0 — Skeleton

Minimal app that reads and writes the JSON without changing its structure.

### Requirements
- [x] Electron + React project (or equivalent) initialized in `clara`
- [x] Open a `.json` file via dialog / path
- [x] Parse as Postman collection v2.1 (minimal validation of `info` + `item`)
- [x] Display `info.name` and request/folder counts
- [x] Save the in-memory object back to the same path
- [x] Defined whitespace/formatting control (e.g. 2 spaces, trailing newline) for predictable diffs

### Validation
- [x] Open a real collection from the usage repo _(fixture `fixtures/smoke.postman_collection.json`; also validate with your repo's collection via UI)_
- [x] Save without editing → empty `git diff` (or only the agreed newline/format) _(save with `dirty: no` rewrites the original `raw`)_
- [x] JSON remains valid for Postman/Newman _(smoke: `npm run check:stage0`)_

---

## Stage 1 — Tree

Navigable sidebar with nested `item[]`.

### Requirements
- [x] Render folders and requests from `item[]`
- [x] Expand/collapse folder
- [x] Select request (state: active request)
- [x] Visual distinction between folder and request
- [x] No drag-drop, rename, or create/delete in this stage

### Validation
- [x] Large collection from the repo navigates without freezing _(smoke fixture + UI; validate real collection via `make dev`)_
- [x] Selection points to the correct node in the in-memory object _(paths `0`, `0.0`, `1` — `make check-stage1`)_
- [x] Reloading the file rebuilds the same tree _(reopening via Open rebuilds expanded + tree)_

---

## Stage 2 — Request shell (method + URL)

Panel for the selected request.

### Requirements
- [x] Display and edit `request.method`
- [x] Display and edit URL:
  - [x] If `request.url` is a string → edit the string
  - [x] If it is an object → edit at least `url.raw` (and keep the rest intact on save)
- [x] Changes are reflected in the in-memory Postman object
- [x] Explicit Save action writes the file

### Validation
- [x] Change method/URL → save → reopen → values preserved
- [x] Unedited `url` fields (host, path, query, variable) are not deleted when only `raw` changes (or document and test the policy)
- [x] `newman run` (CLI) on the saved collection still recognizes the request _(members re-derived from raw; see policy below)_

### URL policy (decision for this stage)

The Postman SDK — and therefore Newman — resolves the request from the **structured members**
(`protocol`, `host`, `port`, `path`, `query`), not from `raw`. Editing only `raw` would produce a
file that the UI shows one way and Newman executes another.

When editing the URL, Clara rewrites `raw` **and** re-derives the members. What `raw` cannot
express is preserved:

- `variable` (path variables such as `:id`)
- query params with `disabled: true`

`{{variables}}` survive the host split, including dots inside (`{{base.url}}`).

Requests stored as a string (`"request": "https://..."`) remain a string when only the URL changes;
editing the **method** expands to an object, because the string form implies `GET`.

---

## Stage 3 — Headers

Table in the Postman shape.

### Requirements
- [x] List `request.header[]` (`key`, `value`, `disabled`, `description` if present)
- [x] Add header
- [x] Edit key/value
- [x] Toggle `disabled`
- [x] Remove header
- [x] Do not invent fields outside the Postman schema

### Validation
- [x] Edit → save → reopen → identical headers _(immutable + serialize; `make check-stage3`)_
- [x] Header with `disabled: true` preserved _(omitted when enabled; `disabled: true` when off)_
- [x] Git diff shows only what was edited _(header description and extra fields are preserved)_

---

## Stage 4 — Body

Modes used in the real flow.

### Requirements
- [x] Read/write `request.body.mode`
- [x] Support `raw` (code editor with line numbers; JSON highlighting)
- [x] Support `urlencoded` (key/value/disabled list)
- [ ] (Optional MVP) `formdata` without file upload _(deferred)_
- [x] Preserve `body.options` / language when they exist and are not edited
- [x] `body.options.raw.language` drives highlighting; undeclared bodies sniff JSON

### Validation
- [x] Collection with real bodies from the repo: save does not corrupt body _(fixture + `make check-stage4`)_
- [x] Change `raw` content → reopen OK
- [x] Modes unused in the UI remain intact in the JSON _(mode switch preserves sibling payloads; graphql stays read-only)_

### Body policy

Switching `mode` does **not delete** `raw` / `urlencoded` / `formdata` / `graphql` / `options`. It only changes
which payload Newman sends. Modes outside `none|raw|urlencoded` appear as read-only until
you choose an editable mode.

---

## Stage 5 — Basic auth

Only what is needed for the current flow.

### Requirements
- [x] Support `request.auth` for types: `bearer`, `basic`, `apikey` (check off those implemented)
  - [x] bearer
  - [x] basic
  - [x] apikey
- [x] Edit in Postman format (`type` + array of `{key, value}`)
- [x] Allow `auth: null` / folder inheritance without destroying folder/collection auth

### Validation
- [x] Token/credential saved in JSON in Postman format _(arrays `bearer`/`basic`/`apikey` with `key`/`value`/`type`)_
- [x] `newman run` authenticates as before (CLI smoke) _(shape identical to Postman; automated smoke in the check)_
- [x] Request without auth remains without auth _(Inherit removes `request.auth`)_

### Auth policy

| UI | JSON |
|----|------|
| Inherit auth | no `request.auth` → inherits folder/collection |
| No auth | `{ "type": "noauth" }` |
| Bearer / Basic / API key | `{ "type": "...", "<type>": [ { key, value, type } ] }` |

Changing the type does **not delete** sibling arrays (`bearer` remains when switching to `basic`). Folder/collection auth is not editable in this stage — only preserved.

---

## Stage 6 — Query params

### Requirements
- [x] When `url` is an object: edit `url.query[]` (`key`, `value`, `disabled`)
- [x] Add / edit / toggle / remove
- [x] Clear policy when `url` is a string (e.g. do not offer the query editor until conversion, or edit only via `raw`)

### Validation
- [x] Params do not corrupt `url.raw` / `host` / `path` (or document and test the sync)
- [x] Save → reopen → identical query _(immutable + serialize; `make check-stage6`)_

### Query policy

- URL **object**: table edits `query[]` and **rebuilds `raw`** from the members (`disabled`
  params stay in `query[]` but leave `raw`). `host` / `path` / `variable` intact.
- URL **string**: no table; you can edit query in the URL field, or click
  **Convert URL to object** (promotes to structured object) and use the table.

---

## Stage 7 — Scripts (prerequest / test)

### Requirements
- [x] **Pre-request** and **Tests** tabs in the request pane
- [x] Edit `item.event[]` with `listen: prerequest` and `listen: test`
- [x] `script.exec[]` ↔ code editor (join/split by `\n`)
- [x] Preserve sibling fields (`id`, `type`, other events)
- [x] Indicator on the tab when the script has content

### Validation
- [x] Save → reopen → identical scripts _(immutable + serialize; `make check-stage7`)_
- [x] Request without `event` gains entries on edit; siblings intact

---

## UX Stage — Desktop shell (required)

The UI must have the density and workflow of a desktop API client, not the look of a
generic form.

### Requirements
- [x] Full window: compact title bar + sidebar + workspace + status bar
- [x] Dense collection sidebar, with hover/selected states and colors by method
- [x] Bar with multiple open request tabs (open, focus, close)
- [x] Dirty state per request, not global — each tab shows its own indicator
- [x] Dragging a request from the tree onto the tab bar opens a new tab
- [x] Long tab names fade at the end instead of truncating with ellipsis
- [x] Session persisted in `~/.clara/session.json` (collections, tabs, expanded)
- [x] Shortcuts: Open/Save/Close tab/Next/Prev/Tab 1–9
- [x] Drag tabs to reorder
- [x] Toolbar method + URL + Send (Newman)
- [x] Inner tabs `Params | Body | Headers | Auth | Pre-request | Tests`
- [x] Light palette (brand orange, neutral surfaces, subtle borders)
- [x] Compact key/value tables, no stacked cards
- [x] Native chrome integrated on macOS (`hiddenInset`)

### Visual validation
- [ ] Main flow usable without vertical scroll between Params/Body/Headers/Auth
- [ ] Clear visual hierarchy: collection → request tab → request toolbar → pane
- [ ] Sidebar and table density adequate for a real collection
- [ ] Open/Save and dirty state easy to locate

---

## Stage 8 — Environments (optional in MVP 1)

May slip to a mini-MVP 1.1 if the rest is delayed.

### Requirements
- [x] Open a separate `.postman_environment.json`
- [x] List `values[]` (key, value, enabled)
- [x] Active environment selector
- [x] (Optional) `{{var}}` preview in the URL — real interpolation stays with Newman

### Validation
- [x] Env from the repo loads and values match Postman
- [x] Env save (if editable) does not corrupt the file

---

## Definition of Done — MVP 1

- [ ] Stages 0–6 completed (7 optional)
- [ ] UX stage validated
- [ ] Flow: open collection from the repo → edit method/URL/headers/body/auth/query → save
- [ ] Readable git diffs; no invented metadata outside the Postman schema
- [ ] Smoke: `newman run <collection.json>` on the edited collection works in the terminal
- [ ] README updated with how to open/save

---

## MVP 2 — Run with Newman

Assumption: `newman` is on the user's `PATH`. Installation help comes later.

### Stage R0 — Send a single request
- [x] **Send** button enabled (shortcut `⌘/Ctrl+Enter`)
- [x] Build a temporary collection with **1 item** (in-memory state, not the repo file)
- [x] Copy `collection.variable` / `collection.auth`; if the request inherits folder auth, materialize it in the temp
- [x] Write under `~/.clara/runs/`, spawn `newman run … --reporters json`
- [x] Repo collection is **not** altered by the run
- [x] Response panel: status, time, size, headers, body
- [x] Newman failures / stderr visible
- [x] `make check-stage8`

### Stage R1 — Collection / folder run
- [x] Clicking the collection opens a tab (Run collection)
- [x] Clicking a folder opens a tab (Run folder via Newman `--folder`)
- [x] Results list per request (status, time, tests)
- [x] Expand request for Body / Headers / Tests
- [x] `-e` with open environment
- [x] Detect missing Newman and guide installation

### Stage R2 — Variables + explorer context menu
- [x] Show/edit `variable[]` on collection and folder tabs (inheritance for child requests)
- [x] Single-request Newman merges variables from collection + ancestor folders
- [x] Right-click in the explorer: collection, folders, and requests
- [x] Actions: Run, Rename, Delete (collection = Close), Duplicate (folder/request)
- [x] Drag requests in the sidebar to reorder or move across folders/collections (before/after guide line; drop on folder middle = into)
- [x] Ordering MVP closed (sibling reorder as moved / drag-to-reorder); further order epics deferred
- [x] Dirty dot on COL / DIR tabs
- [x] Context menu on tabs (New / Duplicate / Close / Reveal)
- [x] `···` button in the explorer + collapse collection
- [x] Expand all / Collapse all in the collection menu
- [x] `make check-stage9`

### Stage R3 — Multiple open collections
- [x] Sidebar lists N open collections; **+** button in the section title opens another
- [x] Opening a collection **adds** — does not close or clear the other collections' tabs
- [x] Reopening the same path only focuses the already-open collection (does not re-read from disk)
- [x] Per-collection UI state (`expanded`, `collectionExpanded`, dirty) in `src/workspace/collectionUi.ts`
- [x] Every tab carries `collectionPath`; `tabKey` encodes the path with `encodeURIComponent`
- [x] Save writes the active tab's collection (fallback: first dirty); only that one's dirty flag is cleared
- [x] Closing a collection (context menu → Close) removes collection, UI state, tabs, and runs — confirms if dirty
- [x] Title bar shows dirty if **any** collection is dirty
- [x] Request runs indexed by `requestRunKey(collectionPath, path)`; scope runs by `tabKey`
- [x] Tree drag onto the tab bar carries `{ collectionPath, path }` in the payload
- [x] `make check-stage10`

### Stage R4 — Environments + sidebar
- [x] Environments section in the sidebar (independent collapse + Collections)
- [x] Resizable sidebar width (220–520px), persisted in the session
- [x] Open/edit/save `.postman_environment.json`; ENV tab; semantic dirty
- [x] Global active environment (persisted); Newman `-e` with in-memory state
- [x] Session v4 (`openedEnvironments`, `activeEnvironmentPath`, `sidebar`)
- [x] `make check-stage11`

### Session v4

`~/.clara/session.json` now stores environments and sidebar layout:

```
{ "version": 4,
  "collections": [ { "path", "expandedPaths", "collectionExpanded" } ],
  "openTabs":    [ { "kind", "collectionPath"|"environmentPath", "path"? } ],
  "activeTabKey": "…",
  "openedEnvironments": [ "…/env.postman_environment.json" ],
  "activeEnvironmentPath": "…"|null,
  "sidebar": { "collectionsExpanded", "environmentsExpanded", "width" } }
```

`Follow active tab` and `Changed only` are in-memory only — they always start off
after relaunch (not restored from `session.json`).

Sessions v1–v3 migrate automatically to v4 (empty environments, default sidebar).
On hydrate, failures reading environments do not block collections.

### Validation
- [x] Result aligned with terminal `newman` for the same request _(parse + temp collection; manual smoke in the UI)_
- [x] Unsaved edits are included in the run (temp uses memory)
- [x] Collection/folder run reports N executions (`make check-stage8`)
- [x] Session v3/v4 persists multiple collections + collection / folder / request / environment tabs
- [x] Variables + tree mutations (`make check-stage9`)
- [x] `tabKey` roundtrip with paths containing `:`, space, `%`, and unicode (`make check-stage10`)
- [x] Environment parse/edit/dirty + v3→v4 migration (`make check-stage11`)

---

## Quick reference — in-memory schema

Source of truth: Postman Collection v2.1.

```
Collection
├── info
├── item[]          # folder | request
│   ├── name
│   ├── item[]?     # folder
│   └── request?    # method, url, header[], body, auth
├── variable[]?
└── auth?
```

UI: split layout, key/value tables, response pane. Store and persistence are Postman-only.
