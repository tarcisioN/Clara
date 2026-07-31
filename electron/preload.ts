import { contextBridge, ipcRenderer } from 'electron';
import type { AppCommand } from './commands.ts';
import type { SessionState } from './session.ts';

export type { SessionState, AppCommand };

export type OpenCollectionResult =
  | { canceled: true }
  | { canceled: false; filePath: string; raw: string };

export type ReadCollectionResult = { filePath: string; raw: string };

export type SaveCollectionResult = { ok: true; filePath: string };

const clara = {
  openCollection: (): Promise<OpenCollectionResult> =>
    ipcRenderer.invoke('collection:open'),
  readCollection: (filePath: string): Promise<ReadCollectionResult> =>
    ipcRenderer.invoke('collection:read', filePath),
  saveCollection: (filePath: string, contents: string): Promise<SaveCollectionResult> =>
    ipcRenderer.invoke('collection:save', { filePath, contents }),
  loadSession: (): Promise<SessionState> => ipcRenderer.invoke('session:load'),
  saveSession: (state: SessionState): Promise<SessionState> =>
    ipcRenderer.invoke('session:save', state),
  getSessionHome: (): Promise<string> => ipcRenderer.invoke('session:home'),
  onCommand: (handler: (command: AppCommand) => void): (() => void) => {
    const listener = (_event: unknown, command: AppCommand) => {
      handler(command);
    };
    ipcRenderer.on('app:command', listener);
    return () => {
      ipcRenderer.removeListener('app:command', listener);
    };
  }
};

contextBridge.exposeInMainWorld('clara', clara);

export type ClaraApi = typeof clara;
