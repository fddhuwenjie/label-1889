// 共享数据匹配核心逻辑
// 同时被渲染端 DataProcessor 和主进程 ElectronDataProcessor 使用
// 修改匹配逻辑时只需修改此文件即可保持一致
import _ from 'lodash';

/**
 * 将 cell 值规范化为原始类型（防止 xlsx 返回 Date/对象）
 */
function normalizeValue(val) {
  if (_.isNil(val) || val === '') return val;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'object' && val.v !== undefined) return val.v;
  if (typeof val === 'object') return String(val);
  return val;
}

/**
 * 构建文件A的主键索引映射
 * @param {Array} fileAData - 文件A数据
 * @param {string} keyColumnA - 文件A主键列名
 * @returns {Map} 主键 -> 行数据的映射
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
 * 匹配单行数据并补充列值
 * @param {Object} rowB - 文件B的当前行
 * @param {number} rowIndex - 行索引
 * @param {Map} fileAMap - 文件A的主键索引
 * @param {string} keyColumnB - 文件B主键列名
 * @param {Array} selectedColumns - 要补充的列
 * @param {Object} stats - 统计对象（会被原地修改）
 * @returns {Object} 处理后的新行
 */
export function matchRow(rowB, rowIndex, fileAMap, keyColumnB, selectedColumns, stats) {
  // 规范化 rowB 的所有值，防止对象类型（Date / cell 对象）透传到渲染端
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
        // B 为空且 A 有值 → 补充
        newRow[col] = sourceVal;
        stats.filledCells++;
        filledColumns.push(col);
      } else if (targetHasValue) {
        // B 已有值 → 保留 B 原始值
        newRow[col] = targetVal;
      } else {
        // A 和 B 都为空
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
  return newRow;
}

/**
 * 创建初始统计对象
 */
export function createStats(totalRowsB) {
  return {
    totalRowsB,
    matchedRows: 0,
    unmatchedRows: 0,
    filledCells: 0,
    nullCells: 0,
  };
}

/**
 * 计算最终匹配率
 */
export function finalizeStats(stats) {
  stats.matchRate = ((stats.matchedRows / stats.totalRowsB) * 100).toFixed(2);
  return stats;
}
