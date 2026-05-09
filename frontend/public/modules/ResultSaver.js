// 结果文件保存模块 — 从 electron.js 拆分出来
const path = require('path');
const fs = require('fs-extra');
const xlsx = require('xlsx');
const Papa = require('papaparse');

class ResultSaver {
  constructor(logger) {
    this.logger = logger;
    this.lastProcessResult = null;
  }

  /**
   * 缓存处理结果中的原始 workbook 信息
   */
  cacheProcessResult(result) {
    this.lastProcessResult = {
      _originalWorkbook: result._originalWorkbook,
      _originalWorksheet: result._originalWorksheet,
      _originalSheetName: result._originalSheetName,
      _originalColumns: result._originalColumns,
    };
  }

  /**
   * 生成默认文件名
   */
  generateDefaultFileName(originalFileName, fileAName) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const baseNameB = path.basename(originalFileName, path.extname(originalFileName));
    const baseNameA = fileAName ? path.basename(fileAName, path.extname(fileAName)) : '';
    return baseNameA
      ? `${baseNameA}_${baseNameB}_processed_${timestamp}`
      : `${baseNameB}_processed_${timestamp}`;
  }

  /**
   * 清理数据中的内部字段
   */
  cleanData(data) {
    return data.map(row => {
      const { _rowIndex, _filledColumns, _matched, ...cleanRow } = row;
      return cleanRow;
    });
  }

  /**
   * 保存为 CSV 格式
   */
  async saveCsv(savePath, cleanData) {
    const csv = Papa.unparse(cleanData);
    const tmpPath = savePath + '.tmp';
    await fs.writeFile(tmpPath, '\ufeff' + csv, 'utf-8');
    await fs.rename(tmpPath, savePath);
    this.logger.info('CSV 结果已保存', { savePath });
    return { success: true, filePath: savePath };
  }

  /**
   * 保存为 Excel 格式（原位写入策略）
   */
  async saveExcel(savePath, cleanData, selectedColumns) {
    const wb = this.lastProcessResult?._originalWorkbook;
    const ws = this.lastProcessResult?._originalWorksheet;
    const sheetName = this.lastProcessResult?._originalSheetName;
    const origCols = this.lastProcessResult?._originalColumns || [];

    if (wb && ws && sheetName) {
      const newColumns = selectedColumns.filter(col => !origCols.includes(col));
      const targetColSet = new Set(selectedColumns);
      const allColumns = [...origCols, ...newColumns];

      // 写入新增列的表头
      newColumns.forEach(col => {
        const colIdx = allColumns.indexOf(col);
        const cellRef = xlsx.utils.encode_cell({ r: 0, c: colIdx });
        if (!ws[cellRef]) {
          ws[cellRef] = { t: 's', v: col };
        }
      });

      // 写入数据行 — 仅修改目标列的 cell.v
      cleanData.forEach((row, rowIdx) => {
        const r = rowIdx + 1;
        allColumns.forEach((col, colIdx) => {
          if (!targetColSet.has(col)) return;

          const cellRef = xlsx.utils.encode_cell({ r, c: colIdx });
          const value = row[col];

          if (ws[cellRef]) {
            if (value !== null && value !== undefined && value !== '') {
              ws[cellRef].v = value;
            }
          } else {
            if (value === null || value === undefined || value === '') {
              // 空值：不创建单元格
            } else if (value instanceof Date) {
              const dateNum = (value - new Date(Date.UTC(1899, 11, 30))) / 86400000;
              ws[cellRef] = { t: 'n', v: dateNum, z: 'yyyy-mm-dd' };
            } else if (typeof value === 'number') {
              ws[cellRef] = { t: 'n', v: value };
            } else if (typeof value === 'boolean') {
              ws[cellRef] = { t: 'b', v: value };
            } else {
              ws[cellRef] = { t: 's', v: String(value) };
            }
          }
        });
      });

      const range = xlsx.utils.decode_range(ws['!ref'] || 'A1');
      range.e.r = Math.max(range.e.r, cleanData.length);
      range.e.c = Math.max(range.e.c, allColumns.length - 1);
      ws['!ref'] = xlsx.utils.encode_range(range);

      xlsx.writeFile(wb, savePath + '.tmp');
      await fs.rename(savePath + '.tmp', savePath);
      this.logger.info('Excel 结果已保存（保留原始格式）', { savePath });
      return { success: true, filePath: savePath };
    }

    // 无原始 workbook 引用时，常规生成
    const worksheet = xlsx.utils.json_to_sheet(cleanData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    xlsx.writeFile(workbook, savePath + '.tmp');
    await fs.rename(savePath + '.tmp', savePath);
    this.logger.info('Excel 结果已保存', { savePath });
    return { success: true, filePath: savePath };
  }

  /**
   * 保存结果文件（含 Excel 失败降级为 CSV）
   */
  async save(savePath, data, format, selectedColumns) {
    const cleanData = this.cleanData(data);

    if (format === 'csv') {
      try {
        return await this.saveCsv(savePath, cleanData);
      } catch (error) {
        await fs.remove(savePath + '.tmp').catch(() => {});
        this.logger.error('CSV 保存失败', error);
        return { success: false, message: error.message };
      }
    }

    // Excel 格式
    try {
      return await this.saveExcel(savePath, cleanData, selectedColumns);
    } catch (excelError) {
      await fs.remove(savePath + '.tmp').catch(() => {});
      this.logger.error('Excel 保存失败，尝试降级为 CSV', excelError);
      const csvFallbackPath = savePath.replace(/\.xlsx$/i, '.csv');
      try {
        const result = await this.saveCsv(csvFallbackPath, cleanData);
        this.logger.info('已降级保存为 CSV', { csvFallbackPath });
        return {
          ...result,
          warning: `Excel 保存失败（${excelError.message}），已自动保存为 CSV 格式: ${csvFallbackPath}`,
        };
      } catch (csvError) {
        this.logger.error('CSV 降级保存也失败', csvError);
        return { success: false, message: `Excel 保存失败: ${excelError.message}，CSV 降级保存也失败: ${csvError.message}` };
      }
    }
  }
}

module.exports = ResultSaver;
