# Clara — Epic: Git compare

Goal: help review Postman collection changes between the **current branch / working tree** and a **base ref** (`main`/`master` by default, or any selected branch/tag/commit). The UI should show *where* the API changed (request / folder / field), not a raw multi-thousand-line JSON diff.

**Out of scope for this epic:** in-app merge/rebase, conflict resolution, commit/push, blame history, treating scripts as a generic code IDE.

**How this relates to dirty state:** unsaved edits vs the on-disk file stay as today (`originalRaw` / `computeDirtyState`). Git compare is a separate layer against a chosen ref.

**How to mark progress:** when a requirement + validation is done, change `- [ ]` to `- [x]`.

---

## Stage G0 — Repo + base + load at ref

Detect whether an open collection lives in a git repo, resolve a default base, and load that file’s contents at a given ref.

### Requirements
- [x] Given an absolute collection path, find the git repo root (or report not-in-repo)
- [x] Resolve a relative path from repo root to the collection file
- [x] Detect current branch (when not detached)
- [x] Resolve default base: `origin/HEAD` → local `main` → local `master`
- [x] List local/remote branch names for later UI selection
- [x] Read collection JSON at `ref:relPath` via `git show` (no checkout)
- [x] Expose via Electron IPC (`git:discover`, `git:readAtRef`) + `window.clara`
- [x] Keep git context separate from `LoadedCollection.originalRaw`

### Validation
- [x] Temp git repo fixture: discover returns root, relPath, defaultBase
- [x] `git show main:…` bytes match the committed collection at that ref
- [x] Path outside a repo → `inRepo: false` (no throw)
- [x] Missing path at ref → clear error
- [x] `make check-stage12`

### Policy (this stage)
- Always read refs with `git show`; never mutate the working tree for compare.
- Default base prefers the remote’s default branch name, then `main`, then `master`.
- No compare UI yet — plumbing only (renderer helper may exist unused by chrome).

---

## Stage G1 — Tree markers + Changed only

Show structural change status in the collection explorer against the selected base.

### Requirements
- [x] Compute a structural diff of `item[]` trees (added / removed / modified / unchanged)
- [x] Markers on folders and requests in the sidebar
- [x] Folder badge / count of changed descendants
- [x] Toggle **Changed only** (hide unchanged nodes)
- [x] Auto-expand paths that contain changes
- [x] Status cue: `comparing vs <base> · N changed`

### Validation
- [x] Fixture: added request, removed request, edited method/URL → correct markers
- [x] Unchanged siblings hidden when Changed only is on
- [x] Folder with only nested changes still shows as has-changes in the tree (descendant badge); Changes list omits the folder unless its own meta changed
- [x] `make check-stage13`

### Policy (this stage)
- Match siblings by `kind + name` within each parent (duplicate names match in order).
- Removed items appear as struck-through ghost rows under their parent (not editable).
- Compare uses the working in-memory collection vs the cached base blob from G0 (`defaultBase`).
- Unsaved dirty dots remain independent of git markers.

---

## Stage G2 — Semantic request diff

When a changed request is open, show field-level differences vs the base version.

### Requirements
- [x] Load base request by stable identity (prefer path + name; document fallback)
- [x] Diff panes / indicators for: method, URL, query, headers, body, auth, scripts
- [x] Inner tabs (Params / Body / …) show a badge when that section differs
- [x] Unchanged sections remain readable (not a wall of red/green)
- [x] Body/scripts: structured or line diff only within that field

### Validation
- [x] Edit only headers → Headers tab badged; Body not
- [x] Base missing request (added) → clear “new in current” empty state
- [x] Request removed from current → reachable from change list (G3) as removed

### Policy (this stage)
- Resolve base via the same kind+name pairing as G1 (`findPairedBaseItem`), not raw path indexes alone.
- Section badges are amber `~` (distinct from content dots and unsaved dirty dots).
- Inline body/script line diffs are in G6 (`RequestDiffPane`); equality here remains per-section snapshot.
- Removed requests stay ghost-only until G3.

---

## Stage G3 — Change list + navigation

A navigable index of all collection changes.

### Requirements
- [x] Panel or section listing changed requests/folders (grouped by folder path)
- [x] Folders appear in the list only when the folder itself changed (name / variables / auth / events); nested-only folders are group headers, not rows
- [x] Sibling reorder (same content, new index) appears as **moved** (`↕`) with `#from → #to`
- [x] Counts: added / removed / modified / moved
- [x] Click → open/focus that node and show its diff (G2)
- [x] Ordering epic closed for MVP (sidebar request drag + moved markers)

