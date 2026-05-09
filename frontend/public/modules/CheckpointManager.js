// Electron 检查点管理模块 (断点续处理)
const fs = require('fs-extra');
const path = require('path');

class CheckpointManager {
  constructor(checkpointDir, logger) {
    this.checkpointDir = checkpointDir;
    this.logger = logger;
  }

  getCheckpointPath(sessionId) {
    return path.join(this.checkpointDir, `${sessionId}.json`);
  }

  async saveCheckpoint(sessionId, data) {
    const checkpointPath = this.getCheckpointPath(sessionId);
    await fs.writeJson(checkpointPath, {
      ...data,
      savedAt: Date.now(),
    });
    this.logger.debug('检查点已保存', { sessionId, processedCount: data.processedCount });
  }

  async loadCheckpoint(sessionId) {
    const checkpointPath = this.getCheckpointPath(sessionId);
    
    if (await fs.pathExists(checkpointPath)) {
      const data = await fs.readJson(checkpointPath);
      this.logger.info('检查点已加载', { sessionId, processedCount: data.processedCount });
      return data;
    }
    
    return null;
  }

  async clearCheckpoint(sessionId) {
    const checkpointPath = this.getCheckpointPath(sessionId);
    
    if (await fs.pathExists(checkpointPath)) {
      await fs.remove(checkpointPath);
      this.logger.debug('检查点已清除', { sessionId });
    }
  }

  async hasCheckpoint(sessionId) {
    const checkpointPath = this.getCheckpointPath(sessionId);
    return fs.pathExists(checkpointPath);
  }

  /**
   * 列出所有可用检查点（用于跨 session 恢复）
   * 返回 [{ sessionId, checkpoint }]
   */
  async listAllCheckpoints() {
    try {
      const files = await fs.readdir(this.checkpointDir);
      const results = [];
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const sid = file.replace('.json', '');
        try {
          const data = await fs.readJson(path.join(this.checkpointDir, file));
          results.push({ sessionId: sid, checkpoint: data });
        } catch (e) {
          // 跳过损坏的检查点文件
        }
      }
      return results;
    } catch (e) {
      return [];
    }
  }
}

module.exports = CheckpointManager;
