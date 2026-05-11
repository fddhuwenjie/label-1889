// 共享数据匹配核心逻辑
// 同时被渲染端 DataProcessor 和主进程 ElectronDataProcessor 使用
// 修改匹配逻辑时只需修改此文件即可保持一致
import _ from 'lodash';
import { MATCH_TYPES, FUZZY_STRATEGIES } from '../constants';

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
 * 计算 Levenshtein 编辑距离（动态规划实现）
 * 计算将字符串 str1 转换为 str2 所需的最少单字符编辑操作次数
 * （插入、删除、替换）
 * @param {string} str1 - 第一个字符串
 * @param {string} str2 - 第二个字符串
 * @returns {number} 编辑距离值
 */
export function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const dp = Array(m + 1);
  for (let i = 0; i <= m; i++) {
    dp[i] = Array(n + 1);
    dp[i][0] = i;
  }
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j - 1] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j] + 1
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * 忽略大小写的字符串比较
 * @param {string} str1 - 第一个字符串
 * @param {string} str2 - 第二个字符串
 * @returns {boolean} 是否匹配
 */
export function matchIgnoreCase(str1, str2) {
  return str1.toLowerCase() === str2.toLowerCase();
}

/**
 * 移除所有空格和标点符号
 * @param {string} str - 输入字符串
 * @returns {string} 处理后的字符串
 */
export function removeSpaceAndPunct(str) {
  return str.replace(/[\s\p{P}]/gu, '');
}

/**
 * 忽略空格和标点符号的字符串比较
 * @param {string} str1 - 第一个字符串
 * @param {string} str2 - 第二个字符串
 * @returns {boolean} 是否匹配
 */
export function matchIgnoreSpacePunct(str1, str2) {
  return removeSpaceAndPunct(str1) === removeSpaceAndPunct(str2);
}

/**
 * 构建文件A的主键索引映射（同时构建多种规范化形式的索引）
 * @param {Array} fileAData - 文件A数据
 * @param {string} keyColumnA - 文件A主键列名
 * @returns {Object} 包含多种索引的对象
 */
export function buildKeyMap(fileAData, keyColumnA) {
  const exactMap = new Map();
  const lowerCaseMap = new Map();
  const noSpacePunctMap = new Map();
  const allKeys = [];

  _.forEach(fileAData, (row, index) => {
    const key = _.trim(String(row[keyColumnA] || ''));
    if (key) {
      exactMap.set(key, { row, index });

      const lowerKey = key.toLowerCase();
      if (!lowerCaseMap.has(lowerKey)) {
        lowerCaseMap.set(lowerKey, []);
      }
      lowerCaseMap.get(lowerKey).push({ row, index, originalKey: key });

      const noSpaceKey = removeSpaceAndPunct(key);
      if (!noSpacePunctMap.has(noSpaceKey)) {
        noSpacePunctMap.set(noSpaceKey, []);
      }
      noSpacePunctMap.get(noSpaceKey).push({ row, index, originalKey: key });

      allKeys.push({ key, row, index });
    }
  });

  return {
    exactMap,
    lowerCaseMap,
    noSpacePunctMap,
    allKeys,
  };
}

/**
 * 执行模糊匹配，按优先级链式执行策略
 * 优先级：忽略大小写 → 忽略空格标点 → 编辑距离
 * @param {string} keyValue - 待匹配的键值
 * @param {Object} keyMap - buildKeyMap 返回的索引对象
 * @param {Object} strategies - 启用的策略配置
 * @param {number} levenshteinThreshold - 编辑距离阈值
 * @returns {Object|null} 匹配结果 { row, index, matchType, distance, matchedKey } 或 null
 */
