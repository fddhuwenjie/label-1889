// 专业日志系统 - 支持持久化存储
import { LOG_LEVEL } from '../constants';

class Logger {
  constructor() {
    this.logs = [];
    this.maxLogs = 1000;
    this.listeners = [];
    this.storageKey = 'app_logs';
    this.persistEnabled = true;
    
    // 从 localStorage 恢复日志
    this._loadPersistedLogs();
  }

  _loadPersistedLogs() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        // 只保留最近24小时的日志
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        this.logs = parsed.filter(log => new Date(log.timestamp).getTime() > oneDayAgo);
      }
    } catch (e) {
      console.warn('日志恢复失败:', e);
    }
  }

  _persistLogs() {
    if (!this.persistEnabled) return;
    
    try {
      // 只持久化最近的500条日志
      const logsToSave = this.logs.slice(-500);
      localStorage.setItem(this.storageKey, JSON.stringify(logsToSave));
    } catch (e) {
      // localStorage 可能已满，清理旧日志
      if (e.name === 'QuotaExceededError') {
        this.logs = this.logs.slice(-100);
        try {
          localStorage.setItem(this.storageKey, JSON.stringify(this.logs));
        } catch (e2) {
          console.warn('日志持久化失败:', e2);
        }
      }
    }
  }

  _formatMessage(level, message, context = {}) {
    const timestamp = new Date().toISOString();
    const entry = {
      timestamp,
      level,
      message,
      context,
      sessionId: context.sessionId || 'unknown',
    };
    
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    
    // 持久化日志到 localStorage（本地缓存）
    this._persistLogs();

    // 转发到主进程落盘到本地日志目录（Electron 环境下）
    this._forwardToMain(level, message, context);
    
    // 通知监听器
    this.listeners.forEach(listener => listener(entry));
    
    return entry;
  }

  _forwardToMain(level, message, context) {
    try {
      if (window.electronAPI && window.electronAPI.forwardLog) {
        window.electronAPI.forwardLog({ level, message, context });
      }
    } catch (e) {
      // 静默失败，避免循环
    }
  }

  debug(message, context = {}) {
    const entry = this._formatMessage(LOG_LEVEL.DEBUG, message, context);
    console.debug(`[${entry.timestamp}] [DEBUG] ${message}`, context);
    return entry;
  }

  info(message, context = {}) {
    const entry = this._formatMessage(LOG_LEVEL.INFO, message, context);
    console.info(`[${entry.timestamp}] [INFO] ${message}`, context);
    return entry;
  }

  warn(message, context = {}) {
    const entry = this._formatMessage(LOG_LEVEL.WARN, message, context);
    console.warn(`[${entry.timestamp}] [WARN] ${message}`, context);
    return entry;
  }

  error(message, error = null, context = {}) {
    const errorContext = {
      ...context,
      errorMessage: error?.message,
      errorStack: error?.stack,
      errorName: error?.name,
    };
    const entry = this._formatMessage(LOG_LEVEL.ERROR, message, errorContext);
    console.error(`[${entry.timestamp}] [ERROR] ${message}`, errorContext);
    return entry;
  }

  // 添加日志监听器
  addListener(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  // 获取所有日志
  getLogs(level = null) {
    if (level) {
      return this.logs.filter(log => log.level === level);
    }
    return [...this.logs];
  }

  // 导出日志为 JSON
  exportLogs() {
    return JSON.stringify(this.logs, null, 2);
  }

  // 导出日志为文本格式
  exportLogsAsText() {
    return this.logs.map(log => 
      `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message} ${JSON.stringify(log.context)}`
    ).join('\n');
  }

  // 下载日志文件
  downloadLogs(format = 'json') {
    const content = format === 'json' ? this.exportLogs() : this.exportLogsAsText();
    const mimeType = format === 'json' ? 'application/json' : 'text/plain';
    const ext = format === 'json' ? 'json' : 'txt';
    
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `app-logs-${new Date().toISOString().split('T')[0]}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // 清空日志
  clear() {
    this.logs = [];
    try {
      localStorage.removeItem(this.storageKey);
    } catch (e) {
      console.warn('日志清除失败:', e);
    }
  }

  // 启用/禁用持久化
  setPersistEnabled(enabled) {
    this.persistEnabled = enabled;
  }
}

// 单例导出
export const logger = new Logger();
export default logger;
