// 数据处理核心逻辑 - 支持事务回滚和断点续处理
//
// ⚠️ 注意：此模块为渲染端实现，仅用于非 Electron 环境或单元测试。
// Electron 桌面版的实际运行路径为主进程的 ElectronDataProcessor
// （位于 public/modules/ElectronDataProcessor.js），通过 IPC 调用。
// 匹配核心逻辑已抽取到 matchCore.js，两端共享同一算法。
//
import { APP_CONFIG, PROCESS_STATUS, ANOMALY_CONFIG } from '../constants';
import logger from './logger';
import { buildKeyMap, matchRow, createStats, finalizeStats, buildKeyMapsForRules, matchRowWithRules } from './matchCore';
import _ from 'lodash';

/**
 * 数据处理器类 - 支持事务回滚和断点续处理
 */
export class DataProcessor {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.status = PROCESS_STATUS.IDLE;
    this.checkpoint = null;
    this.originalData = null;
    this.resultData = [];
    this.processedCount = 0;
    this.abortController = null;
    this.onProgress = null;
    this.onStatusChange = null;
  }

  /**
   * 设置进度回调
   */
  setProgressCallback(callback) {
    this.onProgress = callback;
  }

  /**
   * 设置状态变更回调
   */
  setStatusChangeCallback(callback) {
    this.onStatusChange = callback;
  }

  /**
   * 更新状态
   */
  _updateStatus(status) {
    this.status = status;
    if (this.onStatusChange) {
      this.onStatusChange(status);
    }
    logger.info(`处理状态变更: ${status}`, { sessionId: this.sessionId });
  }

  /**
   * 保存检查点 (用于断点续处理)
   */
  _saveCheckpoint() {
    this.checkpoint = {
      processedCount: this.processedCount,
      resultData: [...this.resultData],
      timestamp: Date.now(),
    };
    
    // 保存到 localStorage
    try {
      localStorage.setItem(
        `checkpoint_${this.sessionId}`,
        JSON.stringify(this.checkpoint)
      );
      logger.debug('检查点已保存', { 
        sessionId: this.sessionId, 
        processedCount: this.processedCount 
      });
    } catch (e) {
      logger.warn('检查点保存失败', { error: e.message });
    }
  }

  /**
   * 加载检查点
   */
  loadCheckpoint() {
    try {
      const saved = localStorage.getItem(`checkpoint_${this.sessionId}`);
      if (saved) {
        this.checkpoint = JSON.parse(saved);
        this.processedCount = this.checkpoint.processedCount;
        this.resultData = this.checkpoint.resultData;
        logger.info('检查点已加载', { 
          sessionId: this.sessionId, 
          processedCount: this.processedCount 
        });
        return true;
      }
    } catch (e) {
      logger.warn('检查点加载失败', { error: e.message });
    }
    return false;
  }

  /**
   * 清除检查点
   */
  clearCheckpoint() {
    try {
      localStorage.removeItem(`checkpoint_${this.sessionId}`);
      this.checkpoint = null;
      logger.debug('检查点已清除', { sessionId: this.sessionId });
    } catch (e) {
      logger.warn('检查点清除失败', { error: e.message });
    }
  }

  /**
   * 检测数据异常 - 使用 lodash 优化
   */
  detectAnomalies(fileAData, fileBData, keyColumnA, keyColumnB, selectedColumns) {
    const anomalies = [];

    // 使用 lodash 检测主键列数据类型
    const sampleA = _.take(fileAData, 100);
    const sampleB = _.take(fileBData, 100);
    const keyTypesA = _.uniq(sampleA.map(r => typeof r[keyColumnA]));
    const keyTypesB = _.uniq(sampleB.map(r => typeof r[keyColumnB]));
    
    if (keyTypesA.length > 1 || keyTypesB.length > 1) {
      anomalies.push({
        type: 'TYPE_MISMATCH',
        message: '主键列存在混合数据类型，可能影响匹配准确性',
        severity: 'warning',
      });
    }

    // 使用 lodash 检测空值比例
    selectedColumns.forEach(col => {
      const nullCount = _.filter(fileAData, r => 
        _.isNil(r[col]) || r[col] === ''
      ).length;
      const nullRatio = nullCount / fileAData.length;
      
      if (nullRatio > ANOMALY_CONFIG.NULL_RATIO_WARNING) {
        anomalies.push({
          type: 'HIGH_NULL_RATIO',
          message: `列 "${col}" 空值比例较高 (${(nullRatio * 100).toFixed(1)}%)`,
          severity: 'warning',
          column: col,
        });
      }
    });

    // 使用 lodash 预估匹配率
    const sampleSize = Math.min(100, fileBData.length);
    const fileAKeys = new Set(fileAData.map(r => _.trim(String(r[keyColumnA] || ''))));
    const sampleBData = _.take(fileBData, sampleSize);
    const matchCount = _.filter(sampleBData, row => {
      const key = _.trim(String(row[keyColumnB] || ''));
      return fileAKeys.has(key);
    }).length;
    
    const estimatedMatchRate = matchCount / sampleSize;
    if (estimatedMatchRate < ANOMALY_CONFIG.MATCH_RATE_WARNING) {
      anomalies.push({
        type: 'LOW_MATCH_RATE',
        message: `预估匹配率较低 (${(estimatedMatchRate * 100).toFixed(1)}%)，请确认主键列选择正确`,
        severity: 'warning',
      });
    }

    // 检测重复主键
    const duplicateKeysA = _(fileAData)
      .map(r => _.trim(String(r[keyColumnA] || '')))
      .filter(k => k !== '')
      .countBy()
      .pickBy(count => count > 1)
      .keys()
      .value();
    
    if (duplicateKeysA.length > 0) {
      anomalies.push({
        type: 'DUPLICATE_KEYS',
        message: `源文件主键列存在 ${duplicateKeysA.length} 个重复值，可能导致数据覆盖`,
        severity: 'warning',
        duplicateCount: duplicateKeysA.length,
      });
    }

    return anomalies;
  }

  /**
   * 执行数据处理 (支持断点续处理)
   * @param {Array} fileAData - 文件A数据
   * @param {Array} fileBData - 文件B数据
   * @param {string} keyColumnA - 文件A主键列名（传统模式）
   * @param {string} keyColumnB - 文件B主键列名（传统模式）
   * @param {Array} selectedColumns - 要补充的列
   * @param {Object} options - 配置选项
   * @param {Array} [options.matchRules] - 匹配规则链（新功能，优先级高于传统模式）
   * @param {boolean} [options.resume=false] - 是否从断点恢复
   * @param {number} [options.timeout] - 超时时间
   * @returns {Promise<Object>} 处理结果
   */
  async process(fileAData, fileBData, keyColumnA, keyColumnB, selectedColumns, options = {}) {
    const { resume = false, timeout = APP_CONFIG.PROCESS_TIMEOUT, matchRules = null } = options;

    this._updateStatus(PROCESS_STATUS.PROCESSING);
    this.abortController = new AbortController();

    // 保存原始数据用于回滚
    this.originalData = {
      fileAData: [...fileAData],
      fileBData: [...fileBData],
    };

    const stats = createStats(fileBData.length);

    // 根据是否有匹配规则链选择处理模式
    let useMatchRules = false;
    let fileAMap = null;
    let fileAMaps = null;

    if (matchRules && matchRules.length > 0) {
      useMatchRules = true;
      fileAMaps = buildKeyMapsForRules(fileAData, matchRules);
      logger.info('使用匹配规则链模式', { 
        ruleCount: matchRules.length,
        sessionId: this.sessionId 
      });
    } else {
      // 传统精确匹配模式（向后兼容）
      fileAMap = buildKeyMap(fileAData, keyColumnA);
      logger.info('使用传统精确匹配模式', { sessionId: this.sessionId });
    }

    // 确定起始位置
    let startIndex = 0;
    if (resume && this.checkpoint) {
      startIndex = this.checkpoint.processedCount;
      this.resultData = [...this.checkpoint.resultData];
      logger.info('从断点恢复处理', { startIndex, sessionId: this.sessionId });
    } else {
      this.resultData = [];
      this.processedCount = 0;
    }

    // 设置超时
    const timeoutId = setTimeout(() => {
      if (this.status === PROCESS_STATUS.PROCESSING) {
        logger.warn('处理超时', { sessionId: this.sessionId, timeout });
        this.pause();
      }
    }, timeout);

    try {
      for (let i = startIndex; i < fileBData.length; i++) {
        // 检查是否被中止
        if (this.abortController.signal.aborted) {
          logger.info('处理被中止', { sessionId: this.sessionId, processedCount: i });
          break;
        }

        // 检查是否暂停
        if (this.status === PROCESS_STATUS.PAUSED) {
          this._saveCheckpoint();
          break;
        }

        let newRow;
        if (useMatchRules) {
          newRow = matchRowWithRules(
            fileBData[i],
            i,
            matchRules,
            fileAMaps,
            fileAData,
            selectedColumns,
            stats
          );
        } else {
          newRow = matchRow(fileBData[i], i, fileAMap, keyColumnB, selectedColumns, stats);
        }

        this.resultData.push(newRow);
        this.processedCount = i + 1;

        // 定期保存检查点
        if ((i + 1) % APP_CONFIG.CHECKPOINT_INTERVAL === 0) {
          this._saveCheckpoint();
        }

        // 报告进度
        if (this.onProgress && (i + 1) % 100 === 0) {
          this.onProgress({
            current: i + 1,
            total: fileBData.length,
            percentage: Math.round(((i + 1) / fileBData.length) * 100),
          });
        }
      }

      clearTimeout(timeoutId);

      if (this.status !== PROCESS_STATUS.PAUSED) {
        finalizeStats(stats);
        this._updateStatus(PROCESS_STATUS.COMPLETED);
        this.clearCheckpoint();

        logger.info('数据处理完成', {
          sessionId: this.sessionId,
          stats
        });
      }

      return {
        success: true,
        resultData: this.resultData,
        stats,
        columns: [...new Set([...Object.keys(fileBData[0] || {}), ...selectedColumns])],
        isPaused: this.status === PROCESS_STATUS.PAUSED,
        useMatchRules,
      };

    } catch (error) {
      clearTimeout(timeoutId);
      logger.error('数据处理失败', error, { sessionId: this.sessionId });

      // 失败自动回滚到初始状态
      this.rollback();
      const autoRolledBack = true;

      this._updateStatus(PROCESS_STATUS.ERROR);
      this._saveCheckpoint(); // 保存检查点以便恢复

      return {
        success: false,
        message: error.message,
        canResume: this.processedCount > 0,
        autoRolledBack,
      };
    }
  }

  /**
   * 暂停处理
   */
  pause() {
    if (this.status === PROCESS_STATUS.PROCESSING) {
      this._updateStatus(PROCESS_STATUS.PAUSED);
      this._saveCheckpoint();
      logger.info('处理已暂停', { 
        sessionId: this.sessionId, 
        processedCount: this.processedCount 
      });
    }
  }

  /**
   * 中止处理
   */
  abort() {
    if (this.abortController) {
      this.abortController.abort();
    }
    this._updateStatus(PROCESS_STATUS.IDLE);
    logger.info('处理已中止', { sessionId: this.sessionId });
  }

  /**
   * 回滚到原始状态 - 真正实现数据回滚
   */
  rollback() {
    this._updateStatus(PROCESS_STATUS.ROLLING_BACK);
    
    try {
      // 清除处理结果
      this.resultData = [];
      this.processedCount = 0;
      
      // 清除检查点
      this.clearCheckpoint();
      
      // 重置原始数据引用
      this.originalData = null;
      
      this._updateStatus(PROCESS_STATUS.IDLE);
      logger.info('数据已回滚到原始状态', { sessionId: this.sessionId });
      
      return {
        success: true,
        message: '数据已回滚到原始状态',
      };
    } catch (error) {
      logger.error('回滚失败', error, { sessionId: this.sessionId });
      this._updateStatus(PROCESS_STATUS.ERROR);
      
      return {
        success: false,
        message: '回滚失败: ' + error.message,
      };
    }
  }

  /**
   * 获取原始数据（用于外部回滚）
   */
  getOriginalData() {
    return this.originalData;
  }

  /**
   * 获取当前状态
   */
  getStatus() {
    return {
      status: this.status,
      processedCount: this.processedCount,
      hasCheckpoint: !!this.checkpoint,
      checkpointTime: this.checkpoint?.timestamp,
    };
  }
}

export default DataProcessor;