export function fuzzyMatch(keyValue, keyMap, strategies, levenshteinThreshold = 1) {
  const trimmedKey = _.trim(String(keyValue || ''));
  if (!trimmedKey) return null;

  const exactMatch = keyMap.exactMap.get(trimmedKey);
  if (exactMatch) {
    return {
      row: exactMatch.row,
      index: exactMatch.index,
      matchType: MATCH_TYPES.EXACT,
      distance: 0,
      matchedKey: trimmedKey,
      strategy: 'exact',
    };
  }

  if (strategies[FUZZY_STRATEGIES.IGNORE_CASE]) {
    const lowerKey = trimmedKey.toLowerCase();
    const candidates = keyMap.lowerCaseMap.get(lowerKey);
    if (candidates && candidates.length > 0) {
      const best = candidates[0];
      return {
        row: best.row,
        index: best.index,
        matchType: MATCH_TYPES.FUZZY,
        distance: 0,
        matchedKey: best.originalKey,
        strategy: FUZZY_STRATEGIES.IGNORE_CASE,
      };
    }
  }

  if (strategies[FUZZY_STRATEGIES.IGNORE_SPACE_PUNCT]) {
    const noSpaceKey = removeSpaceAndPunct(trimmedKey);
    const candidates = keyMap.noSpacePunctMap.get(noSpaceKey);
    if (candidates && candidates.length > 0) {
      const best = candidates[0];
      return {
        row: best.row,
        index: best.index,
        matchType: MATCH_TYPES.FUZZY,
        distance: 0,
        matchedKey: best.originalKey,
        strategy: FUZZY_STRATEGIES.IGNORE_SPACE_PUNCT,
      };
    }
  }

  if (strategies[FUZZY_STRATEGIES.LEVENSHTEIN]) {
    let bestMatch = null;
    let minDistance = Infinity;

    for (const item of keyMap.allKeys) {
      const distance = levenshteinDistance(trimmedKey, item.key);
      if (distance <= levenshteinThreshold && distance < minDistance) {
        minDistance = distance;
        bestMatch = item;
      } else if (distance <= levenshteinThreshold && distance === minDistance && bestMatch) {
        if (item.index < bestMatch.index) {
          bestMatch = item;
        }
      }
    }

    if (bestMatch) {
      return {
        row: bestMatch.row,
        index: bestMatch.index,
        matchType: MATCH_TYPES.FUZZY,
        distance: minDistance,
        matchedKey: bestMatch.key,
        strategy: FUZZY_STRATEGIES.LEVENSHTEIN,
      };
    }
  }

  return null;
}

/**
 * 匹配单行数据并补充列值（支持模糊匹配）
 * @param {Object} rowB - 文件B的当前行
 * @param {number} rowIndex - 行索引
 * @param {Object} keyMap - 文件A的主键索引
 * @param {string} keyColumnB - 文件B主键列名
 * @param {Array} selectedColumns - 要补充的列
 * @param {Object} stats - 统计对象（会被原地修改）
 * @param {Object} strategies - 模糊匹配策略配置
 * @param {number} levenshteinThreshold - 编辑距离阈值
 * @returns {Object} 处理后的新行
 */
export function matchRow(rowB, rowIndex, keyMap, keyColumnB, selectedColumns, stats, strategies = {}, levenshteinThreshold = 1) {
  const normalizedRowB = {};
  for (const key of Object.keys(rowB)) {
    normalizedRowB[key] = normalizeValue(rowB[key]);
  }

  const newRow = { ...normalizedRowB, _rowIndex: rowIndex };
  const keyValue = _.trim(String(normalizedRowB[keyColumnB] || ''));

  const hasFuzzyStrategy = Object.values(strategies).some(s => s);
  let matchResult = null;

  if (hasFuzzyStrategy) {
    matchResult = fuzzyMatch(keyValue, keyMap, strategies, levenshteinThreshold);
  } else {
    const exactMatch = keyMap.exactMap.get(keyValue);
    if (exactMatch) {
      matchResult = {
        row: exactMatch.row,
        index: exactMatch.index,
        matchType: MATCH_TYPES.EXACT,
        distance: 0,
        matchedKey: keyValue,
        strategy: 'exact',
      };
    }
  }

  const matchedRowA = matchResult?.row;
  const filledColumns = [];

  if (matchedRowA) {
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

    stats.matchedRows++;
    if (matchResult.matchType === MATCH_TYPES.EXACT) {
      stats.exactMatches++;
    } else {
      stats.fuzzyMatches++;
    }

    newRow._matchType = matchResult.matchType;
    newRow._matchStrategy = matchResult.strategy;
    newRow._matchDistance = matchResult.distance;
    newRow._matchedKey = matchResult.matchedKey;
  } else {
    _.forEach(selectedColumns, col => {
      const existingVal = normalizedRowB[col];
      newRow[col] = _.isNil(existingVal) ? null : existingVal;
      if (_.isNil(existingVal) || existingVal === '') {
        stats.nullCells++;
      }
    });
    stats.unmatchedRows++;
    newRow._matchType = MATCH_TYPES.UNMATCHED;
  }

  newRow._filledColumns = filledColumns;
  newRow._matched = !!matchedRowA;
  return newRow;
}

