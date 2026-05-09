// Electron 备份管理模块
const fs = require('fs-extra');
const path = require('path');

class BackupManager {
  constructor(backupDir, config, logger) {
    this.backupDir = backupDir;
    this.config = config;
    this.logger = logger;
    this.cleanupOldBackups();
  }

  async createBackup(filePath, sessionId) {
    const backupSessionDir = path.join(this.backupDir, sessionId);
    await fs.ensureDir(backupSessionDir);
    
    const timestamp = Date.now();
    const backupPath = path.join(
      backupSessionDir, 
      `backup_${timestamp}_${path.basename(filePath)}`
    );
    
    await fs.copy(filePath, backupPath);
    
    const metaPath = path.join(backupSessionDir, 'meta.json');
    let meta = { backups: [] };
    
    if (await fs.pathExists(metaPath)) {
      meta = await fs.readJson(metaPath);
    }
    
    meta.backups.push({
      originalPath: filePath,
      backupPath,
      timestamp,
    });
    
    await fs.writeJson(metaPath, meta);
    
    this.logger.info('备份已创建', { filePath, backupPath, sessionId });
    return backupPath;
  }

  async restoreBackup(sessionId, originalPath) {
    const backupSessionDir = path.join(this.backupDir, sessionId);
    const metaPath = path.join(backupSessionDir, 'meta.json');
    
    if (!await fs.pathExists(metaPath)) {
      throw new Error('找不到备份元数据');
    }
    
    const meta = await fs.readJson(metaPath);
    const backup = meta.backups.find(b => b.originalPath === originalPath);
    
    if (!backup) {
      throw new Error('找不到对应的备份文件');
    }
    
    await fs.copy(backup.backupPath, originalPath);
    this.logger.info('备份已恢复', { originalPath, backupPath: backup.backupPath });
    
    return backup.backupPath;
  }

  async cleanupOldBackups() {
    const retentionMs = this.config.BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const now = Date.now();
    
    try {
      const sessions = await fs.readdir(this.backupDir);
      
      for (const session of sessions) {
        const sessionDir = path.join(this.backupDir, session);
        const stat = await fs.stat(sessionDir);
        
        if (now - stat.mtimeMs > retentionMs) {
          await fs.remove(sessionDir);
          this.logger.info('已清理过期备份', { sessionDir });
        }
      }
    } catch (e) {
      this.logger.warn('备份清理失败', { error: e.message });
    }
  }

  async listBackups(sessionId) {
    const backupSessionDir = path.join(this.backupDir, sessionId);
    const metaPath = path.join(backupSessionDir, 'meta.json');
    
    if (!await fs.pathExists(metaPath)) {
      return [];
    }
    
    const meta = await fs.readJson(metaPath);
    return meta.backups;
  }
}

module.exports = BackupManager;
