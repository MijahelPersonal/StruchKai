import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld(
  'desktopInfo',
  Object.freeze({ platform: process.platform }),
);

contextBridge.exposeInMainWorld(
  'struchkaiCatalog',
  Object.freeze({
    run: (action: string, input?: unknown) =>
      ipcRenderer.invoke('struchkai:catalog', action, input),
  }),
);

contextBridge.exposeInMainWorld(
  'struchkaiAuth',
  Object.freeze({
    run: (action: string, value?: unknown) =>
      ipcRenderer.invoke('struchkai:auth', action, value),
  }),
);
