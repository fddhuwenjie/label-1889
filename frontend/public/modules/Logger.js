// Electron 主进程日志系统
const fs = require('fs-extra');
const path = require('path');

// 日志轮转配置
const LOG_CONFIG = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 单个日志文件最大 10MB
  MAX_FILES: 10, // 最多保留 10 个日志文件
  MAX_AGE_DAYS: 30, // 日志文件最多保留 30 天
};

class Logger {
  constructor(logDir) {
    this.logDir = logDir;
    this.currentLogFile = null;
    this.currentFileSize = 0;
    this._initLogFile();
    this._cleanOldLogs();
  }

  _initLogFile() {
    const date = new Date().toISOString().split('T')[0];
    this.currentLogFile = path.join(this.logDir, `app-${date}.log`);
    
    // 获取当前文件大小
    try {
      if (fs.existsSync(this.currentLogFile)) {
        const stats = fs.statSync(this.currentLogFile);
        this.currentFileSize = stats.size;
      } else {
        this.currentFileSize = 0;
      }
    } catch (e) {
      this.currentFileSize = 0;
    }
  }

  /**
   * 日志轮转 - 当文件超过大小限制时创建新文件
   */
  _rotateIfNeeded() {
    if (this.currentFileSize >= LOG_CONFIG.MAX_FILE_SIZE) {
      const date = new Date().toISOString().split('T')[0];
      const timestamp = Date.now();
      const rotatedFile = path.join(this.logDir, `app-${date}-${timestamp}.log`);
      
      try {
        // 重命名当前文件
        if (fs.existsSync(this.currentLogFile)) {
          fs.renameSync(this.currentLogFile, rotatedFile);
        }
        this.currentFileSize = 0;
        console.log(`日志文件已轮转: ${rotatedFile}`);
      } catch (e) {
        console.error('日志轮转失败:', e);
      }
    }
  }

  /**
   * 清理旧日志文件
   */
  _cleanOldLogs() {
    try {
      if (!fs.existsSync(this.logDir)) {
        return;
      }

      const files = fs.readdirSync(this.logDir)
        .filter(f => f.startsWith('app-') && f.endsWith('.log'))
        .map(f => ({
          name: f,
          path: path.join(this.logDir, f),
          stat: fs.statSync(path.join(this.logDir, f)),
        }))
        .sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime());

      const now = Date.now();
      const maxAge = LOG_CONFIG.MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
      let deletedCount = 0;

      files.forEach((file, index) => {
        const age = now - file.stat.mtime.getTime();
        
        // 删除超过最大数量或超过最大保留天数的文件
        if (index >= LOG_CONFIG.MAX_FILES || age > maxAge) {
          try {
            fs.unlinkSync(file.path);
            deletedCount++;
          } catch (e) {
            console.error(`删除旧日志文件失败: ${file.name}`, e);
          }
        }
      });

      if (deletedCount > 0) {
        console.log(`已清理 ${deletedCount} 个旧日志文件`);
      }
    } catch (e) {
      console.error('清理旧日志失败:', e);
    }
  }

  _write(level, message, context = {}) {
    // 检查是否需要轮转
    this._rotateIfNeeded();
    
    // 检查日期是否变化，需要切换到新的日志文件
    const date = new Date().toISOString().split('T')[0];
    const expectedFile = path.join(this.logDir, `app-${date}.log`);
    if (this.currentLogFile !== expectedFile) {
      this.currentLogFile = expectedFile;
      this.currentFileSize = 0;
      // 日期变化时也清理旧日志
      this._cleanOldLogs();
    }

    const timestamp = new Date().toISOString();
    const entry = {
      timestamp,
      level,
      message,
      ...context,
    };
    
    const logLine = JSON.stringify(entry) + '\n';
    
    try {
      fs.appendFileSync(this.currentLogFile, logLine);
      this.currentFileSize += Buffer.byteLength(logLine, 'utf8');
    } catch (e) {
      console.error('日志写入失败:', e);
    }
    
    const consoleMethod = level === 'error' ? console.error : 
                          level === 'warn' ? console.warn : console.log;
    consoleMethod(`[${timestamp}] [${level.toUpperCase()}] ${message}`, context);
  }

  debug(message, context = {}) { this._write('debug', message, context); }
  info(message, context = {}) { this._write('info', message, context); }
  warn(message, context = {}) { this._write('warn', message, context); }
  error(message, error = null, context = {}) {
    this._write('error', message, {
      ...context,
      errorName: error?.name,
      errorType: error?.constructor?.name,
      errorMessage: error?.message,
      errorStack: error?.stack,
    });
  }

  /**
   * 手动触发日志清理
   */
  cleanup() {
    this._cleanOldLogs();
  }

  /**
   * 获取日志统计信息
   */
  getStats() {
    try {
      const files = fs.readdirSync(this.logDir)
        .filter(f => f.startsWith('app-') && f.endsWith('.log'));
      
      let totalSize = 0;
      files.forEach(f => {
        const stat = fs.statSync(path.join(this.logDir, f));
        totalSize += stat.size;
      });

      return {
        fileCount: files.length,
        totalSize,
        currentFile: this.currentLogFile,
        currentFileSize: this.currentFileSize,
      };
    } catch (e) {
      return null;
    }
  }
}

module.exports = Logger;
