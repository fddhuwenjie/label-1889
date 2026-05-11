// Electron 数据处理器模块
// 技术栈: file-type + csv-parser + xlsx + progress + fs-extra + lodash
const fs = require('fs-extra');
const path = require('path');
const xlsx = require('xlsx');
const csvParser = require('csv-parser');
const { createReadStream } = require('fs');
const ProgressBar = require('progress');
const _ = require('lodash');
const { buildKeyMap, matchRow, createStats, finalizeStats, executeMatchRuleChain } = require('./matchCore');

const DATA_LIMITS = {
  MAX_ROWS: 100000,
  MAX_COLUMNS: 500,
};

class ElectronDataProcessor {
  constructor(config, backupManager, checkpointManager, logger) {
    this.config = config;
    this.backupManager = backupManager;
    this.checkpointManager = checkpointManager;
    this.logger = logger;
    this.currentSession = null;
    this.aborted = false;
    this.paused = false;
    this.currentResult = null;
  }

  // ============ file-type 深度验证 ============
  async validateFileType(filePath, ext) {
    try {
      const FileType = require('file-type');
      const buffer = Buffer.alloc(4100);
      const fsPromises = require('fs').promises;
      const fd = await fsPromises.open(filePath, 'r');
      await fd.read(buffer, 0, 4100, 0);
      await fd.close();
      const detected = await FileType.fromBuffer(buffer);

      if (ext === '.xlsx' && (!detected || detected.ext !== 'zip')) {
        throw new Error('文件内容与扩展名不匹配，不是有效的 XLSX 格式。\n修复建议：请用 Excel 重新保存。');
      }
      if (ext === '.xls' && (!detected || detected.ext !== 'cfb')) {
        throw new Error('文件内容与扩展名不匹配，不是有效的 XLS 格式。\n修复建议：请用 Excel 重新保存。');
      }
      if (ext === '.csv' && detected) {
        throw new Error(`文件内容与扩展名不匹配，检测到 ${detected.ext}，不是 CSV 文本格式。`);
      }
    } catch (e) {
      // 所有验证错误一律向上抛出，确保严格验证
      throw e;
    }
  }

  // ============ csv-parser 流式解析（带进度回调） ============
  parseCsvStream(filePath, fileSize, onProgress) {
    return new Promise((resolve, reject) => {
      const rows = [];
      let columns = null;
      let bytesRead = 0;

      // progress 库终端进度条
      const bar = new ProgressBar('  解析CSV [:bar] :percent :etas', {
        total: fileSize, width: 30, complete: '=', incomplete: ' ',
      });

      const rawStream = createReadStream(filePath);
      rawStream.on('data', (chunk) => {
        bytesRead += chunk.length;
        bar.tick(chunk.length);
        // 通过回调回传进度到渲染端
        if (onProgress) {
          onProgress({
            phase: 'parsing',
            percentage: Math.round((bytesRead / fileSize) * 100),
            bytesRead,
            totalBytes: fileSize,
          });
        }
      });

      const stream = rawStream
        .pipe(csvParser())
        .on('headers', (headers) => {
          columns = headers;
          if (columns.length > DATA_LIMITS.MAX_COLUMNS) {
            stream.destroy(new Error(`列数超过限制（最大 ${DATA_LIMITS.MAX_COLUMNS} 列）`));
          }
        })
        .on('data', (row) => {
          if (rows.length >= DATA_LIMITS.MAX_ROWS) {
            stream.destroy(new Error(`行数超过限制（最大 ${DATA_LIMITS.MAX_ROWS.toLocaleString()} 行）`));
            return;
          }
          rows.push(row);
        })
        .on('end', () => resolve({ data: rows, columns: columns || [] }))
        .on('error', reject);
    });
  }

