/**
 * 数据清洗器单元测试
 */
import DataCleaner, { CLEANING_OPERATIONS, FILL_NULLS_MODES } from './dataCleaner';

describe('DataCleaner', () => {
  let cleaner;

  beforeEach(() => {
    cleaner = new DataCleaner();
  });

  describe('去除前后空格', () => {
    test('应该去除字符串前后的空格', () => {
      const data = [
        { id: ' 001 ', name: ' 张三 ', dept: '技术部' },
        { id: '002', name: '李四', dept: ' 市场部 ' },
      ];

      const result = cleaner.trimSpaces(data);
      
      expect(result.data[0].id).toBe('001');
      expect(result.data[0].name).toBe('张三');
      expect(result.data[0].dept).toBe('技术部');
      expect(result.data[1].dept).toBe('市场部');
      expect(result.stats.trimmedCells).toBe(4);
    });

    test('应该只处理指定的列', () => {
      const data = [
        { id: ' 001 ', name: ' 张三 ', dept: '技术部' },
      ];

      const result = cleaner.trimSpaces(data, ['name']);
      
      expect(result.data[0].id).toBe(' 001 ');
      expect(result.data[0].name).toBe('张三');
      expect(result.stats.trimmedCells).toBe(1);
    });

    test('空数据应该返回空结果', () => {
      const result = cleaner.trimSpaces([]);
      expect(result.data).toEqual([]);
      expect(result.stats.trimmedCells).toBe(0);
    });
  });

  describe('统一日期格式', () => {
    test('应该识别并转换多种日期格式', () => {
      const data = [
        { date: '2024-01-15' },
        { date: '2024/01/15' },
        { date: '15-01-2024' },
        { date: '15/01/2024' },
        { date: '2024年1月15日' },
        { date: '20240115' },
      ];

      const result = cleaner.normalizeDates(data, ['date']);
      
      result.data.forEach(row => {
        expect(row.date).toBe('2024-01-15');
      });
      expect(result.stats.normalizedDates).toBe(5);
    });

    test('应该自动检测日期列', () => {
      const data = [
        { id: '001', date: '2024-01-15', name: '张三' },
        { id: '002', date: '2024/01/16', name: '李四' },
        { id: '003', date: '15-01-2024', name: '王五' },
      ];

      const result = cleaner.normalizeDates(data);
      
      expect(result.stats.dateColumns).toContain('date');
      expect(result.data[0].date).toBe('2024-01-15');
      expect(result.data[1].date).toBe('2024-01-16');
      expect(result.data[2].date).toBe('2024-01-15');
    });

    test('无效日期应该保持不变', () => {
      const data = [
        { date: '无效日期' },
        { date: '2024-13-01' },
        { date: '2024-02-30' },
      ];

      const result = cleaner.normalizeDates(data, ['date']);
      
      expect(result.data[0].date).toBe('无效日期');
      expect(result.data[1].date).toBe('2024-13-01');
      expect(result.data[2].date).toBe('2024-02-30');
      expect(result.stats.normalizedDates).toBe(0);
    });
  });

  describe('去除重复行', () => {
    test('应该基于指定列去除重复行', () => {
      const data = [
        { id: '001', name: '张三', dept: '技术部' },
        { id: '002', name: '李四', dept: '市场部' },
        { id: '001', name: '张三2', dept: '技术部' },
        { id: '003', name: '王五', dept: '技术部' },
      ];

      const result = cleaner.removeDuplicates(data, ['id']);
      
      expect(result.data).toHaveLength(3);
      expect(result.stats.removedRows).toBe(1);
      expect(result.data[0].id).toBe('001');
      expect(result.data[0].name).toBe('张三');
    });

    test('应该基于多列去除重复行', () => {
      const data = [
        { id: '001', name: '张三', dept: '技术部' },
        { id: '001', name: '张三', dept: '市场部' },
        { id: '001', name: '张三', dept: '技术部' },
        { id: '002', name: '李四', dept: '市场部' },
      ];

      const result = cleaner.removeDuplicates(data, ['id', 'name', 'dept']);
      
      expect(result.data).toHaveLength(3);
      expect(result.stats.removedRows).toBe(1);
    });

    test('没有重复行应该返回原始数据', () => {
      const data = [
        { id: '001', name: '张三' },
        { id: '002', name: '李四' },
      ];

      const result = cleaner.removeDuplicates(data, ['id']);
      
      expect(result.data).toHaveLength(2);
      expect(result.stats.removedRows).toBe(0);
    });

    test('没有指定关键列应该返回原始数据', () => {
      const data = [
        { id: '001', name: '张三' },
        { id: '001', name: '张三' },
      ];

      const result = cleaner.removeDuplicates(data, []);
      
      expect(result.data).toHaveLength(2);
      expect(result.stats.removedRows).toBe(0);
    });
  });

  describe('空值填充', () => {
    test('应该使用默认值填充空值', () => {
      const data = [
        { id: '001', name: '张三', dept: '' },
        { id: '002', name: '李四', dept: null },
        { id: '003', name: '王五', dept: undefined },
        { id: '004', name: '赵六', dept: '技术部' },
      ];

      const result = cleaner.fillNulls(data, ['dept'], FILL_NULLS_MODES.DEFAULT_VALUE, '未知部门');
      
      expect(result.data[0].dept).toBe('未知部门');
      expect(result.data[1].dept).toBe('未知部门');
      expect(result.data[2].dept).toBe('未知部门');
      expect(result.data[3].dept).toBe('技术部');
      expect(result.stats.filledCells).toBe(3);
    });

    test('应该使用上一行的值填充空值', () => {
      const data = [
        { id: '001', name: '张三', dept: '技术部' },
        { id: '002', name: '李四', dept: '' },
        { id: '003', name: '王五', dept: null },
        { id: '004', name: '赵六', dept: '市场部' },
        { id: '005', name: '钱七', dept: '' },
      ];

      const result = cleaner.fillNulls(data, ['dept'], FILL_NULLS_MODES.PREVIOUS_ROW);
      
      expect(result.data[0].dept).toBe('技术部');
      expect(result.data[1].dept).toBe('技术部');
      expect(result.data[2].dept).toBe('技术部');
      expect(result.data[3].dept).toBe('市场部');
      expect(result.data[4].dept).toBe('市场部');
      expect(result.stats.filledCells).toBe(3);
    });

    test('第一行空值使用上一行模式时应该保持空值', () => {
      const data = [
        { id: '001', name: '张三', dept: '' },
        { id: '002', name: '李四', dept: '技术部' },
      ];

      const result = cleaner.fillNulls(data, ['dept'], FILL_NULLS_MODES.PREVIOUS_ROW);
      
      expect(result.data[0].dept).toBe('');
      expect(result.data[1].dept).toBe('技术部');
      expect(result.stats.filledCells).toBe(0);
    });
  });

  describe('组合清洗操作', () => {
    test('应该按顺序执行多个清洗操作', () => {
      const data = [
        { id: ' 001 ', name: ' 张三 ', date: '2024/01/15', dept: '' },
        { id: '002', name: '李四', date: '15-01-2024', dept: '技术部' },
        { id: ' 001 ', name: '张三2', date: '2024年1月15日', dept: '' },
      ];

      const options = {
        [CLEANING_OPERATIONS.TRIM_SPACES]: true,
        [CLEANING_OPERATIONS.NORMALIZE_DATE]: true,
        [CLEANING_OPERATIONS.REMOVE_DUPLICATES]: true,
        [CLEANING_OPERATIONS.FILL_NULLS]: true,
        duplicateKeyColumns: ['id'],
        fillNullsMode: FILL_NULLS_MODES.DEFAULT_VALUE,
        fillNullsDefaultValue: '未知部门',
      };

      const result = cleaner.clean(data, options);
      
      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe('001');
      expect(result.data[0].name).toBe('张三');
      expect(result.data[0].date).toBe('2024-01-15');
      expect(result.data[0].dept).toBe('未知部门');
      expect(result.stats.originalRows).toBe(3);
      expect(result.stats.finalRows).toBe(2);
    });
  });

  describe('预览功能', () => {
    test('应该生成清洗前后的对比预览', () => {
      const originalData = [
        { id: ' 001 ', name: ' 张三 ', dept: '技术部' },
        { id: '002', name: '李四', dept: '' },
      ];

      const options = {
        [CLEANING_OPERATIONS.TRIM_SPACES]: true,
        [CLEANING_OPERATIONS.FILL_NULLS]: true,
        fillNullsMode: FILL_NULLS_MODES.DEFAULT_VALUE,
        fillNullsDefaultValue: '未知',
      };

      const cleanedResult = cleaner.clean(originalData, options);
      const preview = cleaner.generatePreview(originalData, cleanedResult.data, options);
      
      expect(preview.before).toHaveLength(2);
      expect(preview.after).toHaveLength(2);
      expect(preview.changes.length).toBeGreaterThan(0);
      expect(preview.totalChanges).toBeGreaterThan(0);
    });
  });

  describe('日志记录', () => {
    test('清洗操作应该记录日志', () => {
      const data = [
        { id: ' 001 ', name: ' 张三 ' },
      ];

      const options = {
        [CLEANING_OPERATIONS.TRIM_SPACES]: true,
      };

      const result = cleaner.clean(data, options);
      
      expect(result.logs).toBeDefined();
      expect(result.logs.length).toBeGreaterThan(0);
      expect(result.logs[0].level).toBe('info');
      expect(result.logs[0].message).toContain('去除前后空格');
    });
  });
});