### Validation
- [x] Order is stable and matches tree order
- [x] Next/prev wraps or stops at ends (document behavior)
- [x] Works with Changed only filter on

### Policy (this stage)
- Change list order matches CollectionTree DFS (current nodes, then removed ghosts under each parent).
- Next/prev **wraps** (same as tab cycling).
- Removed entries focus the ghost row in the tree (parent expanded); G2 request pane still N/A for removed.
- Changed only filters the tree only; the Changes panel always lists all changes.
- Ordering beyond sibling moved + request drag (cross-folder identity, Order Diff, folder drag) is out of scope for this epic.

---

## Stage G4 — Base selector + working tree vs HEAD

Let the user pick what to compare, and clarify dirty vs committed.

### Requirements
- [x] UI to select base: branches, remotes, (optional) tags / commit SHA
- [x] Remember last base per repo (session or `~/.clara`)
- [x] Distinguish:
  - unsaved edits vs disk (existing dirty dots)
  - disk/HEAD vs selected base (compare markers)
- [x] Optional toggle: compare **working tree (incl. unsaved)** vs **last saved file** against base
- [x] Refresh when git HEAD or file on disk changes (manual refresh acceptable first)

### Validation
- [x] Switching base recomputes markers without reopening the collection
- [x] Detached HEAD still allows selecting an explicit base
- [x] Invalid ref → error message, previous compare state cleared or kept (document)

### Policy (this stage)
- Base preference is stored in `session.compareBases[repoRoot]`.
- Invalid selected refs fall back to `defaultBase` and surface an error status; previous markers are replaced only after a successful load.
- **Working** compares the in-memory collection (includes unsaved edits); **Saved** compares `originalRaw`.
- Manual **↻** re-reads the selected base via `git show`.

---

## Stage G5 — Restore from base + environments

Act on the comparison.

### Requirements
- [x] Restore one field / whole request / folder subtree from base (confirm dialog)
- [x] Restore creates an in-memory edit (dirty); Save still writes the working file
- [x] Environments: same discover/read-at-ref; markers for added/removed/changed values
- [x] Collection / folder variables included in structural + semantic diff

### Validation
- [x] Restore request from base → semantic equality with base; collection dirty
- [x] Env var changed only in value → marked modified, not removed+added
- [x] Restore does not run `git checkout`

### Policy (this stage)
- Restore copies base JSON into the in-memory collection/environment; never `git checkout` / index writes.
- Environment + collection/folder variable matching is **key-based** (duplicate keys match in order); value-only edits are `modified`.
- Confirm before restore; after restore the file is dirty until Save.

---

## Stage G6 — Request Diff pane

Read-only field-level comparison when opening a change from the Changes list.

### Requirements
- [x] Click a changed request in Changes → open request in **Diff** mode (replaces Edit)
- [x] Toggle **Edit | Diff** on the request pane
- [x] Method + URL: stacked base (red) / current (green) bars
- [x] Params / headers / auth: paired keyed rows (added / removed / modified)
- [x] Body (raw) and scripts: unified line diff
- [x] Body mode change: explicit mode-change block
- [x] Restore section / request from Diff
- [x] Tree click opens **Edit** (default)
- [x] Removed request from Changes → base-only Diff (no Edit)
- [x] **Show unchanged** toggle for keyed rows
- [x] Next/prev change keeps Diff mode
- [x] Character-level highlight inside modified URL/values and paired body/script lines
- [x] Shared keyed Diff UI for environment values and collection/folder variables (Edit | Diff)

### Validation
- [x] `make check-stage19` — textDiff + keyedValueDiff + requestFieldDiff fixtures

### Policy (this stage)
- Diff is read-only; editing stays in RequestPane.
- No third-party diff dependency (local LCS line diff).
- View mode is ephemeral (not persisted in session).

---

## Definition of Done — Epic

- [x] Stages G0–G6 complete
- [x] Large real collection: find changed requests without reading raw `git diff`
- [x] Default base works on repos whose default branch is `main` or `master`
- [x] No accidental writes to git index/working tree from compare features
- [x] README documents Compare mode briefly
- [x] Stage checks green (`make check` includes new git stages)

---

## Quick reference — compare model

```
Working tree file  ←→  LoadedCollection (may be dirty vs originalRaw)
        ↓ compare
   Base ref blob   ←── git show <ref>:<relPath>
        ↓
 StructuralDiff (tree markers) + SemanticDiff (per request fields)
        ↓
 RequestFieldDiff → Diff pane (stacked / keyed / unified)
```

Identity for matching nodes across versions (G1+): prefer `item` path when trees align; when reordered/renamed, fall back to heuristics documented in the stage that introduces matching.
