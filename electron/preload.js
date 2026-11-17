'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  resolveRoom: code => ipcRenderer.invoke('lan:resolve-room', code),
  getLocalInfo: () => ipcRenderer.invoke('lan:local-info'),
  getProfile: () => ipcRenderer.invoke('profile:get'),
  setPlayerId: playerId => ipcRenderer.invoke('profile:set-id', playerId),
  getMatches: limit => ipcRenderer.invoke('profile:matches', limit),
  addMatch: record => ipcRenderer.invoke('profile:add-match', record),
  openPlayerDataFolder: () => ipcRenderer.invoke('profile:open-folder'),
});
