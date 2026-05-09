/**
 * ElectronDataProcessor 单元测试
 * 测试核心匹配逻辑、断点续处理、暂停/中止
 */
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const CheckpointManager = require('../CheckpointManager');
const BackupManager = require('../BackupManager');
const ElectronDataProcessor = require('../ElectronDataProcessor');

describe('ElectronDataProcessor', () => {
  let tmpDir, checkpointDir, backupDir;
  let processor, checkpointManager, backupManager;

  const mockLogger = {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const config = {
    SUPPORTED_FORMATS: ['.csv', '.xlsx', '.xls'],
    MAX_FILE_SIZE: 100 * 1024 * 1024,
    PROCESS_TIMEOUT: 60 * 1000,
    BACKUP_RETENTION_DAYS: 7,
    BATCH_SIZE: 1000,
    CHECKPOINT_INTERVAL: 5, // 小间隔方便测试
  };

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `edp_test_${Date.now()}`);
    checkpointDir = path.join(tmpDir, 'checkpoints');
    backupDir = path.join(tmpDir, 'backups');
    await fs.ensureDir(checkpointDir);
    await fs.ensureDir(backupDir);

    checkpointManager = new CheckpointManager(checkpointDir, mockLogger);
    backupManager = new BackupManager(backupDir, config, mockLogger);
    processor = new ElectronDataProcessor(config, backupManager, checkpointManager, mockLogger);
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  describe('matchData', () => {
    const fileAData = [
      { id: '001', name: '张三', dept: '技术部', salary: 15000 },
      { id: '002', name: '李四', dept: '市场部', salary: 12000 },
      { id: '003', name: '王五', dept: '技术部', salary: 18000 },
    ];

    const fileBData = [
      { id: '001', name: '张三', email: 'a@test.com' },
      { id: '002', name: '李四', email: 'b@test.com' },
      { id: '004', name: '赵六', email: 'c@test.com' },
    ];

    test('応正確匹配並補充数据', async () => {
      processor.currentSession = 'test-match';
      const fileAColumns = ['id', 'name', 'dept', 'salary'];
      const result = await processor.matchData(
        fileAData, fileBData, 'id', 'id', ['dept', 'salary'], fileAColumns, null, null
      );

      expect(result.resultData).toHaveLength(3);
      expect(result.stats.matchedRows).toBe(2);
      expect(result.stats.unmatchedRows).toBe(1);
      // B中无dept/salary列 → 2行匹配 x 2列 = 4个补充
      expect(result.stats.filledCells).toBe(4);
      expect(result.stats.nullCells).toBe(2);
    });

    test('匹配行应包含正确的补充值', async () => {
      processor.currentSession = 'test-values';
      const fileAColumns = ['id', 'name', 'dept', 'salary'];
      const result = await processor.matchData(
        fileAData, fileBData, 'id', 'id', ['dept', 'salary'], fileAColumns, null, null
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

      processor.currentSession = 'test-preserve';
      const fileAColumns = ['id', 'name', 'dept', 'salary'];
      const result = await processor.matchData(
        fileAData, fileBWithExisting, 'id', 'id', ['dept'], fileAColumns, null, null
      );

      const row001 = result.resultData.find(r => r.id === '001');
      // B已有值 '原始部门'，不应被A的 '技术部' 覆盖
      expect(row001.dept).toBe('原始部门');

      const row002 = result.resultData.find(r => r.id === '002');
      // B为空，应从A补充
      expect(row002.dept).toBe('市场部');
    });

    test('未匹配行应保留B原始值', async () => {
      processor.currentSession = 'test-null';
      const fileAColumns = ['id', 'name', 'dept', 'salary'];
      const result = await processor.matchData(
        fileAData, fileBData, 'id', 'id', ['dept'], fileAColumns, null, null
      );

      const row004 = result.resultData.find(r => r.id === '004');
      expect(row004.dept).toBeNull();
      expect(row004._matched).toBe(false);
    });

    test('主键值应 trim 后匹配', async () => {
      const fileAWithSpaces = [
        { id: ' 001 ', dept: '技术部' },
      ];
      const fileBTrimmed = [
        { id: '001', name: '张三' },
      ];

      processor.currentSession = 'test-trim';
      const result = await processor.matchData(
        fileAWithSpaces, fileBTrimmed, 'id', 'id', ['dept'], ['id', 'dept'], null, null
      );

      expect(result.stats.matchedRows).toBe(1);
    });

    test('从检查点恢复应跳过已处理行', async () => {
      processor.currentSession = 'test-resume';
      const checkpoint = {
        processedCount: 2,
        resultData: [
          { id: '001', name: '张三', email: 'a@test.com', dept: '技术部', _rowIndex: 0, _matched: true, _filledColumns: ['dept'] },
          { id: '002', name: '李四', email: 'b@test.com', dept: '市场部', _rowIndex: 1, _matched: true, _filledColumns: ['dept'] },
        ],
        stats: { matchedRows: 2, unmatchedRows: 0, filledCells: 2, nullCells: 0 },
      };

      const fileAColumns = ['id', 'name', 'dept', 'salary'];
      const result = await processor.matchData(
        fileAData, fileBData, 'id', 'id', ['dept'], fileAColumns, checkpoint, null
      );

      // 应该只新处理了第3行
      expect(result.resultData).toHaveLength(3);
      expect(result.stats.unmatchedRows).toBe(1);
    });
  });

  describe('暂停与中止', () => {
    test('pause 应设置 paused 标志', () => {
      processor.currentSession = 'test-pause';
      processor.pause();
      expect(processor.paused).toBe(true);
    });

    test('abort 应设置 aborted 标志', () => {
      processor.currentSession = 'test-abort';
      processor.abort();
      expect(processor.aborted).toBe(true);
    });

    test('暂停后 matchData 应保存检查点并返回 isPaused', async () => {
      processor.currentSession = 'test-pause-match';
      // 在处理开始前就设置暂停
      processor.paused = true;

      const fileAData = [{ id: '001', dept: '技术部' }];
      const fileBData = [
        { id: '001', name: '张三' },
        { id: '002', name: '李四' },
      ];

      const result = await processor.matchData(
        fileAData, fileBData, 'id', 'id', ['dept'], ['id', 'dept'], null, null
      );

      expect(result.isPaused).toBe(true);
      // 检查点应已保存
      const cp = await checkpointManager.loadCheckpoint('test-pause-match');
      expect(cp).not.toBeNull();
    });
  });

  describe('检查点定期保存', () => {
    test('处理超过 CHECKPOINT_INTERVAL 行时应自动保存检查点', async () => {
      processor.currentSession = 'test-cp-interval';
      const fileAData = Array.from({ length: 10 }, (_, i) => ({
        id: String(i), dept: `部门${i}`,
      }));
      const fileBData = Array.from({ length: 10 }, (_, i) => ({
        id: String(i), name: `员工${i}`,
      }));

      await processor.matchData(
        fileAData, fileBData, 'id', 'id', ['dept'], ['id', 'dept'], null, null
      );

      // CHECKPOINT_INTERVAL=5，处理10行应至少保存过一次检查点
      // 处理完成后检查点会被 process() 清除，但 matchData 本身不清除
      // 这里直接验证 matchData 内部的保存行为通过 mock logger
      expect(mockLogger.debug).toHaveBeenCalledWith(
        '检查点已保存',
        expect.objectContaining({ sessionId: 'test-cp-interval' })
      );
    });
  });
});
