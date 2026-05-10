// 共享数据匹配核心逻辑 (CommonJS 版本，供主进程使用)
// 与 src/utils/matchCore.js 保持完全一致的匹配算法
// 修改匹配逻辑时只需同步修改这两个文件
const _ = require('lodash');

// 内嵌常量定义（与 src/constants/index.js 保持一致）
const MATCH_STRATEGY = {
  EXACT: 'exact',
  IGNORE_CASE: 'ignoreCase',
  IGNORE_SPACE_PUNCT: 'ignoreSpacePunct',
  LEVENSHTEIN: 'levenshtein',
};

const MATCH_RESULT_TYPE = {
  EXACT: 'exact',
  FUZZY: 'fuzzy',
  UNMATCHED: 'unmatched',
};

const LEVENSHTEIN_CONFIG = {
  MIN_THRESHOLD: 1,
  MAX_THRESHOLD: 3,
  DEFAULT_THRESHOLD: 2,
};

const MATCH_STRATEGY_PRIORITY = [
  MATCH_STRATEGY.IGNORE_CASE,
  MATCH_STRATEGY.IGNORE_SPACE_PUNCT,
  MATCH_STRATEGY.LEVENSHTEIN,
];

/**
 * 将 cell 值规范化为原始类型（防止 xlsx 返回 Date/对象）
 * @param {*} val - 原始值
 * @returns {*} 规范化后的值
 */
function normalizeValue(val) {
  if (_.isNil(val) || val === '') return val;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'object' && val.v !== undefined) return val.v;
  if (typeof val === 'object') return String(val);
  return val;
}

/**
 * 使用动态规划计算 Levenshtein 编辑距离
 * @param {string} str1 - 第一个字符串
 * @param {string} str2 - 第二个字符串
 * @returns {number} 编辑距离
 */
function levenshteinDistance(str1, str2) {
  const s1 = String(str1 || '');
  const s2 = String(str2 || '');

  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;

  const matrix = [];
  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[s2.length][s1.length];
}

/**
 * 忽略大小写规范化
 * @param {string} str - 原始字符串
 * @returns {string} 规范化后的字符串
 */
function normalizeIgnoreCase(str) {
  return String(str || '').toLowerCase();
}

/**
 * 忽略所有空格和标点符号
 * @param {string} str - 原始字符串
 * @returns {string} 规范化后的字符串
 */
function normalizeIgnoreSpacePunct(str) {
  return String(str || '').replace(/[\s\p{P}]/gu, '');
}

/**
 * 应用单个匹配策略到字符串
 * @param {string} str - 原始字符串
 * @param {string} strategy - 策略类型
 * @returns {string} 规范化后的字符串
 */
function applyStrategy(str, strategy) {
  switch (strategy) {
    case MATCH_STRATEGY.IGNORE_CASE:
      return normalizeIgnoreCase(str);
    case MATCH_STRATEGY.IGNORE_SPACE_PUNCT:
      return normalizeIgnoreSpacePunct(str);
    default:
      return str;
  }
}

/**
 * 构建文件A的主键索引映射（支持多种规范化策略）
 * @param {Array} fileAData - 文件A数据
 * @param {string} keyColumnA - 文件A主键列名
 * @param {Object} strategies - 启用的策略
 * @returns {Map<string, Array<{row: Object, originalIndex: number}>>} 主键 -> 行数据数组的映射
 */
function buildKeyMapWithStrategies(fileAData, keyColumnA, strategies) {
  const fileAMap = new Map();
  const enabledStrategies = MATCH_STRATEGY_PRIORITY.filter(s => strategies[s]);

  _.forEach(fileAData, (row, originalIndex) => {
    const originalKey = _.trim(String(row[keyColumnA] || ''));
    if (!originalKey) return;

    const keys = new Set();
    keys.add(originalKey);

    let currentKey = originalKey;
    for (const strategy of enabledStrategies) {
      if (strategy !== MATCH_STRATEGY.LEVENSHTEIN) {
        currentKey = applyStrategy(currentKey, strategy);
        keys.add(currentKey);
      }
    }

    for (const key of keys) {
      if (!fileAMap.has(key)) {
        fileAMap.set(key, []);
      }
      fileAMap.get(key).push({ row, originalIndex });
    }
  });

  return fileAMap;
}

