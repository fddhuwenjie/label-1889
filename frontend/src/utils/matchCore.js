// 共享数据匹配核心逻辑
// 同时被渲染端 DataProcessor 和主进程 ElectronDataProcessor 使用
// 修改匹配逻辑时只需修改此文件即可保持一致
import _ from 'lodash';
import { MATCH_TYPE, FUZZY_STRATEGY, LEVENSHTEIN_THRESHOLD_RANGE } from '../constants';

/**
 * 将 cell 值规范化为原始类型（防止 xlsx 返回 Date/对象）
 * @param {*} val - 原始单元格值
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
 * @param {string} a - 源字符串
 * @param {string} b - 目标字符串
 * @returns {number} 编辑距离值
 */
export function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = [i];
  }
  for (let j = 1; j <= n; j++) {
    dp[0][j] = j;
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a.charAt(i - 1) === b.charAt(j - 1)) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j - 1],
          dp[i - 1][j],
          dp[i][j - 1]
        );
      }
    }
  }
  return dp[m][n];
}

/**
 * 去除字符串中的空格和标点符号
 * @param {string} str - 输入字符串
 * @returns {string} 去除空格和标点后的字符串
 */
function removeSpaceAndPunctuation(str) {
  return str.replace(/[\s\p{P}]/gu, '');
}

/**
 * 模糊匹配单步转换：根据策略对字符串进行规范化
 * @param {string} str - 输入字符串
 * @param {string} strategy - 策略名称 (ignoreCase / ignoreSpacePunctuation)
 * @returns {string} 规范化后的字符串
 */
function normalizeByStrategy(str, strategy) {
  switch (strategy) {
    case FUZZY_STRATEGY.IGNORE_CASE:
      return str.toLowerCase();
    case FUZZY_STRATEGY.IGNORE_SPACE_PUNCTUATION:
      return removeSpaceAndPunctuation(str);
    default:
      return str;
  }
}

/**
 * 使用链式模糊策略匹配单个键值与候选项集合
 * 按"忽略大小写 → 忽略空格标点 → 编辑距离"的优先级链式执行
 * 前一步匹配成功则不再执行后续步骤
 * @param {string} keyValue - 待匹配的主键值
 * @param {Array<{key: string, row: Object, index: number}>} candidates - 候选项列表
 * @param {Object} fuzzyConfig - 模糊匹配配置
 * @param {boolean} fuzzyConfig.ignoreCase - 是否忽略大小写
 * @param {boolean} fuzzyConfig.ignoreSpacePunctuation - 是否忽略空格与标点符号
 * @param {boolean} fuzzyConfig.levenshtein - 是否启用编辑距离容忍
 * @param {number} fuzzyConfig.levenshteinThreshold - 编辑距离阈值
 * @returns {{ matched: boolean, matchType: string, matchedRow: Object|null, matchedIndex: number }} 匹配结果
 */
export function fuzzyMatchKey(keyValue, candidates, fuzzyConfig) {
  const { ignoreCase, ignoreSpacePunctuation, levenshtein, levenshteinThreshold } = fuzzyConfig;

  const chainSteps = [];
  if (ignoreCase) chainSteps.push(FUZZY_STRATEGY.IGNORE_CASE);
  if (ignoreSpacePunctuation) chainSteps.push(FUZZY_STRATEGY.IGNORE_SPACE_PUNCTUATION);

  for (const step of chainSteps) {
    const normalizedKey = normalizeByStrategy(keyValue, step);
    const matches = [];
    for (const candidate of candidates) {
      const normalizedCandidate = normalizeByStrategy(candidate.key, step);
      if (normalizedKey === normalizedCandidate) {
        matches.push(candidate);
      }
    }
    if (matches.length > 0) {
      const best = matches[0];
      return { matched: true, matchType: MATCH_TYPE.FUZZY, matchedRow: best.row, matchedIndex: best.index };
    }
  }

  if (levenshtein) {
    const threshold = Math.max(
      LEVENSHTEIN_THRESHOLD_RANGE.min,
      Math.min(LEVENSHTEIN_THRESHOLD_RANGE.max, levenshteinThreshold || 1)
    );
    let bestDist = Infinity;
    let bestCandidate = null;
    for (const candidate of candidates) {
      const dist = levenshteinDistance(keyValue, candidate.key);
      if (dist <= threshold) {
        if (dist < bestDist) {
          bestDist = dist;
          bestCandidate = candidate;
        } else if (dist === bestDist && bestCandidate && candidate.index < bestCandidate.index) {
          bestCandidate = candidate;
        }
      }
    }
    if (bestCandidate) {
      return { matched: true, matchType: MATCH_TYPE.FUZZY, matchedRow: bestCandidate.row, matchedIndex: bestCandidate.index };
    }
  }

  return { matched: false, matchType: MATCH_TYPE.NONE, matchedRow: null, matchedIndex: -1 };
}

