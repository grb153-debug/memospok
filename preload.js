// 렌더러(index.html) ↔ 메인 프로세스 안전한 다리
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widget', {
  setExpanded: (expanded) => ipcRenderer.send('set-expanded', !!expanded),
  loadMemos:   () => ipcRenderer.invoke('memos:load'),
  saveMemos:   (list) => ipcRenderer.invoke('memos:save', list),
  getAutoLaunch: () => ipcRenderer.invoke('autolaunch:get'),
  setAutoLaunch: (enable) => ipcRenderer.invoke('autolaunch:set', !!enable),

  // 자동 업데이트: 메인 프로세스가 보내는 상태를 화면이 받아 표시
  onUpdateStatus: (cb) => ipcRenderer.on('update:status', (_e, data) => cb(data)),
  installUpdate: () => ipcRenderer.send('update:install'),
});
