const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');

let mainWindow;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// 应用数据目录 — 备份与检查点统一归档到 backups 目录
const appDataPath = app.getPath('userData');
const backupDir = path.join(appDataPath, 'backups');
const logDir = path.join(appDataPath, 'logs');
const checkpointDir = path.join(backupDir, 'checkpoints'); // 统一到 backups 下

fs.ensureDirSync(backupDir);
fs.ensureDirSync(logDir);
fs.ensureDirSync(checkpointDir);

// ============ 加载模块化组件 ============
const Logger = require('./modules/Logger');
const BackupManager = require('./modules/BackupManager');
const CheckpointManager = require('./modules/CheckpointManager');
const ElectronDataProcessor = require('./modules/ElectronDataProcessor');
const ResultSaver = require('./modules/ResultSaver');
const APP_CONFIG = require('./modules/config');

const logger = new Logger(logDir);
const checkpointManager = new CheckpointManager(checkpointDir, logger);
const backupManager = new BackupManager(backupDir, APP_CONFIG, logger);
const dataProcessor = new ElectronDataProcessor(APP_CONFIG, backupManager, checkpointManager, logger);
const resultSaver = new ResultSaver(logger);

// ============ 窗口创建 ============
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: '离线数据处理器'
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../build/index.html'));
  }

  logger.info('应用窗口已创建');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});


// ============ IPC: 文件选择（带实时解析进度回传） ============
ipcMain.handle('select-file', async (event, fileType) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: '表格文件', extensions: ['csv', 'xlsx', 'xls'] }
    ],
    title: `选择${fileType === 'A' ? '源数据文件(A)' : '目标文件(B)'}`
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, message: '未选择文件' };
  }

  try {
    const filePath = result.filePaths[0];

    // 通过 IPC 实时回传解析进度
    const onParseProgress = (progress) => {
      event.sender.send('file-parse-progress', { fileType, ...progress });
    };

    const parsed = await dataProcessor.parseFileWithProgress(filePath, onParseProgress);
    logger.info('文件已选择', { fileType, fileName: parsed.fileName });

    // 大文件优化：仅向渲染进程发送预览数据，减少 IPC 传输量
    const PREVIEW_LIMIT = 500;
    const responseData = parsed.data.length > PREVIEW_LIMIT
      ? parsed.data.slice(0, PREVIEW_LIMIT)
      : parsed.data;
    const totalRows = parsed.data.length;

    return { 
      success: true, 
      data: responseData,
      columns: parsed.columns,
      fileName: parsed.fileName,
      filePath: parsed.filePath,
      totalRows,
      isPreview: parsed.data.length > PREVIEW_LIMIT,
    };
  } catch (error) {
    logger.error('文件选择失败', error);
    return { success: false, message: error.message };
  }
});

// ============ IPC: 拖拽文件解析（使用磁盘绝对路径） ============
ipcMain.handle('parse-dropped-file', async (event, fileType, filePath) => {
  try {
    const onParseProgress = (progress) => {
      event.sender.send('file-parse-progress', { fileType, ...progress });
    };

    const parsed = await dataProcessor.parseFileWithProgress(filePath, onParseProgress);
    logger.info('拖拽文件已解析', { fileType, fileName: parsed.fileName });

    // 大文件优化：仅向渲染进程发送预览数据
    const PREVIEW_LIMIT = 500;
    const responseData = parsed.data.length > PREVIEW_LIMIT
      ? parsed.data.slice(0, PREVIEW_LIMIT)
      : parsed.data;
    const totalRows = parsed.data.length;

    return { 
      success: true, 
      data: responseData,
      columns: parsed.columns,
      fileName: parsed.fileName,
      filePath: parsed.filePath,
      totalRows,
      isPreview: parsed.data.length > PREVIEW_LIMIT,
    };
  } catch (error) {
    logger.error('拖拽文件解析失败', error);
    return { success: false, message: error.message };
  }
});

// ============ IPC: 数据处理 ============
ipcMain.handle('process-data', async (event, params) => {
  const onProgress = (progress) => {
    event.sender.send('process-progress', progress);
  };

  const result = await dataProcessor.process(params, onProgress);

  if (result.success) {
    resultSaver.cacheProcessResult(result);
    delete result._originalWorkbook;
    delete result._originalWorksheet;
    delete result._originalSheetName;
    delete result._originalColumns;
  }

  return result;
});

// ============ IPC: 暂停处理（区别于 abort） ============
ipcMain.handle('pause-process', async () => {
  dataProcessor.pause();
  return { success: true };
});

ipcMain.handle('abort-process', async () => {
  dataProcessor.abort();
  return { success: true };
});

ipcMain.handle('rollback', async (_, params) => {
  const { sessionId, originalPath } = params;
  return dataProcessor.rollback(sessionId, originalPath);
});

ipcMain.handle('check-checkpoint', async (_, sessionId) => {
  const hasCheckpoint = await checkpointManager.hasCheckpoint(sessionId);
  let checkpoint = null;
  if (hasCheckpoint) {
    checkpoint = await checkpointManager.loadCheckpoint(sessionId);
  }
  return { hasCheckpoint, checkpoint };
});

// ============ IPC: 列出所有可用检查点（跨 session 恢复） ============
ipcMain.handle('list-checkpoints', async () => {
  return checkpointManager.listAllCheckpoints();
});

ipcMain.handle('list-backups', async (_, sessionId) => {
  return backupManager.listBackups(sessionId);
});

// ============ IPC: 在文件管理器中显示文件 ============
ipcMain.handle('show-item-in-folder', async (_, filePath) => {
  shell.showItemInFolder(filePath);
  return { success: true };
});


// ============ IPC: 保存结果文件 ============
ipcMain.handle('save-result', async (_, params) => {
  const { data, format, originalFileName, fileAName, selectedColumns = [] } = params;
  
  const defaultFileName = resultSaver.generateDefaultFileName(originalFileName, fileAName);

  const filters = format === 'csv' 
    ? [{ name: 'CSV文件', extensions: ['csv'] }]
    : [{ name: 'Excel文件', extensions: ['xlsx'] }];

  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultFileName,
    filters,
    title: '保存处理结果'
  });

  if (result.canceled) {
    return { success: false, message: '取消保存' };
  }

  return resultSaver.save(result.filePath, data, format, selectedColumns);
});

ipcMain.handle('get-app-info', () => {
  return {
    supportedFormats: APP_CONFIG.SUPPORTED_FORMATS,
    maxFileSize: APP_CONFIG.MAX_FILE_SIZE,
    backupDir,
    logDir,
    checkpointDir,
    processTimeout: APP_CONFIG.PROCESS_TIMEOUT,
    backupRetentionDays: APP_CONFIG.BACKUP_RETENTION_DAYS,
  };
});

ipcMain.handle('cleanup-backups', async () => {
  await backupManager.cleanupOldBackups();
  return { success: true };
});

// ============ IPC: 渲染进程日志转发（统一落盘到本地日志目录） ============
ipcMain.handle('forward-log', async (_, entry) => {
  const { level, message, context } = entry;
  switch (level) {
    case 'error':
      logger._write('error', `[renderer] ${message}`, context || {});
      break;
    case 'warn':
      logger._write('warn', `[renderer] ${message}`, context || {});
      break;
    case 'debug':
      logger._write('debug', `[renderer] ${message}`, context || {});
      break;
    default:
      logger._write('info', `[renderer] ${message}`, context || {});
  }
  return { success: true };
});
