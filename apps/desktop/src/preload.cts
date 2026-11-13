import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld(
  'desktopInfo',
  Object.freeze({ platform: process.platform }),
);

contextBridge.exposeInMainWorld(
  'struchkaiAuth',
  Object.freeze({
    run: (action: string, value?: unknown) =>
      ipcRenderer.invoke('struchkai:auth', action, value),
  }),
);
