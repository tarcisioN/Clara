import { contextBridge, ipcRenderer } from 'electron';

export type OpenCollectionResult =
  | { canceled: true }
  | { canceled: false; filePath: string; raw: string };

export type SaveCollectionResult = { ok: true; filePath: string };

const clara = {
  openCollection: (): Promise<OpenCollectionResult> =>
    ipcRenderer.invoke('collection:open'),
  saveCollection: (filePath: string, contents: string): Promise<SaveCollectionResult> =>
    ipcRenderer.invoke('collection:save', { filePath, contents })
};

contextBridge.exposeInMainWorld('clara', clara);

export type ClaraApi = typeof clara;