/**
 * 使用链式策略查找匹配行
 * @param {string} keyValueB - 文件B的主键值
 * @param {Map} fileAMap - 文件A的索引映射
 * @param {Array} fileAData - 文件A原始数据
 * @param {string} keyColumnA - 文件A主键列名
 * @param {Object} strategies - 启用的策略
 * @param {number} levenshteinThreshold - Levenshtein 阈值
 * @returns {{row: Object, originalIndex: number, matchType: string, distance: number}|null}
 */
function findMatchWithChain(
  keyValueB,
  fileAMap,
  fileAData,
  keyColumnA,
  strategies,
  levenshteinThreshold
) {
  const trimmedKey = _.trim(String(keyValueB || ''));
  if (!trimmedKey) return null;

  const exactMatches = fileAMap.get(trimmedKey);
  if (exactMatches && exactMatches.length > 0) {
    const firstMatch = _.minBy(exactMatches, 'originalIndex');
    return {
      row: firstMatch.row,
      originalIndex: firstMatch.originalIndex,
      matchType: MATCH_RESULT_TYPE.EXACT,
      distance: 0,
    };
  }

  const enabledStrategies = MATCH_STRATEGY_PRIORITY.filter(s => strategies[s]);

  let currentKey = trimmedKey;
  for (const strategy of enabledStrategies) {
    if (strategy === MATCH_STRATEGY.LEVENSHTEIN) {
      break;
    }

    currentKey = applyStrategy(currentKey, strategy);
    const matches = fileAMap.get(currentKey);
    if (matches && matches.length > 0) {
      const firstMatch = _.minBy(matches, 'originalIndex');
      return {
        row: firstMatch.row,
        originalIndex: firstMatch.originalIndex,
        matchType: MATCH_RESULT_TYPE.FUZZY,
        distance: levenshteinDistance(trimmedKey, _.trim(String(firstMatch.row[keyColumnA] || ''))),
      };
    }
  }

  if (strategies[MATCH_STRATEGY.LEVENSHTEIN]) {
    const threshold = Math.max(
      LEVENSHTEIN_CONFIG.MIN_THRESHOLD,
      Math.min(LEVENSHTEIN_CONFIG.MAX_THRESHOLD, levenshteinThreshold)
    );

    let bestMatch = null;
    let bestDistance = Infinity;

    _.forEach(fileAData, (row, originalIndex) => {
      const keyA = _.trim(String(row[keyColumnA] || ''));
      if (!keyA) return;

      let compareKeyA = keyA;
      let compareKeyB = trimmedKey;

      for (const strategy of enabledStrategies) {
        if (strategy !== MATCH_STRATEGY.LEVENSHTEIN) {
          compareKeyA = applyStrategy(compareKeyA, strategy);
          compareKeyB = applyStrategy(compareKeyB, strategy);
        }
      }

      const distance = levenshteinDistance(compareKeyB, compareKeyA);
      if (distance <= threshold && distance < bestDistance) {
        bestDistance = distance;
        bestMatch = { row, originalIndex, distance };
      } else if (distance <= threshold && distance === bestDistance && bestMatch) {
        if (originalIndex < bestMatch.originalIndex) {
          bestMatch = { row, originalIndex, distance };
        }
      }
    });

    if (bestMatch) {
      return {
        row: bestMatch.row,
        originalIndex: bestMatch.originalIndex,
        matchType: MATCH_RESULT_TYPE.FUZZY,
        distance: bestMatch.distance,
      };
    }
  }

  return null;
}

/**
 * 填充列值的辅助函数
 * @param {Object} matchedRowA - 匹配到的文件A行
 * @param {Object} normalizedRowB - 规范化后的文件B行
 * @param {Array} selectedColumns - 要补充的列
 * @param {Object} newRow - 新行对象（会被原地修改）
 * @param {Object} stats - 统计对象（会被原地修改）
 * @returns {Array} 填充的列名数组
 */