/**
 * 执行匹配规则链
 * 按规则顺序依次执行，前一条规则未匹配成功的行才进入下一条规则
 * @param {Array} fileBData - 文件B数据
 * @param {Array} fileAData - 文件A数据
 * @param {Array} matchRules - 匹配规则数组
 * @param {Array} selectedColumns - 要补充的列
 * @param {Object} stats - 统计对象
 * @returns {Array} 处理后的所有行
 */
export function executeMatchRuleChain(fileBData, fileAData, matchRules, selectedColumns, stats) {
  const results = new Map();
  const unmatchedIndices = new Set(fileBData.map((_, i) => i));

  for (const rule of matchRules) {
    if (!rule.enabled) continue;

    const keyMap = buildKeyMap(fileAData, rule.keyColumnA);
    const currentUnmatched = Array.from(unmatchedIndices);

    for (const rowIndex of currentUnmatched) {
      const rowB = fileBData[rowIndex];
      const result = matchRow(
        rowB,
        rowIndex,
        keyMap,
        rule.keyColumnB,
        selectedColumns,
        stats,
        rule.strategies,
        rule.levenshteinThreshold
      );

      if (result._matched) {
        results.set(rowIndex, {
          ...result,
          _matchedByRule: rule.id,
          _matchedRuleName: rule.name,
        });
        unmatchedIndices.delete(rowIndex);
      }
    }
  }

  for (const rowIndex of unmatchedIndices) {
    const rowB = fileBData[rowIndex];
    const normalizedRowB = {};
    for (const key of Object.keys(rowB)) {
      normalizedRowB[key] = normalizeValue(rowB[key]);
    }
    const newRow = { ...normalizedRowB, _rowIndex: rowIndex };
    _.forEach(selectedColumns, col => {
      const existingVal = normalizedRowB[col];
      newRow[col] = _.isNil(existingVal) ? null : existingVal;
    });
    newRow._matchType = MATCH_TYPES.UNMATCHED;
    newRow._filledColumns = [];
    newRow._matched = false;
    results.set(rowIndex, newRow);
  }

  return Array.from(results.entries())
    .sort((a, b) => a[0] - b[0])
    .map(entry => entry[1]);
}

/**
 * 创建初始统计对象
 * @param {number} totalRowsB - 文件B总行数
 * @returns {Object} 统计对象
 */
export function createStats(totalRowsB) {
  return {
    totalRowsB,
    matchedRows: 0,
    unmatchedRows: 0,
    exactMatches: 0,
    fuzzyMatches: 0,
    filledCells: 0,
    nullCells: 0,
  };
}

/**
 * 计算最终匹配率
 * @param {Object} stats - 统计对象
 * @returns {Object} 更新后的统计对象
 */
export function finalizeStats(stats) {
  stats.matchRate = ((stats.matchedRows / stats.totalRowsB) * 100).toFixed(2);
  stats.exactMatchRate = ((stats.exactMatches / stats.totalRowsB) * 100).toFixed(2);
  stats.fuzzyMatchRate = ((stats.fuzzyMatches / stats.totalRowsB) * 100).toFixed(2);
  stats.unmatchedRate = ((stats.unmatchedRows / stats.totalRowsB) * 100).toFixed(2);
  return stats;
}
