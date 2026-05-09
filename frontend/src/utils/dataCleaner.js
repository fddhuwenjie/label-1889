import _ from 'lodash';
import logger from './logger';

export const CLEANING_OPERATIONS = {
  TRIM_SPACES: 'trimSpaces',
  NORMALIZE_DATE: 'normalizeDate',
  REMOVE_DUPLICATES: 'removeDuplicates',
  FILL_NULLS: 'fillNulls',
};

export const FILL_NULLS_MODES = {
  DEFAULT_VALUE: 'defaultValue',
  PREVIOUS_ROW: 'previousRow',
};

const DATE_FORMATS = [
  /^\d{4}-\d{2}-\d{2}$/,
  /^\d{4}\/\d{2}\/\d{2}$/,
  /^\d{2}-\d{2}-\d{4}$/,
  /^\d{2}\/\d{2}\/\d{4}$/,
  /^\d{4}年\d{1,2}月\d{1,2}日$/,
  /^\d{1,2}月\d{1,2}日\d{4}年$/,
  /^\d{4}\d{2}\d{2}$/,
];

function detectDateFormat(dateStr) {
  const trimmed = dateStr.trim();
  
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { format: 'YYYY-MM-DD', parts: trimmed.split('-'), order: ['year', 'month', 'day'] };
  }
  
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(trimmed)) {
    return { format: 'YYYY/MM/DD', parts: trimmed.split('/'), order: ['year', 'month', 'day'] };
  }
  
  if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
    const parts = trimmed.split('-');
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    if (day <= 31 && month <= 12) {
      return { format: 'DD-MM-YYYY', parts, order: ['day', 'month', 'year'] };
    }
    return { format: 'MM-DD-YYYY', parts, order: ['month', 'day', 'year'] };
  }
  
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const parts = trimmed.split('/');
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    if (day <= 31 && month <= 12) {
      return { format: 'DD/MM/YYYY', parts, order: ['day', 'month', 'year'] };
    }
    return { format: 'MM/DD/YYYY', parts, order: ['month', 'day', 'year'] };
  }
  
  if (/^\d{4}年\d{1,2}月\d{1,2}日$/.test(trimmed)) {
    const match = trimmed.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
    if (match) {
      return { format: 'YYYY年MM月DD日', parts: [match[1], match[2], match[3]], order: ['year', 'month', 'day'] };
    }
  }
  
  if (/^\d{4}\d{2}\d{2}$/.test(trimmed)) {
    return { 
      format: 'YYYYMMDD', 
      parts: [trimmed.substring(0, 4), trimmed.substring(4, 6), trimmed.substring(6, 8)],
      order: ['year', 'month', 'day']
    };
  }
  
  return null;
}

function normalizeDate(dateStr) {
  if (!dateStr || dateStr === '') return dateStr;
  
  const dateInfo = detectDateFormat(String(dateStr));
  if (!dateInfo) return dateStr;
  
  const { parts, order } = dateInfo;
  
  let year, month, day;
  order.forEach((type, index) => {
    const value = parseInt(parts[index], 10);
    if (type === 'year') year = value;
    if (type === 'month') month = value;
    if (type === 'day') day = value;
  });
  
  if (year && month && day) {
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return dateStr;
    }
    
    const monthStr = String(month).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    
    return `${year}-${monthStr}-${dayStr}`;
  }
  
  return dateStr;
}

function isDateColumn(data, column) {
  if (!data || data.length === 0) return false;
  
  let dateCount = 0;
  const sampleSize = Math.min(100, data.length);
  
  for (let i = 0; i < sampleSize; i++) {
    const value = data[i][column];
    if (value !== null && value !== undefined && value !== '') {
      const dateInfo = detectDateFormat(String(value));
      if (dateInfo) {
        dateCount++;
      }
    }
  }
  
  return dateCount > sampleSize * 0.5;
}

export class DataCleaner {
  constructor() {
    this.stats = null;
  }

  trimSpaces(data, columns = null) {
    if (!data || data.length === 0) return { data, stats: { trimmedCells: 0 } };
    
    let trimmedCells = 0;
    const targetColumns = columns || Object.keys(data[0] || {});
    
    const cleanedData = data.map(row => {
      const newRow = { ...row };
      targetColumns.forEach(col => {
        if (typeof newRow[col] === 'string') {
          const original = newRow[col];
          const trimmed = original.trim();
          if (original !== trimmed) {
            newRow[col] = trimmed;
            trimmedCells++;
          }
        }
      });
      return newRow;
    });
    
    return {
      data: cleanedData,
      stats: { trimmedCells }
    };
  }