function fillColumns(matchedRowA, normalizedRowB, selectedColumns, newRow, stats) {
  const filledColumns = [];
  _.forEach(selectedColumns, col => {
    const sourceVal = normalizeValue(matchedRowA[col]);
    const sourceHasValue = !_.isNil(sourceVal) && sourceVal !== '';
    const targetVal = normalizedRowB[col];
    const targetHasValue = !_.isNil(targetVal) && targetVal !== '';

    if (sourceHasValue && !targetHasValue) {
      newRow[col] = sourceVal;
      stats.filledCells++;
      filledColumns.push(col);
    } else if (targetHasValue) {
      newRow[col] = targetVal;
    } else {
      newRow[col] = normalizedRowB[col];
      if (_.isNil(normalizedRowB[col]) || normalizedRowB[col] === '') {
        stats.nullCells++;
      }
    }
  });
  return filledColumns;
}

/**
 * 构建文件A的主键索引映射（传统精确匹配，向后兼容）
 * @param {Array} fileAData - 文件A数据
 * @param {string} keyColumnA - 文件A主键列名
 * @returns {Map} 主键 -> 行数据的映射
 */
function buildKeyMap(fileAData, keyColumnA) {
  const fileAMap = new Map();
  _.forEach(fileAData, row => {
    const key = _.trim(String(row[keyColumnA] || ''));
    if (key) fileAMap.set(key, row);
  });
  return fileAMap;
}

/**
 * 使用匹配规则链处理单行数据
 * @param {Object} rowB - 文件B的当前行
 * @param {number} rowIndex - 行索引
 * @param {Array} matchRules - 匹配规则链
 * @param {Map} fileAMaps - 文件A的索引映射（按规则ID存储）
 * @param {Array} fileAData - 文件A原始数据
 * @param {Array} selectedColumns - 要补充的列
 * @param {Object} stats - 统计对象（会被原地修改）
 * @returns {Object} 处理后的新行
 */
function matchRowWithRules(
  rowB,
  rowIndex,
  matchRules,
  fileAMaps,
  fileAData,
  selectedColumns,
  stats
) {
  const normalizedRowB = {};
  for (const key of Object.keys(rowB)) {
    normalizedRowB[key] = normalizeValue(rowB[key]);
  }

  const newRow = { ...normalizedRowB, _rowIndex: rowIndex };
  let matchedResult = null;
  let matchedRuleId = null;

  for (const rule of matchRules) {
    if (!rule.enabled) continue;

    const keyValueB = _.trim(String(normalizedRowB[rule.keyColumnB] || ''));
    if (!keyValueB) continue;

    const result = findMatchWithChain(
      keyValueB,
      fileAMaps[rule.id],
      fileAData,
      rule.keyColumnA,
      rule.strategies,
      rule.levenshteinThreshold
    );

    if (result) {
      matchedResult = result;
      matchedRuleId = rule.id;
      break;
    }
  }

  if (matchedResult) {
    const filledColumns = fillColumns(
      matchedResult.row,
      normalizedRowB,
      selectedColumns,
      newRow,
      stats
    );
    newRow._filledColumns = filledColumns;
    newRow._matched = true;
    newRow._matchType = matchedResult.matchType;
    newRow._matchDistance = matchedResult.distance;
    newRow._matchedRuleId = matchedRuleId;
    newRow._matchedIndexA = matchedResult.originalIndex;

    if (matchedResult.matchType === MATCH_RESULT_TYPE.EXACT) {
      stats.exactMatchedRows = (stats.exactMatchedRows || 0) + 1;
    } else {
      stats.fuzzyMatchedRows = (stats.fuzzyMatchedRows || 0) + 1;
    }
    stats.matchedRows++;
  } else {
    _.forEach(selectedColumns, col => {
      const existingVal = normalizedRowB[col];
      newRow[col] = _.isNil(existingVal) ? null : existingVal;
      if (_.isNil(existingVal) || existingVal === '') {
        stats.nullCells++;
      }
    });
    newRow._matched = false;
    newRow._matchType = MATCH_RESULT_TYPE.UNMATCHED;
    newRow._matchDistance = null;
    stats.unmatchedRows++;
  }

  return newRow;
}

