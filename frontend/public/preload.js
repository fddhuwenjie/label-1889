const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFile: (fileType) => ipcRenderer.invoke('select-file', fileType),
  processData: (params) => ipcRenderer.invoke('process-data', params),
  pauseProcess: () => ipcRenderer.invoke('pause-process'),
  abortProcess: () => ipcRenderer.invoke('abort-process'),
  rollback: (params) => ipcRenderer.invoke('rollback', params),
  checkCheckpoint: (sessionId) => ipcRenderer.invoke('check-checkpoint', sessionId),
  listCheckpoints: () => ipcRenderer.invoke('list-checkpoints'),
  listBackups: (sessionId) => ipcRenderer.invoke('list-backups', sessionId),
  saveResult: (params) => ipcRenderer.invoke('save-result', params),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  cleanupBackups: () => ipcRenderer.invoke('cleanup-backups'),
  showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),
  parseDroppedFile: (fileType, filePath) => ipcRenderer.invoke('parse-dropped-file', fileType, filePath),

  // 渲染进程日志转发到主进程（统一落盘到本地日志目录）
  forwardLog: (entry) => ipcRenderer.invoke('forward-log', entry),

  // 监听处理进度
  onProcessProgress: (callback) => {
    ipcRenderer.on('process-progress', (_, progress) => callback(progress));
    return () => ipcRenderer.removeAllListeners('process-progress');
  },

  // 监听文件解析进度（上传阶段实时反馈）
  onFileParseProgress: (callback) => {
    ipcRenderer.on('file-parse-progress', (_, progress) => callback(progress));
    return () => ipcRenderer.removeAllListeners('file-parse-progress');
  },

  isElectron: true
});
