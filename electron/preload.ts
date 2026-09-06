import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  healthCheck: () => ipcRenderer.invoke('health-check'),
  request: (method: string, path: string, body?: unknown) =>
    ipcRenderer.invoke('api-request', { method, path, body }),
  exportSave: (files: { filename: string; content: string }[]) =>
    ipcRenderer.invoke('export-save', { files }),
});