  // ============ 带进度回传的文件解析（供 select-file IPC 使用） ============
  async parseFileWithProgress(filePath, onProgress) {
    const ext = path.extname(filePath).toLowerCase();
    const fileStat = await fs.stat(filePath);

    if (fileStat.size > this.config.MAX_FILE_SIZE) {
      throw new Error(`文件大小超过限制（最大${this.config.MAX_FILE_SIZE / 1024 / 1024}MB）`);
    }
    if (!this.config.SUPPORTED_FORMATS.includes(ext)) {
      throw new Error(`不支持的文件格式: ${ext}。支持的格式: ${this.config.SUPPORTED_FORMATS.join(', ')}`);
    }

    // 阶段1: 验证
    if (onProgress) onProgress({ phase: 'validating', percentage: 0 });
    await this.validateFileType(filePath, ext);

    // 阶段2: 解析
    if (onProgress) onProgress({ phase: 'parsing', percentage: 5 });

    let data = [];
    let columns = [];

    if (ext === '.csv') {
      const result = await this.parseCsvStream(filePath, fileStat.size, onProgress);
      data = result.data;
      columns = result.columns;
    } else {
      // Excel 解析（非流式，但通过阶段回调告知进度）
      if (onProgress) onProgress({ phase: 'parsing', percentage: 30 });
      const workbook = xlsx.readFile(filePath);
      if (onProgress) onProgress({ phase: 'parsing', percentage: 70 });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      data = xlsx.utils.sheet_to_json(worksheet, { defval: '' });
      if (data.length > 0) columns = Object.keys(data[0]);
      if (onProgress) onProgress({ phase: 'parsing', percentage: 90 });

      if (data.length > DATA_LIMITS.MAX_ROWS) {
        throw new Error(`行数超过限制（最大 ${DATA_LIMITS.MAX_ROWS.toLocaleString()} 行，当前 ${data.length.toLocaleString()} 行）`);
      }
      if (columns.length > DATA_LIMITS.MAX_COLUMNS) {
        throw new Error(`列数超过限制（最大 ${DATA_LIMITS.MAX_COLUMNS} 列，当前 ${columns.length} 列）`);
      }
    }

    if (onProgress) onProgress({ phase: 'done', percentage: 100 });
    return { data, columns, fileName: path.basename(filePath), filePath };
  }

  // ============ 通用解析（无进度回调，用于 process 内部） ============
  async parseFile(filePath) {
    return this.parseFileWithProgress(filePath, null);
  }

  // ============ 解析文件B（保留 workbook 对象） ============
  async parseFileB(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const fileStat = await fs.stat(filePath);

    if (fileStat.size > this.config.MAX_FILE_SIZE) {
      throw new Error(`文件大小超过限制（最大${this.config.MAX_FILE_SIZE / 1024 / 1024}MB）`);
    }
    if (!this.config.SUPPORTED_FORMATS.includes(ext)) {
      throw new Error(`不支持的文件格式: ${ext}`);
    }
    await this.validateFileType(filePath, ext);

    let data = [], columns = [];
    let _workbook = null, _worksheet = null, _sheetName = null;

    if (ext === '.csv') {
      const result = await this.parseCsvStream(filePath, fileStat.size, null);
      data = result.data;
      columns = result.columns;
    } else {
      _workbook = xlsx.readFile(filePath, { cellStyles: true, cellDates: true });
      _sheetName = _workbook.SheetNames[0];
      _worksheet = _workbook.Sheets[_sheetName];
      data = xlsx.utils.sheet_to_json(_worksheet, { defval: '', raw: false });
      if (data.length > 0) columns = Object.keys(data[0]);

      if (data.length > DATA_LIMITS.MAX_ROWS) throw new Error(`行数超过限制`);
      if (columns.length > DATA_LIMITS.MAX_COLUMNS) throw new Error(`列数超过限制`);
    }

    return { data, columns, fileName: path.basename(filePath), filePath, _workbook, _worksheet, _sheetName };
  }

  // ============ 数据处理（含自动回滚） ============
  async process(params, onProgress) {
    const { 
      fileAPath, fileBPath, keyColumnA, keyColumnB, 
      selectedColumns, sessionId, resume = false,
      useMatchRuleChain = false, matchRules = []
    } = params;

    this.currentSession = sessionId;
    this.aborted = false;
    this.paused = false;
    this.currentResult = null;

    const startTime = Date.now();
    this.logger.info('开始数据处理', { sessionId, resume });

    try {
      if (!resume) {
        await this.backupManager.createBackup(fileAPath, sessionId);
        await this.backupManager.createBackup(fileBPath, sessionId);
      }

      const fileA = await this.parseFile(fileAPath);
      const fileBResult = await this.parseFileB(fileBPath);

      let checkpoint = null;
      if (resume) {
        checkpoint = await this.checkpointManager.loadCheckpoint(sessionId);
      }

      const result = await this.matchData(
        fileA.data, fileBResult.data,
        keyColumnA, keyColumnB,
        selectedColumns,
        fileA.columns,
        checkpoint,
        onProgress,
        useMatchRuleChain,
        matchRules
      );

      // 如果是暂停导致的中断，保存检查点并返回
      if (result.isPaused) {
        return {
          success: false,
          message: '处理已暂停',
          canResume: true,
          isPaused: true,
        };
      }

      await this.checkpointManager.clearCheckpoint(sessionId);

      const duration = Date.now() - startTime;
      this.logger.info('数据处理完成', { sessionId, duration, stats: result.stats });

      return {
        success: true,
        ...result,
        columns: [...new Set([...fileBResult.columns, ...selectedColumns])],
        _originalWorkbook: fileBResult._workbook,
        _originalWorksheet: fileBResult._worksheet,
        _originalSheetName: fileBResult._sheetName,
        _originalColumns: fileBResult.columns,
      };

    } catch (error) {
      this.logger.error('数据处理失败', error, { sessionId });

      // ★ 自动回滚：失败时自动恢复备份文件到原始状态
      try {
        this.logger.info('处理失败，自动执行回滚', { sessionId });
        await this.backupManager.restoreBackup(sessionId, fileBPath);
        await this.backupManager.restoreBackup(sessionId, fileAPath);
        this.logger.info('自动回滚成功', { sessionId });
      } catch (rollbackErr) {
        this.logger.error('自动回滚失败', rollbackErr, { sessionId });
      }

      // 同时保存检查点以支持断点续处理
      if (this.currentResult && this.currentResult.processedCount > 0) {
        await this.checkpointManager.saveCheckpoint(sessionId, {
          processedCount: this.currentResult.processedCount,
          resultData: this.currentResult.resultData,
          stats: this.currentResult.stats,
          fileAPath,
          fileBPath,
          keyColumnA,
          keyColumnB,
          selectedColumns,
        });
      }

      return {
        success: false,
        message: error.message,
        autoRolledBack: true,
        canResume: this.currentResult ? this.currentResult.processedCount > 0 : false,
      };
    }
  }

