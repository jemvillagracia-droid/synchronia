// Exposes a small, explicit set of native capabilities to the SYNCHRONIA window.
const { contextBridge, ipcRenderer } = require('electron');

const info = ipcRenderer.sendSync('synchronia:info');

contextBridge.exposeInMainWorld('synchronia', {
  isDesktop: true,
  platform: info.platform,
  version: info.version,
  dataDir: info.dataDir,
  pickFile: () => ipcRenderer.invoke('synchronia:pick-file'),
  openPath: (p) => ipcRenderer.invoke('synchronia:open-path', String(p)),
  openExternal: (url) => ipcRenderer.invoke('synchronia:open-external', String(url)),
  showDataFolder: () => ipcRenderer.invoke('synchronia:show-data-folder'),
  showItemInFolder: (p) => ipcRenderer.invoke('synchronia:show-item', String(p)),
  relaunch: () => ipcRenderer.invoke('synchronia:relaunch'),
  onDownload: (cb) => {
    const listener = (_e, info) => cb(info);
    ipcRenderer.on('synchronia:download', listener);
    return () => ipcRenderer.removeListener('synchronia:download', listener);
  },
});