/**
 * 构建文件A的主键索引映射
 * @param {Array<Object>} fileAData - 文件A数据
 * @param {string} keyColumnA - 文件A主键列名
 * @returns {Map<string, Object>} 主键 -> 行数据的映射
 */
export function buildKeyMap(fileAData, keyColumnA) {
  const fileAMap = new Map();
  _.forEach(fileAData, row => {
    const key = _.trim(String(row[keyColumnA] || ''));
    if (key) fileAMap.set(key, row);
  });
  return fileAMap;
}

/**
 * 构建文件A的主键候选项列表（用于模糊匹配）
 * @param {Array<Object>} fileAData - 文件A数据
 * @param {string} keyColumnA - 文件A主键列名
 * @returns {Array<{key: string, row: Object, index: number}>} 候选项列表
 */
export function buildCandidateList(fileAData, keyColumnA) {
  const seen = new Map();
  _.forEach(fileAData, (row, index) => {
    const key = _.trim(String(row[keyColumnA] || ''));
    if (key && !seen.has(key)) {
      seen.set(key, { key, row, index });
    }
  });
  return [...seen.values()];
}

/**
 * 匹配单行数据并补充列值（单规则精确匹配）
 * @param {Object} rowB - 文件B的当前行
 * @param {number} rowIndex - 行索引
 * @param {Map<string, Object>} fileAMap - 文件A的主键索引
 * @param {string} keyColumnB - 文件B主键列名
 * @param {Array<string>} selectedColumns - 要补充的列
 * @param {Object} stats - 统计对象（会被原地修改）
 * @returns {Object} 处理后的新行
 */
export function matchRow(rowB, rowIndex, fileAMap, keyColumnB, selectedColumns, stats) {
  const normalizedRowB = {};
  for (const key of Object.keys(rowB)) {
    normalizedRowB[key] = normalizeValue(rowB[key]);
  }

  const newRow = { ...normalizedRowB, _rowIndex: rowIndex };
  const keyValue = _.trim(String(normalizedRowB[keyColumnB] || ''));
  const matchedRowA = fileAMap.get(keyValue);

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
  } else {
    _.forEach(selectedColumns, col => {
      const existingVal = normalizedRowB[col];
      newRow[col] = _.isNil(existingVal) ? null : existingVal;
      if (_.isNil(existingVal) || existingVal === '') {
        stats.nullCells++;
      }
    });
    stats.unmatchedRows++;
  }

  newRow._filledColumns = filledColumns;
  newRow._matched = !!matchedRowA;
  newRow._matchType = matchedRowA ? MATCH_TYPE.EXACT : MATCH_TYPE.NONE;
  return newRow;
}

/**
 * 使用单条规则匹配行（支持精确 + 模糊匹配）
 * @param {Object} rowB - 文件B的当前行
 * @param {number} rowIndex - 行索引
 * @param {Map<string, Object>} fileAMap - 文件A精确匹配索引
 * @param {Array<{key: string, row: Object, index: number}>} candidates - 文件A候选项列表
 * @param {string} keyColumnB - 文件B主键列名
 * @param {Array<string>} selectedColumns - 要补充的列
 * @param {Object} stats - 统计对象（会被原地修改）
 * @param {Object} fuzzyConfig - 模糊匹配配置
 * @returns {Object} 处理后的新行
 */
export function matchRowWithRule(rowB, rowIndex, fileAMap, candidates, keyColumnB, selectedColumns, stats, fuzzyConfig) {
  const normalizedRowB = {};
  for (const key of Object.keys(rowB)) {
    normalizedRowB[key] = normalizeValue(rowB[key]);
  }

  const newRow = { ...normalizedRowB, _rowIndex: rowIndex };
  const keyValue = _.trim(String(normalizedRowB[keyColumnB] || ''));

  const exactMatch = fileAMap.get(keyValue);
  let matchedRowA = null;
  let matchType = MATCH_TYPE.NONE;

  if (exactMatch) {
    matchedRowA = exactMatch;
    matchType = MATCH_TYPE.EXACT;
  } else if (keyValue && fuzzyConfig && (fuzzyConfig.ignoreCase || fuzzyConfig.ignoreSpacePunctuation || fuzzyConfig.levenshtein)) {
    const fuzzyResult = fuzzyMatchKey(keyValue, candidates, fuzzyConfig);
    if (fuzzyResult.matched) {
      matchedRowA = fuzzyResult.matchedRow;
      matchType = MATCH_TYPE.FUZZY;
    }
  }

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
    if (matchType === MATCH_TYPE.EXACT) {
      stats.exactMatchedRows++;
    } else {
      stats.fuzzyMatchedRows++;
    }
  } else {
    _.forEach(selectedColumns, col => {
      const existingVal = normalizedRowB[col];
      newRow[col] = _.isNil(existingVal) ? null : existingVal;
      if (_.isNil(existingVal) || existingVal === '') {
        stats.nullCells++;
      }
    });
    stats.unmatchedRows++;
  }

  newRow._filledColumns = filledColumns;
  newRow._matched = !!matchedRowA;
  newRow._matchType = matchType;
  return newRow;
}

