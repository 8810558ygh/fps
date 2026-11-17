'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  resolveRoom: code => ipcRenderer.invoke('lan:resolve-room', code),
  getLocalInfo: () => ipcRenderer.invoke('lan:local-info'),
});