  // ============ 数据匹配核心（使用共享 matchCore） ============
  async matchData(fileAData, fileBData, keyColumnA, keyColumnB, selectedColumns, fileAColumns, checkpoint, onProgress, useMatchRuleChain = false, matchRules = []) {
    const stats = createStats(fileBData.length);

    let startIndex = 0;
    let resultData = [];

    if (checkpoint) {
      startIndex = checkpoint.processedCount;
      resultData = checkpoint.resultData;
      Object.assign(stats, {
        matchedRows: checkpoint.stats?.matchedRows || 0,
        unmatchedRows: checkpoint.stats?.unmatchedRows || 0,
        exactMatches: checkpoint.stats?.exactMatches || 0,
        fuzzyMatches: checkpoint.stats?.fuzzyMatches || 0,
        filledCells: checkpoint.stats?.filledCells || 0,
        nullCells: checkpoint.stats?.nullCells || 0,
      });
    }

    if (useMatchRuleChain && matchRules.length > 0) {
      const resultData = executeMatchRuleChain(fileBData, fileAData, matchRules, selectedColumns, stats);
      finalizeStats(stats);
      
      if (onProgress) {
        onProgress({
          current: fileBData.length,
          total: fileBData.length,
          percentage: 100,
        });
      }
      
      return { resultData, stats };
    }

    const fileAMap = buildKeyMap(fileAData, keyColumnA);

    const timeoutAt = Date.now() + this.config.PROCESS_TIMEOUT;
    const progressInterval = Math.max(1, Math.min(50, Math.floor(fileBData.length / 100)));
    const YIELD_INTERVAL = 16;

    for (let i = startIndex; i < fileBData.length; i++) {
      if (this.aborted) {
        throw new Error('处理被用户中止');
      }

      if (this.paused) {
        this.currentResult = { processedCount: i, resultData, stats };
        await this.checkpointManager.saveCheckpoint(this.currentSession, this.currentResult);
        this.logger.info('处理已暂停', { sessionId: this.currentSession, processedCount: i });
        return { resultData, stats, isPaused: true };
      }

      if (Date.now() > timeoutAt) {
        throw new Error('处理超时，请尝试断点续处理');
      }

      const newRow = matchRow(fileBData[i], i, fileAMap, keyColumnB, selectedColumns, stats);
      resultData.push(newRow);

      if ((i + 1) % progressInterval === 0 || i === fileBData.length - 1) {
        this.currentResult = { processedCount: i + 1, resultData, stats };

        if (onProgress) {
          onProgress({
            current: i + 1,
            total: fileBData.length,
            percentage: Math.round(((i + 1) / fileBData.length) * 100),
          });
        }
      }

      if ((i + 1) % this.config.CHECKPOINT_INTERVAL === 0) {
        await this.checkpointManager.saveCheckpoint(this.currentSession, this.currentResult);
      }

      if ((i + 1) % YIELD_INTERVAL === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    finalizeStats(stats);
    return { resultData, stats };
  }

  // ============ 暂停（不抛错，优雅中断） ============
  pause() {
    this.paused = true;
    this.logger.info('暂停请求', { sessionId: this.currentSession });
  }

  // ============ 中止（强制停止） ============
  abort() {
    this.aborted = true;
    this.logger.info('中止请求', { sessionId: this.currentSession });
  }

  async rollback(sessionId, originalPath) {
    this.logger.info('开始回滚', { sessionId, originalPath });
    try {
      await this.backupManager.restoreBackup(sessionId, originalPath);
      await this.checkpointManager.clearCheckpoint(sessionId);
      return { success: true, message: '回滚成功' };
    } catch (error) {
      this.logger.error('回滚失败', error, { sessionId });
      return { success: false, message: error.message };
    }
  }
}

module.exports = ElectronDataProcessor;
