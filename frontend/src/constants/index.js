// 应用常量配置
export const APP_CONFIG = {
  // 支持的文件格式
  SUPPORTED_FORMATS: ['.csv', '.xlsx', '.xls'],
  
  // 文件大小限制 (100MB)
  MAX_FILE_SIZE: 100 * 1024 * 1024,
  
  // 数据量限制
  MAX_ROWS: 100000, // 最大行数
  MAX_COLUMNS: 500, // 最大列数
  
  // 处理超时时间 (5分钟)
  PROCESS_TIMEOUT: 5 * 60 * 1000,
  
  // 备份保留天数
  BACKUP_RETENTION_DAYS: 7,
  
  // 分页默认配置
  DEFAULT_PAGE_SIZE: 10,
  PAGE_SIZE_OPTIONS: ['10', '20', '50', '100'],
  
  // 批处理大小 (用于断点续处理)
  BATCH_SIZE: 1000,
  
  // 检查点保存间隔
  CHECKPOINT_INTERVAL: 100,
};

// 处理状态枚举
export const PROCESS_STATUS = {
  IDLE: 'idle',
  UPLOADING: 'uploading',
  PROCESSING: 'processing',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  ERROR: 'error',
  ROLLING_BACK: 'rolling_back',
};

// 文件上传状态枚举
export const UPLOAD_STATUS = {
  IDLE: 'idle',
  PREPARING: 'preparing',
  UPLOADING: 'uploading',
  SUCCESS: 'success',
  ERROR: 'error',
};

// 日志级别
export const LOG_LEVEL = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
};

// 异常值检测阈值
export const ANOMALY_CONFIG = {
  // 空值比例警告阈值
  NULL_RATIO_WARNING: 0.3,
  // 匹配率警告阈值
  MATCH_RATE_WARNING: 0.5,
  // 数据类型不一致警告
  TYPE_MISMATCH_WARNING: true,
};

// 模糊匹配策略枚举
export const FUZZY_STRATEGY = {
  IGNORE_CASE: 'ignoreCase',
  IGNORE_SPACE_PUNCTUATION: 'ignoreSpacePunctuation',
  LEVENSHTEIN: 'levenshtein',
};

// 匹配类型枚举
export const MATCH_TYPE = {
  EXACT: 'exact',
  FUZZY: 'fuzzy',
  NONE: 'none',
};

// 匹配类型显示配置
export const MATCH_TYPE_CONFIG = {
  [MATCH_TYPE.EXACT]: { label: '精确匹配', color: 'green', rowClassName: 'exact-match-row' },
  [MATCH_TYPE.FUZZY]: { label: '模糊匹配', color: 'orange', rowClassName: 'fuzzy-match-row' },
  [MATCH_TYPE.NONE]: { label: '未匹配', color: 'default', rowClassName: 'no-match-row' },
};

// Levenshtein 编辑距离默认阈值
export const DEFAULT_LEVENSHTEIN_THRESHOLD = 1;

// Levenshtein 编辑距离阈值范围
export const LEVENSHTEIN_THRESHOLD_RANGE = { min: 1, max: 3 };

/**
 * 匹配规则链 schema 定义
 * @typedef {Object} MatchRule
 * @property {string} id - 规则唯一标识
 * @property {string} keyColumnA - 文件A主键列名
 * @property {string} keyColumnB - 文件B主键列名
 * @property {Object} fuzzyConfig - 模糊匹配配置
 * @property {boolean} fuzzyConfig.ignoreCase - 是否忽略大小写
 * @property {boolean} fuzzyConfig.ignoreSpacePunctuation - 是否忽略空格与标点符号
 * @property {boolean} fuzzyConfig.levenshtein - 是否启用编辑距离容忍
 * @property {number} fuzzyConfig.levenshteinThreshold - 编辑距离阈值 (1-3)
 */
export const MATCH_RULE_SCHEMA = {
  id: '',
  keyColumnA: '',
  keyColumnB: '',
  fuzzyConfig: {
    ignoreCase: false,
    ignoreSpacePunctuation: false,
    levenshtein: false,
    levenshteinThreshold: DEFAULT_LEVENSHTEIN_THRESHOLD,
  },
};

/**
 * 创建默认匹配规则
 * @param {string} keyColumnA - 文件A主键列名
 * @param {string} keyColumnB - 文件B主键列名
 * @returns {MatchRule} 默认匹配规则
 */
export function createDefaultMatchRule(keyColumnA = '', keyColumnB = '') {
  return {
    ...MATCH_RULE_SCHEMA,
    id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    keyColumnA,
    keyColumnB,
    fuzzyConfig: { ...MATCH_RULE_SCHEMA.fuzzyConfig },
  };
}