/**
 * 使用匹配规则链匹配单行数据
 * 按规则顺序依次执行，前一条规则未匹配成功的行才进入下一条规则
 * @param {Object} rowB - 文件B的当前行
 * @param {number} rowIndex - 行索引
 * @param {Array<Object>} ruleContexts - 规则上下文数组 [{ fileAMap, candidates, rule }]
 * @param {Array<string>} selectedColumns - 要补充的列
 * @param {Object} stats - 统计对象（会被原地修改）
 * @returns {Object} 处理后的新行
 */
export function matchRowWithRuleChain(rowB, rowIndex, ruleContexts, selectedColumns, stats) {
  const normalizedRowB = {};
  for (const key of Object.keys(rowB)) {
    normalizedRowB[key] = normalizeValue(rowB[key]);
  }

  const newRow = { ...normalizedRowB, _rowIndex: rowIndex };
  let matchedRowA = null;
  let matchType = MATCH_TYPE.NONE;
  let matchedRuleIndex = -1;

  for (let ri = 0; ri < ruleContexts.length; ri++) {
    const { fileAMap, candidates, rule } = ruleContexts[ri];
    const keyValue = _.trim(String(normalizedRowB[rule.keyColumnB] || ''));

    const exactMatch = fileAMap.get(keyValue);
    if (exactMatch) {
      matchedRowA = exactMatch;
      matchType = MATCH_TYPE.EXACT;
      matchedRuleIndex = ri;
      break;
    }

    const fuzzyConfig = rule.fuzzyConfig || {};
    if (keyValue && (fuzzyConfig.ignoreCase || fuzzyConfig.ignoreSpacePunctuation || fuzzyConfig.levenshtein)) {
      const fuzzyResult = fuzzyMatchKey(keyValue, candidates, fuzzyConfig);
      if (fuzzyResult.matched) {
        matchedRowA = fuzzyResult.matchedRow;
        matchType = MATCH_TYPE.FUZZY;
        matchedRuleIndex = ri;
        break;
      }
    }
  }

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
    if (matchType === MATCH_TYPE.EXACT) {
      stats.exactMatchedRows++;
    } else {
      stats.fuzzyMatchedRows++;
    }
  } else {
    _.forEach(selectedColumns, col => {
      const existingVal = normalizedRowB[col];
      newRow[col] = _.isNil(existingVal) ? null : existingVal;
      if (_.isNil(existingVal) || existingVal === '') {
        stats.nullCells++;
      }
    });
    stats.unmatchedRows++;
  }

  newRow._filledColumns = filledColumns;
  newRow._matched = !!matchedRowA;
  newRow._matchType = matchType;
  newRow._matchedRuleIndex = matchedRuleIndex;
  return newRow;
}

/**
 * 创建初始统计对象
 * @param {number} totalRowsB - 文件B的总行数
 * @returns {Object} 统计对象
 */
export function createStats(totalRowsB) {
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
 * 计算最终匹配率
 * @param {Object} stats - 统计对象
 * @returns {Object} 更新后的统计对象
 */
export function finalizeStats(stats) {
  stats.matchedRows = stats.exactMatchedRows + stats.fuzzyMatchedRows;
  stats.matchRate = stats.totalRowsB > 0 ? ((stats.matchedRows / stats.totalRowsB) * 100).toFixed(2) : '0.00';
  stats.exactMatchRate = stats.totalRowsB > 0 ? ((stats.exactMatchedRows / stats.totalRowsB) * 100).toFixed(2) : '0.00';
  stats.fuzzyMatchRate = stats.totalRowsB > 0 ? ((stats.fuzzyMatchedRows / stats.totalRowsB) * 100).toFixed(2) : '0.00';
  stats.unmatchedRate = stats.totalRowsB > 0 ? ((stats.unmatchedRows / stats.totalRowsB) * 100).toFixed(2) : '0.00';
  return stats;
}
