/**
 * CheckpointManager 单元测试
 */
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const CheckpointManager = require('../CheckpointManager');

describe('CheckpointManager', () => {
  let checkpointDir;
  let manager;
  const mockLogger = {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(async () => {
    checkpointDir = path.join(os.tmpdir(), `cp_test_${Date.now()}`);
    await fs.ensureDir(checkpointDir);
    manager = new CheckpointManager(checkpointDir, mockLogger);
  });

  afterEach(async () => {
    await fs.remove(checkpointDir);
  });

  test('saveCheckpoint 应写入 JSON 文件', async () => {
    await manager.saveCheckpoint('s1', { processedCount: 50, stats: { matchedRows: 10 } });
    const data = await fs.readJson(path.join(checkpointDir, 's1.json'));
    expect(data.processedCount).toBe(50);
    expect(data.savedAt).toBeDefined();
  });

  test('loadCheckpoint 应返回已保存的数据', async () => {
    await manager.saveCheckpoint('s2', { processedCount: 30 });
    const loaded = await manager.loadCheckpoint('s2');
    expect(loaded.processedCount).toBe(30);
  });

  test('loadCheckpoint 不存在时返回 null', async () => {
    const loaded = await manager.loadCheckpoint('nonexistent');
    expect(loaded).toBeNull();
  });

  test('hasCheckpoint 正确判断', async () => {
    expect(await manager.hasCheckpoint('s3')).toBe(false);
    await manager.saveCheckpoint('s3', { processedCount: 1 });
    expect(await manager.hasCheckpoint('s3')).toBe(true);
  });

  test('clearCheckpoint 应删除文件', async () => {
    await manager.saveCheckpoint('s4', { processedCount: 10 });
    await manager.clearCheckpoint('s4');
    expect(await manager.hasCheckpoint('s4')).toBe(false);
  });

  test('listAllCheckpoints 应列出所有检查点', async () => {
    await manager.saveCheckpoint('a1', { processedCount: 10 });
    await manager.saveCheckpoint('a2', { processedCount: 20 });
    const list = await manager.listAllCheckpoints();
    expect(list).toHaveLength(2);
    const ids = list.map(c => c.sessionId).sort();
    expect(ids).toEqual(['a1', 'a2']);
  });

  test('listAllCheckpoints 空目录返回空数组', async () => {
    const list = await manager.listAllCheckpoints();
    expect(list).toEqual([]);
  });
});
