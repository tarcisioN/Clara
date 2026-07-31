import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';

export type FileChangeNotifier = (filePaths: string[]) => void;

/**
 * Watch directories rather than files: editors and `git checkout` replace files
 * through rename, which drops a per-file watch after the first change.
 */
export function groupByDirectory(filePaths: string[]): Map<string, Set<string>> {
  const byDirectory = new Map<string, Set<string>>();
  for (const filePath of filePaths) {
    if (!filePath) {
      continue;
    }
    const absolute = path.resolve(filePath);
    const directory = path.dirname(absolute);
    const names = byDirectory.get(directory) ?? new Set<string>();
    names.add(path.basename(absolute));
    byDirectory.set(directory, names);
  }
  return byDirectory;
}

export class WorkspaceFileWatcher {
  private watchers = new Map<string, FSWatcher>();
  private names = new Map<string, Set<string>>();
  private pending = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private notify: FileChangeNotifier;
  private debounceMs: number;

  constructor(notify: FileChangeNotifier, debounceMs = 120) {
    this.notify = notify;
    this.debounceMs = debounceMs;
  }

  /** Replace the watched set; directories no longer needed are released. */
  setFiles(filePaths: string[]): void {
    const grouped = groupByDirectory(filePaths);

    for (const [directory, watcher] of this.watchers) {
      if (!grouped.has(directory)) {
        watcher.close();
        this.watchers.delete(directory);
        this.names.delete(directory);
      }
    }

    for (const [directory, names] of grouped) {
      this.names.set(directory, names);
      if (this.watchers.has(directory)) {
        continue;
      }
      try {
        const watcher = watch(directory, (_eventType, fileName) => {
          if (!fileName) {
            // Some platforms omit the name; re-check everything in this directory.
            for (const name of this.names.get(directory) ?? []) {
              this.queue(path.join(directory, name));
            }
            return;
          }
          const name = path.basename(fileName.toString());
          if (this.names.get(directory)?.has(name)) {
            this.queue(path.join(directory, name));
          }
        });
        watcher.on('error', () => {
          watcher.close();
          this.watchers.delete(directory);
        });
        this.watchers.set(directory, watcher);
      } catch {
        // Directory may be gone; nothing to watch.
      }
    }
  }

  close(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending.clear();
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    this.names.clear();
  }

  /** Coalesce the burst of events a single save produces into one notification. */
  private queue(filePath: string): void {
    this.pending.add(filePath);
    if (this.timer) {
      return;
    }
    this.timer = setTimeout(() => {
      const paths = [...this.pending];
      this.pending.clear();
      this.timer = null;
      if (paths.length > 0) {
        this.notify(paths);
      }
    }, this.debounceMs);
  }
}
