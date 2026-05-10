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

// 匹配策略枚举
export const MATCH_STRATEGY = {
  EXACT: 'exact',
  IGNORE_CASE: 'ignoreCase',
  IGNORE_SPACE_PUNCT: 'ignoreSpacePunct',
  LEVENSHTEIN: 'levenshtein',
};

// 匹配结果类型
export const MATCH_RESULT_TYPE = {
  EXACT: 'exact',
  FUZZY: 'fuzzy',
  UNMATCHED: 'unmatched',
};

// 匹配结果颜色配置
export const MATCH_RESULT_COLORS = {
  [MATCH_RESULT_TYPE.EXACT]: '#52c41a',
  [MATCH_RESULT_TYPE.FUZZY]: '#fa8c16',
  [MATCH_RESULT_TYPE.UNMATCHED]: '#bfbfbf',
};

// Levenshtein 编辑距离配置
export const LEVENSHTEIN_CONFIG = {
  MIN_THRESHOLD: 1,
  MAX_THRESHOLD: 3,
  DEFAULT_THRESHOLD: 2,
};

// 匹配策略优先级（执行顺序）
export const MATCH_STRATEGY_PRIORITY = [
  MATCH_STRATEGY.IGNORE_CASE,
  MATCH_STRATEGY.IGNORE_SPACE_PUNCT,
  MATCH_STRATEGY.LEVENSHTEIN,
];

// 默认匹配策略配置
export const DEFAULT_MATCH_STRATEGIES = {
  [MATCH_STRATEGY.IGNORE_CASE]: true,
  [MATCH_STRATEGY.IGNORE_SPACE_PUNCT]: true,
  [MATCH_STRATEGY.LEVENSHTEIN]: true,
};

// 匹配规则 schema
export const MATCH_RULE_SCHEMA = {
  id: 'string',
  keyColumnA: 'string',
  keyColumnB: 'string',
  strategies: {
    [MATCH_STRATEGY.IGNORE_CASE]: 'boolean',
    [MATCH_STRATEGY.IGNORE_SPACE_PUNCT]: 'boolean',
    [MATCH_STRATEGY.LEVENSHTEIN]: 'boolean',
  },
  levenshteinThreshold: 'number',
  enabled: 'boolean',
};

// 创建默认匹配规则
export const createDefaultMatchRule = (id, keyColumnA = '', keyColumnB = '') => ({
  id,
  keyColumnA,
  keyColumnB,
  strategies: { ...DEFAULT_MATCH_STRATEGIES },
  levenshteinThreshold: LEVENSHTEIN_CONFIG.DEFAULT_THRESHOLD,
  enabled: true,
});
