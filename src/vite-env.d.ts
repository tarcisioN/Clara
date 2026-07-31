import type { ClaraApi } from '../electron/preload.ts';

declare global {
  interface Window {
    clara: ClaraApi;
  }
}

export {};