  normalizeDates(data, columns = null) {
    if (!data || data.length === 0) return { data, stats: { normalizedDates: 0, dateColumns: [] } };
    
    let normalizedDates = 0;
    const dateColumns = [];
    
    const allColumns = Object.keys(data[0] || {});
    const targetColumns = columns || allColumns.filter(col => isDateColumn(data, col));
    
    targetColumns.forEach(col => {
      if (isDateColumn(data, col)) {
        dateColumns.push(col);
      }
    });
    
    const cleanedData = data.map(row => {
      const newRow = { ...row };
      dateColumns.forEach(col => {
        if (newRow[col] !== null && newRow[col] !== undefined && newRow[col] !== '') {
          const original = String(newRow[col]);
          const normalized = normalizeDate(original);
          if (original !== normalized) {
            newRow[col] = normalized;
            normalizedDates++;
          }
        }
      });
      return newRow;
    });
    
    return {
      data: cleanedData,
      stats: { normalizedDates, dateColumns }
    };
  }

  removeDuplicates(data, keyColumns) {
    if (!data || data.length === 0 || !keyColumns || keyColumns.length === 0) {
      return { data, stats: { removedRows: 0, duplicateKeys: [] } };
    }
    
    const seenKeys = new Map();
    const duplicateKeys = [];
    const cleanedData = [];
    
    data.forEach((row, index) => {
      const keyValues = keyColumns.map(col => String(row[col] || '')).join('|||');
      
      if (seenKeys.has(keyValues)) {
        duplicateKeys.push({
          key: keyValues,
          originalIndex: seenKeys.get(keyValues),
          duplicateIndex: index
        });
      } else {
        seenKeys.set(keyValues, index);
        cleanedData.push(row);
      }
    });
    
    return {
      data: cleanedData,
      stats: { 
        removedRows: data.length - cleanedData.length,
        duplicateKeys: duplicateKeys.slice(0, 100)
      }
    };
  }

  fillNulls(data, columns, mode, defaultValue = '') {
    if (!data || data.length === 0) {
      return { data, stats: { filledCells: 0, filledColumns: [] } };
    }
    
    let filledCells = 0;
    const filledColumns = new Set();
    const targetColumns = columns || Object.keys(data[0] || {});
    
    let previousRow = null;
    
    const cleanedData = data.map((row, index) => {
      const newRow = { ...row };
      
      targetColumns.forEach(col => {
        const value = newRow[col];
        const isNull = value === null || value === undefined || value === '';
        
        if (isNull) {
          if (mode === FILL_NULLS_MODES.PREVIOUS_ROW && previousRow !== null) {
            const prevValue = previousRow[col];
            if (prevValue !== null && prevValue !== undefined && prevValue !== '') {
              newRow[col] = prevValue;
              filledCells++;
              filledColumns.add(col);
            }
          } else if (mode === FILL_NULLS_MODES.DEFAULT_VALUE) {
            newRow[col] = defaultValue;
            filledCells++;
            filledColumns.add(col);
          }
        }
      });
      
      previousRow = { ...newRow };
      return newRow;
    });
    
    return {
      data: cleanedData,
      stats: { 
        filledCells, 
        filledColumns: Array.from(filledColumns)
      }
    };
  }

