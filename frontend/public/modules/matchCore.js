// 共享数据匹配核心逻辑 (CommonJS 版本，供主进程使用)
// 与 src/utils/matchCore.js 保持完全一致的匹配算法
// 修改匹配逻辑时只需同步修改这两个文件
const _ = require('lodash');

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
 * 匹配单行数据并补充列值
 */
function matchRow(rowB, rowIndex, fileAMap, keyColumnB, selectedColumns, stats) {
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
  return newRow;
}

function createStats(totalRowsB) {
  return {
    totalRowsB,
    matchedRows: 0,
    unmatchedRows: 0,
    filledCells: 0,
    nullCells: 0,
  };
}

function finalizeStats(stats) {
  stats.matchRate = ((stats.matchedRows / stats.totalRowsB) * 100).toFixed(2);
  return stats;
}

module.exports = { buildKeyMap, matchRow, createStats, finalizeStats };