/**
 * 构建所有规则的索引映射
 * @param {Array} fileAData - 文件A数据
 * @param {Array} matchRules - 匹配规则链
 * @returns {Object} 按规则ID存储的索引映射
 */
function buildKeyMapsForRules(fileAData, matchRules) {
  const maps = {};
  for (const rule of matchRules) {
    if (rule.enabled && rule.keyColumnA) {
      maps[rule.id] = buildKeyMapWithStrategies(
        fileAData,
        rule.keyColumnA,
        rule.strategies
      );
    }
  }
  return maps;
}

/**
 * 匹配单行数据并补充列值（传统精确匹配，向后兼容）
 * @param {Object} rowB - 文件B的当前行
 * @param {number} rowIndex - 行索引
 * @param {Map} fileAMap - 文件A的主键索引
 * @param {string} keyColumnB - 文件B主键列名
 * @param {Array} selectedColumns - 要补充的列
 * @param {Object} stats - 统计对象（会被原地修改）
 * @returns {Object} 处理后的新行
 */
function matchRow(rowB, rowIndex, fileAMap, keyColumnB, selectedColumns, stats) {
  const normalizedRowB = {};
  for (const key of Object.keys(rowB)) {
    normalizedRowB[key] = normalizeValue(rowB[key]);
  }

  const newRow = { ...normalizedRowB, _rowIndex: rowIndex };
  const keyValue = _.trim(String(normalizedRowB[keyColumnB] || ''));
  const matchedRowA = fileAMap.get(keyValue);

  if (matchedRowA) {
    const filledColumns = fillColumns(
      matchedRowA,
      normalizedRowB,
      selectedColumns,
      newRow,
      stats
    );
    newRow._filledColumns = filledColumns;
    newRow._matched = true;
    newRow._matchType = MATCH_RESULT_TYPE.EXACT;
    newRow._matchDistance = 0;
    stats.exactMatchedRows = (stats.exactMatchedRows || 0) + 1;
    stats.matchedRows++;
  } else {
    _.forEach(selectedColumns, col => {
      const existingVal = normalizedRowB[col];
      newRow[col] = _.isNil(existingVal) ? null : existingVal;
      if (_.isNil(existingVal) || existingVal === '') {
        stats.nullCells++;
      }
    });
    newRow._matched = false;
    newRow._matchType = MATCH_RESULT_TYPE.UNMATCHED;
    newRow._matchDistance = null;
    stats.unmatchedRows++;
  }

  return newRow;
}

/**
 * 创建初始统计对象
 * @param {number} totalRowsB - 文件B总行数
 * @returns {Object} 统计对象
 */
function createStats(totalRowsB) {
  return {
    totalRowsB,
    matchedRows: 0,
    exactMatchedRows: 0,
    fuzzyMatchedRows: 0,
    unmatchedRows: 0,
    filledCells: 0,
    nullCells: 0,
  };
}

/**
 * 计算最终匹配率（包含三种匹配类型的统计）
 * @param {Object} stats - 统计对象
 * @returns {Object} 最终统计结果
 */
function finalizeStats(stats) {
  stats.matchRate = ((stats.matchedRows / stats.totalRowsB) * 100).toFixed(2);
  stats.exactMatchRate = ((stats.exactMatchedRows / stats.totalRowsB) * 100).toFixed(2);
  stats.fuzzyMatchRate = ((stats.fuzzyMatchedRows / stats.totalRowsB) * 100).toFixed(2);
  stats.unmatchedRate = ((stats.unmatchedRows / stats.totalRowsB) * 100).toFixed(2);
  return stats;
}

module.exports = {
  buildKeyMap,
  buildKeyMapWithStrategies,
  buildKeyMapsForRules,
  findMatchWithChain,
  levenshteinDistance,
  matchRow,
  matchRowWithRules,
  createStats,
  finalizeStats,
};