  clean(data, options) {
    if (!data || data.length === 0) {
      return { data, stats: {}, logs: [] };
    }
    
    const logs = [];
    let currentData = [...data];
    const totalStats = {
      originalRows: data.length,
      originalColumns: Object.keys(data[0] || {}).length,
      operations: []
    };
    
    if (options[CLEANING_OPERATIONS.TRIM_SPACES]) {
      const result = this.trimSpaces(currentData, options.trimColumns);
      currentData = result.data;
      totalStats.trimmedCells = result.stats.trimmedCells;
      totalStats.operations.push({
        type: CLEANING_OPERATIONS.TRIM_SPACES,
        stats: result.stats
      });
      logs.push({
        level: 'info',
        message: `去除前后空格完成，共处理 ${result.stats.trimmedCells} 个单元格`,
        timestamp: new Date().toISOString()
      });
      logger.info('去除前后空格完成', { trimmedCells: result.stats.trimmedCells });
    }
    
    if (options[CLEANING_OPERATIONS.NORMALIZE_DATE]) {
      const result = this.normalizeDates(currentData, options.dateColumns);
      currentData = result.data;
      totalStats.normalizedDates = result.stats.normalizedDates;
      totalStats.dateColumns = result.stats.dateColumns;
      totalStats.operations.push({
        type: CLEANING_OPERATIONS.NORMALIZE_DATE,
        stats: result.stats
      });
      logs.push({
        level: 'info',
        message: `日期格式统一完成，共转换 ${result.stats.normalizedDates} 个日期值，涉及 ${result.stats.dateColumns.length} 列`,
        timestamp: new Date().toISOString()
      });
      logger.info('日期格式统一完成', { 
        normalizedDates: result.stats.normalizedDates,
        dateColumns: result.stats.dateColumns
      });
    }
    
    if (options[CLEANING_OPERATIONS.REMOVE_DUPLICATES] && options.duplicateKeyColumns && options.duplicateKeyColumns.length > 0) {
      const result = this.removeDuplicates(currentData, options.duplicateKeyColumns);
      currentData = result.data;
      totalStats.removedRows = result.stats.removedRows;
      totalStats.duplicateKeys = result.stats.duplicateKeys;
      totalStats.operations.push({
        type: CLEANING_OPERATIONS.REMOVE_DUPLICATES,
        stats: result.stats
      });
      logs.push({
        level: 'info',
        message: `去除重复行完成，共移除 ${result.stats.removedRows} 行重复数据`,
        timestamp: new Date().toISOString()
      });
      logger.info('去除重复行完成', { 
        removedRows: result.stats.removedRows,
        duplicateKeyColumns: options.duplicateKeyColumns
      });
    }
    
    if (options[CLEANING_OPERATIONS.FILL_NULLS] && options.fillNullsMode) {
      const result = this.fillNulls(
        currentData, 
        options.fillNullsColumns, 
        options.fillNullsMode, 
        options.fillNullsDefaultValue
      );
      currentData = result.data;
      totalStats.filledCells = result.stats.filledCells;
      totalStats.filledColumns = result.stats.filledColumns;
      totalStats.operations.push({
        type: CLEANING_OPERATIONS.FILL_NULLS,
        stats: result.stats
      });
      logs.push({
        level: 'info',
        message: `空值填充完成，共填充 ${result.stats.filledCells} 个空值，涉及 ${result.stats.filledColumns.length} 列`,
        timestamp: new Date().toISOString()
      });
      logger.info('空值填充完成', { 
        filledCells: result.stats.filledCells,
        filledColumns: result.stats.filledColumns,
        mode: options.fillNullsMode
      });
    }
    
    totalStats.finalRows = currentData.length;
    totalStats.finalColumns = Object.keys(currentData[0] || {}).length;
    
    logs.push({
      level: 'info',
      message: `数据清洗完成，原始 ${data.length} 行，清洗后 ${currentData.length} 行`,
      timestamp: new Date().toISOString()
    });
    logger.info('数据清洗完成', { 
      originalRows: data.length,
      finalRows: currentData.length,
      totalStats
    });
    
    return {
      data: currentData,
      stats: totalStats,
      logs
    };
  }

  generatePreview(originalData, cleanedData, options, previewSize = 10) {
    if (!originalData || originalData.length === 0) {
      return { before: [], after: [], changes: [] };
    }
    
    const previewOriginal = originalData.slice(0, previewSize);
    const previewCleaned = cleanedData.slice(0, previewSize);
    
    const changes = [];
    
    for (let i = 0; i < Math.min(previewOriginal.length, previewCleaned.length); i++) {
      const originalRow = previewOriginal[i];
      const cleanedRow = previewCleaned[i];
      const rowChanges = [];
      
      Object.keys(originalRow).forEach(col => {
        const originalVal = originalRow[col];
        const cleanedVal = cleanedRow[col];
        
        const originalStr = String(originalVal === null || originalVal === undefined ? '' : originalVal);
        const cleanedStr = String(cleanedVal === null || cleanedVal === undefined ? '' : cleanedVal);
        
        if (originalStr !== cleanedStr) {
          rowChanges.push({
            column: col,
            before: originalVal,
            after: cleanedVal
          });
        }
      });
      
      if (rowChanges.length > 0) {
        changes.push({
          rowIndex: i,
          changes: rowChanges
        });
      }
    }
    
    return {
      before: previewOriginal,
      after: previewCleaned,
      changes,
      totalChanges: changes.length
    };
  }
}

export default DataCleaner;
