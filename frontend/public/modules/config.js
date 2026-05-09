// Electron 应用配置常量
const APP_CONFIG = {
  SUPPORTED_FORMATS: ['.csv', '.xlsx', '.xls'],
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  PROCESS_TIMEOUT: 5 * 60 * 1000,   // 5分钟
  BACKUP_RETENTION_DAYS: 7,
  BATCH_SIZE: 1000,
  CHECKPOINT_INTERVAL: 100,
};

module.exports = APP_CONFIG;
