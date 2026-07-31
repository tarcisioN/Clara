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
- [x] Folder with only nested changes still shows as modified/has-changes
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
- [ ] Load base request by stable identity (prefer path + name; document fallback)
- [ ] Diff panes / indicators for: method, URL, query, headers, body, auth, scripts
- [ ] Inner tabs (Params / Body / …) show a badge when that section differs
- [ ] Unchanged sections remain readable (not a wall of red/green)
- [ ] Body/scripts: structured or line diff only within that field

### Validation
- [ ] Edit only headers → Headers tab badged; Body not
- [ ] Base missing request (added) → clear “new in current” empty state
- [ ] Request removed from current → reachable from change list (G3) as removed

---

## Stage G3 — Change list + navigation

A navigable index of all collection changes.

### Requirements
- [ ] Panel or section listing changed requests/folders (grouped by folder path)
- [ ] Click → open/focus that node and show its diff (G2)
- [ ] Shortcuts: next / previous change
- [ ] Counts: added / removed / modified

### Validation
- [ ] Order is stable and matches tree order
- [ ] Next/prev wraps or stops at ends (document behavior)
- [ ] Works with Changed only filter on

---

## Stage G4 — Base selector + working tree vs HEAD

Let the user pick what to compare, and clarify dirty vs committed.

### Requirements
- [ ] UI to select base: branches, remotes, (optional) tags / commit SHA
- [ ] Remember last base per repo (session or `~/.clara`)
- [ ] Distinguish:
  - unsaved edits vs disk (existing dirty dots)
  - disk/HEAD vs selected base (compare markers)
- [ ] Optional toggle: compare **working tree (incl. unsaved)** vs **last saved file** against base
- [ ] Refresh when git HEAD or file on disk changes (manual refresh acceptable first)

### Validation
- [ ] Switching base recomputes markers without reopening the collection
- [ ] Detached HEAD still allows selecting an explicit base
- [ ] Invalid ref → error message, previous compare state cleared or kept (document)

---

## Stage G5 — Restore from base + environments

Act on the comparison.

### Requirements
- [ ] Restore one field / whole request / folder subtree from base (confirm dialog)
- [ ] Restore creates an in-memory edit (dirty); Save still writes the working file
- [ ] Environments: same discover/read-at-ref; markers for added/removed/changed values
- [ ] Collection / folder variables included in structural + semantic diff

### Validation
- [ ] Restore request from base → semantic equality with base; collection dirty
- [ ] Env var changed only in value → marked modified, not removed+added
- [ ] Restore does not run `git checkout`

---

## Definition of Done — Epic

- [ ] Stages G0–G3 complete (G4–G5 may land as follow-ups if scoped)
- [ ] Large real collection: find changed requests without reading raw `git diff`
- [ ] Default base works on repos whose default branch is `main` or `master`
- [ ] No accidental writes to git index/working tree from compare features
- [ ] README documents Compare mode briefly
- [ ] Stage checks green (`make check` includes new git stages)

---

## Quick reference — compare model

```
Working tree file  ←→  LoadedCollection (may be dirty vs originalRaw)
        ↓ compare
   Base ref blob   ←── git show <ref>:<relPath>
        ↓
 StructuralDiff (tree markers) + SemanticDiff (per request fields)
```

Identity for matching nodes across versions (G1+): prefer `item` path when trees align; when reordered/renamed, fall back to heuristics documented in the stage that introduces matching.
