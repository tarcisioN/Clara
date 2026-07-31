import { contextBridge, ipcRenderer } from 'electron';
import type { AppCommand } from './commands.ts';
import type { SessionState } from './session.ts';
import type { NewmanRunView } from '../src/newman/parseResult.ts';
import type { GitDiscoverResult, GitReadAtRefResult } from './git.ts';

export type { SessionState, AppCommand, NewmanRunView, GitDiscoverResult, GitReadAtRefResult };

export type OpenCollectionResult =
  | { canceled: true }
  | { canceled: false; files: Array<{ filePath: string; raw: string }> };

export type OpenEnvironmentResult =
  | { canceled: true }
  | { canceled: false; files: Array<{ filePath: string; raw: string }> };

export type ReadCollectionResult = { filePath: string; raw: string };

export type ReadEnvironmentResult = { filePath: string; raw: string };

export type SaveCollectionResult = { ok: true; filePath: string };

export type SaveEnvironmentResult = { ok: true; filePath: string };

const clara = {
  openCollection: (): Promise<OpenCollectionResult> =>
    ipcRenderer.invoke('collection:open'),
  readCollection: (filePath: string): Promise<ReadCollectionResult> =>
    ipcRenderer.invoke('collection:read', filePath),
  saveCollection: (filePath: string, contents: string): Promise<SaveCollectionResult> =>
    ipcRenderer.invoke('collection:save', { filePath, contents }),
  openEnvironment: (): Promise<OpenEnvironmentResult> =>
    ipcRenderer.invoke('environment:open'),
  readEnvironment: (filePath: string): Promise<ReadEnvironmentResult> =>
    ipcRenderer.invoke('environment:read', filePath),
  saveEnvironment: (
    filePath: string,
    contents: string
  ): Promise<SaveEnvironmentResult> =>
    ipcRenderer.invoke('environment:save', { filePath, contents }),
  loadSession: (): Promise<SessionState> => ipcRenderer.invoke('session:load'),
  saveSession: (state: SessionState): Promise<SessionState> =>
    ipcRenderer.invoke('session:save', state),
  getSessionHome: (): Promise<string> => ipcRenderer.invoke('session:home'),
  runNewman: (
    collectionJson: string,
    options?: { folder?: string; environmentJson?: string }
  ): Promise<NewmanRunView> =>
    ipcRenderer.invoke('newman:run', {
      collectionJson,
      folder: options?.folder,
      environmentJson: options?.environmentJson
    }),
  discoverGit: (collectionPath: string): Promise<GitDiscoverResult> =>
    ipcRenderer.invoke('git:discover', collectionPath),
  readCollectionAtRef: (
    collectionPath: string,
    ref: string
  ): Promise<GitReadAtRefResult> =>
    ipcRenderer.invoke('git:readAtRef', { collectionPath, ref }),
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
