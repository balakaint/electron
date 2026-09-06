import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  healthCheck: () => ipcRenderer.invoke('health-check'),
  request: (method: string, path: string, body?: unknown) =>
    ipcRenderer.invoke('api-request', { method, path, body }),
  exportSave: (files: { filename: string; content: string }[]) =>
    ipcRenderer.invoke('export-save', { files }),
  pickFile: () => ipcRenderer.invoke('pick-file'),
  openPath: (filePath: string) => ipcRenderer.invoke('open-path', filePath),
  pickImage: () => ipcRenderer.invoke('pick-image'),
  readImage: (filePath: string) => ipcRenderer.invoke('read-image', filePath),
  setPanelLayout: (layout: 'full' | 'compact') => ipcRenderer.invoke('set-panel-layout', layout),
});
