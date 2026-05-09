// 配置持久化管理
import logger from './logger';

const CONFIG_KEY = 'offline_data_processor_config';

const defaultConfig = {
  // 上次使用的设置
  lastKeyColumnA: '',
  lastKeyColumnB: '',
  lastSelectedColumns: [],
  
  // 用户偏好
  pageSize: 10,
  autoBackup: true,
  
  // 最近文件记录
  recentFiles: [],
  maxRecentFiles: 10,
};

class ConfigManager {
  constructor() {
    this.config = this._load();
  }

  _load() {
    try {
      const saved = localStorage.getItem(CONFIG_KEY);
      if (saved) {
        return { ...defaultConfig, ...JSON.parse(saved) };
      }
    } catch (e) {
      logger.warn('配置加载失败', { error: e.message });
    }
    return { ...defaultConfig };
  }

  _save() {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(this.config));
    } catch (e) {
      logger.warn('配置保存失败', { error: e.message });
    }
  }

  get(key) {
    return this.config[key];
  }

  set(key, value) {
    this.config[key] = value;
    this._save();
  }

  // 添加最近文件
  addRecentFile(fileName, filePath) {
    const recentFiles = this.config.recentFiles.filter(f => f.path !== filePath);
    recentFiles.unshift({ name: fileName, path: filePath, time: Date.now() });
    
    if (recentFiles.length > this.config.maxRecentFiles) {
      recentFiles.pop();
    }
    
    this.config.recentFiles = recentFiles;
    this._save();
  }

  // 保存列选择配置
  saveColumnConfig(keyColumnA, keyColumnB, selectedColumns) {
    this.config.lastKeyColumnA = keyColumnA;
    this.config.lastKeyColumnB = keyColumnB;
    this.config.lastSelectedColumns = selectedColumns;
    this._save();
  }

  // 获取列选择配置
  getColumnConfig() {
    return {
      keyColumnA: this.config.lastKeyColumnA,
      keyColumnB: this.config.lastKeyColumnB,
      selectedColumns: this.config.lastSelectedColumns,
    };
  }

  // 重置配置
  reset() {
    this.config = { ...defaultConfig };
    this._save();
  }
}

export const configManager = new ConfigManager();
export default configManager;
