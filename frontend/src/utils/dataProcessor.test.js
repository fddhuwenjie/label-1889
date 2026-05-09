/**
 * 数据处理器单元测试
 */
import { DataProcessor } from './dataProcessor';
import { PROCESS_STATUS } from '../constants';

describe('DataProcessor', () => {
  let processor;
  const sessionId = 'test-session-123';

  beforeEach(() => {
    processor = new DataProcessor(sessionId);
    // 清理 localStorage
    localStorage.clear();
  });

  describe('初始化', () => {
    test('应该正确初始化处理器', () => {
      expect(processor.sessionId).toBe(sessionId);
      expect(processor.status).toBe(PROCESS_STATUS.IDLE);
      expect(processor.processedCount).toBe(0);
      expect(processor.resultData).toEqual([]);
    });
  });

  describe('异常检测', () => {
    const fileAData = [
      { id: '001', name: '张三', dept: '技术部', salary: 15000 },
      { id: '002', name: '李四', dept: '市场部', salary: 12000 },
      { id: '003', name: '王五', dept: '技术部', salary: 18000 },
    ];

    const fileBData = [
      { id: '001', name: '张三', email: 'zhangsan@test.com' },
      { id: '002', name: '李四', email: 'lisi@test.com' },
      { id: '004', name: '赵六', email: 'zhaoliu@test.com' },
    ];

    test('应该检测到低匹配率', () => {
      const lowMatchFileB = [
        { id: '100', name: '测试1' },
        { id: '101', name: '测试2' },
        { id: '102', name: '测试3' },
      ];

      const anomalies = processor.detectAnomalies(
        fileAData, lowMatchFileB, 'id', 'id', ['dept', 'salary']
      );

      const lowMatchAnomaly = anomalies.find(a => a.type === 'LOW_MATCH_RATE');
      expect(lowMatchAnomaly).toBeDefined();
      expect(lowMatchAnomaly.severity).toBe('warning');
    });

    test('应该检测到高空值比例', () => {
      const fileAWithNulls = [
        { id: '001', name: '张三', dept: '', salary: null },
        { id: '002', name: '李四', dept: '', salary: null },
        { id: '003', name: '王五', dept: '', salary: null },
      ];

      const anomalies = processor.detectAnomalies(
        fileAWithNulls, fileBData, 'id', 'id', ['dept', 'salary']
      );

      const highNullAnomaly = anomalies.find(a => a.type === 'HIGH_NULL_RATIO');
      expect(highNullAnomaly).toBeDefined();
    });

    test('应该检测到重复主键', () => {
      const fileAWithDuplicates = [
        { id: '001', name: '张三', dept: '技术部' },
        { id: '001', name: '张三2', dept: '市场部' },
        { id: '002', name: '李四', dept: '技术部' },
      ];

      const anomalies = processor.detectAnomalies(
        fileAWithDuplicates, fileBData, 'id', 'id', ['dept']
      );

      const duplicateAnomaly = anomalies.find(a => a.type === 'DUPLICATE_KEYS');
      expect(duplicateAnomaly).toBeDefined();
      expect(duplicateAnomaly.duplicateCount).toBe(1);
    });
  });

  describe('数据处理', () => {
    const fileAData = [
      { id: '001', name: '张三', dept: '技术部', salary: 15000 },
      { id: '002', name: '李四', dept: '市场部', salary: 12000 },
      { id: '003', name: '王五', dept: '技术部', salary: 18000 },
    ];

    // 文件B中 dept/salary 列不存在（空），所以会被补充
    const fileBData = [
      { id: '001', name: '张三', email: 'zhangsan@test.com' },
      { id: '002', name: '李四', email: 'lisi@test.com' },
      { id: '004', name: '赵六', email: 'zhaoliu@test.com' },
    ];

    test('应该正确匹配和补充数据', async () => {
      const result = await processor.process(
        fileAData, fileBData, 'id', 'id', ['dept', 'salary']
      );

      expect(result.success).toBe(true);
      expect(result.resultData).toHaveLength(3);
      expect(result.stats.matchedRows).toBe(2);
      expect(result.stats.unmatchedRows).toBe(1);
    });

    test('匹配的行应该包含补充的数据（B列为空时从A补充）', async () => {
      const result = await processor.process(
        fileAData, fileBData, 'id', 'id', ['dept', 'salary']
      );

      const row001 = result.resultData.find(r => r.id === '001');
      expect(row001.dept).toBe('技术部');
      expect(row001.salary).toBe(15000);
      expect(row001._matched).toBe(true);
    });

    test('B已有值时不应被A覆盖（补充语义）', async () => {
      const fileBWithExisting = [
        { id: '001', name: '张三', dept: '原始部门', email: 'a@test.com' },
        { id: '002', name: '李四', dept: '', email: 'b@test.com' },
      ];

      const result = await processor.process(
        fileAData, fileBWithExisting, 'id', 'id', ['dept']
      );

      const row001 = result.resultData.find(r => r.id === '001');
      // B已有值 '原始部门'，不应被A的 '技术部' 覆盖
      expect(row001.dept).toBe('原始部门');

      const row002 = result.resultData.find(r => r.id === '002');
      // B为空，应从A补充
      expect(row002.dept).toBe('市场部');
    });

    test('未匹配的行应保留B原始值', async () => {
      const result = await processor.process(
        fileAData, fileBData, 'id', 'id', ['dept', 'salary']
      );

      const row004 = result.resultData.find(r => r.id === '004');
      // B中不存在 dept/salary 列 → undefined → null
      expect(row004.dept).toBeNull();
      expect(row004.salary).toBeNull();
      expect(row004._matched).toBe(false);
    });

    test('应该正确计算统计信息', async () => {
      const result = await processor.process(
        fileAData, fileBData, 'id', 'id', ['dept', 'salary']
      );

      expect(result.stats.totalRowsB).toBe(3);
      expect(result.stats.matchedRows).toBe(2);
      expect(result.stats.unmatchedRows).toBe(1);
      // 2行匹配 x 2列（B中无dept/salary） = 4个补充
      expect(result.stats.filledCells).toBe(4);
      // 1行未匹配 x 2列 = 2个空值
      expect(result.stats.nullCells).toBe(2);
      expect(parseFloat(result.stats.matchRate)).toBeCloseTo(66.67, 1);
    });

    test('应该处理主键值的空格', async () => {
      const fileAWithSpaces = [
        { id: ' 001 ', name: '张三', dept: '技术部' },
      ];
      const fileBWithSpaces = [
        { id: '001', name: '张三', email: 'test@test.com' },
      ];

      const result = await processor.process(
        fileAWithSpaces, fileBWithSpaces, 'id', 'id', ['dept']
      );

      expect(result.stats.matchedRows).toBe(1);
    });
  });

  describe('断点续处理', () => {
    test('应该能保存和加载检查点', () => {
      processor.processedCount = 100;
      processor.resultData = [{ id: '001', name: '测试' }];
      processor._saveCheckpoint();

      const newProcessor = new DataProcessor(sessionId);
      const loaded = newProcessor.loadCheckpoint();

      expect(loaded).toBe(true);
      expect(newProcessor.processedCount).toBe(100);
      expect(newProcessor.resultData).toHaveLength(1);
    });

    test('应该能清除检查点', () => {
      processor.processedCount = 100;
      processor._saveCheckpoint();
      processor.clearCheckpoint();

      const newProcessor = new DataProcessor(sessionId);
      const loaded = newProcessor.loadCheckpoint();

      expect(loaded).toBe(false);
    });
  });

  describe('回滚功能', () => {
    test('应该能回滚到初始状态', async () => {
      const fileAData = [{ id: '001', dept: '技术部' }];
      const fileBData = [{ id: '001', name: '张三' }];

      await processor.process(fileAData, fileBData, 'id', 'id', ['dept']);
      expect(processor.resultData.length).toBeGreaterThan(0);

      const result = processor.rollback();

      expect(result.success).toBe(true);
      expect(processor.resultData).toEqual([]);
      expect(processor.processedCount).toBe(0);
      expect(processor.status).toBe(PROCESS_STATUS.IDLE);
    });
  });

  describe('状态管理', () => {
    test('应该正确更新状态', () => {
      let capturedStatus = null;
      processor.setStatusChangeCallback((status) => {
        capturedStatus = status;
      });

      processor._updateStatus(PROCESS_STATUS.PROCESSING);

      expect(processor.status).toBe(PROCESS_STATUS.PROCESSING);
      expect(capturedStatus).toBe(PROCESS_STATUS.PROCESSING);
    });

    test('应该正确报告进度', async () => {
      const progressUpdates = [];
      processor.setProgressCallback((progress) => {
        progressUpdates.push(progress);
      });

      // 创建足够多的数据以触发进度更新
      const fileAData = Array.from({ length: 200 }, (_, i) => ({
        id: String(i).padStart(3, '0'),
        dept: '部门' + i
      }));
      const fileBData = Array.from({ length: 200 }, (_, i) => ({
        id: String(i).padStart(3, '0'),
        name: '员工' + i
      }));

      await processor.process(fileAData, fileBData, 'id', 'id', ['dept']);

      expect(progressUpdates.length).toBeGreaterThan(0);
      const lastProgress = progressUpdates[progressUpdates.length - 1];
      expect(lastProgress.percentage).toBe(100);
    });
  });

  describe('暂停和中止', () => {
    test('应该能暂停处理', () => {
      processor._updateStatus(PROCESS_STATUS.PROCESSING);
      processor.pause();

      expect(processor.status).toBe(PROCESS_STATUS.PAUSED);
    });

    test('应该能中止处理', () => {
      processor.abortController = new AbortController();
      processor.abort();

      expect(processor.abortController.signal.aborted).toBe(true);
      expect(processor.status).toBe(PROCESS_STATUS.IDLE);
    });
  });
});
