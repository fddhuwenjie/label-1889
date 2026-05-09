import React, { useState, useCallback, useMemo } from 'react';
import { 
  Card, Row, Col, Checkbox, Select, Input, Button, Typography, 
  Space, Tag, Alert, Divider, Table, Statistic, Tabs, message
} from 'antd';
import { 
  ArrowLeftOutlined, ArrowRightOutlined, EyeOutlined, 
  ScissorOutlined, CalendarOutlined, DeleteOutlined, 
  EditOutlined, ReloadOutlined
} from '@ant-design/icons';
import { CLEANING_OPERATIONS, FILL_NULLS_MODES } from '../utils/dataCleaner';
import DataCleaner from '../utils/dataCleaner';
import logger from '../utils/logger';

const { Title, Text } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;

const DataCleanerComponent = ({
  fileA,
  fileB,
  cleaningOptions,
  onCleaningOptionsChange,
  onBack,
  onNext,
  canProceed
}) => {
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('options');
  const [cleaningStats, setCleaningStats] = useState(null);

  const dataCleaner = useMemo(() => new DataCleaner(), []);

  const allColumns = useMemo(() => {
    const columns = new Set();
    if (fileA?.columns) {
      fileA.columns.forEach(col => columns.add(col));
    }
    if (fileB?.columns) {
      fileB.columns.forEach(col => columns.add(col));
    }
    return Array.from(columns);
  }, [fileA, fileB]);

  const handleOptionChange = useCallback((option, checked) => {
    onCleaningOptionsChange({
      ...cleaningOptions,
      [option]: checked
    });
  }, [cleaningOptions, onCleaningOptionsChange]);

  const handleTrimColumnsChange = useCallback((columns) => {
    onCleaningOptionsChange({
      ...cleaningOptions,
      trimColumns: columns
    });
  }, [cleaningOptions, onCleaningOptionsChange]);

  const handleDateColumnsChange = useCallback((columns) => {
    onCleaningOptionsChange({
      ...cleaningOptions,
      dateColumns: columns
    });
  }, [cleaningOptions, onCleaningOptionsChange]);

  const handleDuplicateKeyColumnsChange = useCallback((columns) => {
    onCleaningOptionsChange({
      ...cleaningOptions,
      duplicateKeyColumns: columns
    });
  }, [cleaningOptions, onCleaningOptionsChange]);

  const handleFillNullsModeChange = useCallback((mode) => {
    onCleaningOptionsChange({
      ...cleaningOptions,
      fillNullsMode: mode
    });
  }, [cleaningOptions, onCleaningOptionsChange]);

  const handleFillNullsColumnsChange = useCallback((columns) => {
    onCleaningOptionsChange({
      ...cleaningOptions,
      fillNullsColumns: columns
    });
  }, [cleaningOptions, onCleaningOptionsChange]);

  const handleFillNullsDefaultValueChange = useCallback((value) => {
    onCleaningOptionsChange({
      ...cleaningOptions,
      fillNullsDefaultValue: value
    });
  }, [cleaningOptions, onCleaningOptionsChange]);

  const generatePreview = useCallback(() => {
    if (!fileA || !fileB) {
      message.warning('请先选择文件');
      return;
    }

    const hasAnyOption = 
      cleaningOptions[CLEANING_OPERATIONS.TRIM_SPACES] ||
      cleaningOptions[CLEANING_OPERATIONS.NORMALIZE_DATE] ||
      cleaningOptions[CLEANING_OPERATIONS.REMOVE_DUPLICATES] ||
      cleaningOptions[CLEANING_OPERATIONS.FILL_NULLS];

    if (!hasAnyOption) {
      message.warning('请至少选择一个清洗操作');
      return;
    }

    setPreviewLoading(true);
    
    setTimeout(() => {
      try {
        const combinedData = [...fileA.data];
        
        const result = dataCleaner.clean(combinedData, cleaningOptions);
        const preview = dataCleaner.generatePreview(combinedData, result.data, cleaningOptions, 20);
        
        setPreviewData(preview);
        setCleaningStats(result.stats);
        setActiveTab('preview');
        
        logger.info('数据清洗预览生成完成', { 
          originalRows: combinedData.length,
          cleanedRows: result.data.length,
          stats: result.stats
        });
        
        message.success('预览生成完成');
      } catch (error) {
        logger.error('预览生成失败', error);
        message.error('预览生成失败: ' + error.message);
      } finally {
        setPreviewLoading(false);
      }
    }, 100);
  }, [fileA, fileB, cleaningOptions, dataCleaner]);

  const previewColumns = useMemo(() => {
    if (!previewData || previewData.before.length === 0) return [];
    
    return Object.keys(previewData.before[0]).map(col => ({
      title: col,
      dataIndex: col,
      key: col,
      ellipsis: true,
      width: 150,
      render: (value, record, index) => {
        const change = previewData.changes.find(c => c.rowIndex === index);
        const colChange = change?.changes.find(c => c.column === col);
        
        if (colChange) {
          return (
            <Space direction="vertical" size={0}>
              <Text delete type="secondary" style={{ fontSize: '12px' }}>
                {String(colChange.before === null || colChange.before === undefined ? '' : colChange.before)}
              </Text>
              <Text type="success" strong>
                {String(colChange.after === null || colChange.after === undefined ? '' : colChange.after)}
              </Text>
            </Space>
          );
        }
        
        return value;
      }
    }));
  }, [previewData]);

  const statsCards = useMemo(() => {
    if (!cleaningStats) return null;
    
    const cards = [];
    
    if (cleaningStats.trimmedCells !== undefined) {
      cards.push(
        <Col span={6} key="trim">
          <Card size="small" className="stat-card info">
            <Statistic 
              title={<span style={{ color: '#fff', fontSize: '12px' }}>去除空格</span>}
              value={cleaningStats.trimmedCells}
              valueStyle={{ color: '#fff' }}
              suffix="单元格"
            />
          </Card>
        </Col>
      );
    }
    
    if (cleaningStats.normalizedDates !== undefined) {
      cards.push(
        <Col span={6} key="date">
          <Card size="small" className="stat-card success">
            <Statistic 
              title={<span style={{ color: '#fff', fontSize: '12px' }}>日期转换</span>}
              value={cleaningStats.normalizedDates}
              valueStyle={{ color: '#fff' }}
              suffix="个"
            />
          </Card>
        </Col>
      );
    }
    
    if (cleaningStats.removedRows !== undefined) {
      cards.push(
        <Col span={6} key="duplicate">
          <Card size="small" className="stat-card warning">
            <Statistic 
              title={<span style={{ color: '#fff', fontSize: '12px' }}>移除重复</span>}
              value={cleaningStats.removedRows}
              valueStyle={{ color: '#fff' }}
              suffix="行"
            />
          </Card>
        </Col>
      );
    }
    
    if (cleaningStats.filledCells !== undefined) {
      cards.push(
        <Col span={6} key="fill">
          <Card size="small" className="stat-card">
            <Statistic 
              title={<span style={{ color: '#fff', fontSize: '12px' }}>填充空值</span>}
              value={cleaningStats.filledCells}
              valueStyle={{ color: '#fff' }}
              suffix="个"
            />
          </Card>
        </Col>
      );
    }
    
    return cards;
  }, [cleaningStats]);

  return (
    <div className="step-container">
      <Title level={4} style={{ marginBottom: '24px' }}>
        步骤 2: 数据清洗
      </Title>

      <Alert
        message="数据清洗说明"
        description={
          <Space direction="vertical">
            <Text>选择需要的清洗操作，可组合使用。点击"预览清洗效果"查看清洗前后的数据对比。</Text>
            <Text type="secondary">清洗操作将应用于源文件A的数据，清洗后的数据将用于后续的匹配和补充。</Text>
          </Space>
        }
        type="info"
        showIcon
        style={{ marginBottom: '24px' }}
      />

      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane 
          tab={
            <span>
              <EditOutlined /> 清洗选项
            </span>
          } 
          key="options"
        >
          <Row gutter={24}>
            <Col span={12}>
              <Card 
                title={
                  <Space>
                    <ScissorOutlined />
                    <span>去除前后空格</span>
                    <Tag color="blue">可选</Tag>
                  </Space>
                }
                style={{ marginBottom: '16px' }}
              >
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Checkbox 
                    checked={cleaningOptions[CLEANING_OPERATIONS.TRIM_SPACES]}
                    onChange={(e) => handleOptionChange(CLEANING_OPERATIONS.TRIM_SPACES, e.target.checked)}
                  >
                    <Text strong>启用去除前后空格</Text>
                  </Checkbox>
                  
                  {cleaningOptions[CLEANING_OPERATIONS.TRIM_SPACES] && (
                    <div style={{ marginTop: '12px' }}>
                      <Text type="secondary" style={{ display: 'block', marginBottom: '8px' }}>
                        选择要去除空格的列（不选则应用于所有列）：
                      </Text>
                      <Select
                        mode="multiple"
                        style={{ width: '100%' }}
                        placeholder="选择列（可选）"
                        value={cleaningOptions.trimColumns || []}
                        onChange={handleTrimColumnsChange}
                        allowClear
                      >
                        {allColumns.map(col => (
                          <Option key={col} value={col}>{col}</Option>
                        ))}
                      </Select>
                    </div>
                  )}
                </Space>
              </Card>

              <Card 
                title={
                  <Space>
                    <CalendarOutlined />
                    <span>统一日期格式</span>
                    <Tag color="green">可选</Tag>
                  </Space>
                }
                style={{ marginBottom: '16px' }}
              >
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Checkbox 
                    checked={cleaningOptions[CLEANING_OPERATIONS.NORMALIZE_DATE]}
                    onChange={(e) => handleOptionChange(CLEANING_OPERATIONS.NORMALIZE_DATE, e.target.checked)}
                  >
                    <Text strong>启用日期格式统一</Text>
                  </Checkbox>
                  
                  <Text type="secondary" style={{ fontSize: '12px', marginTop: '8px' }}>
                    支持的日期格式：YYYY-MM-DD、YYYY/MM/DD、DD-MM-YYYY、DD/MM/YYYY、YYYY年MM月DD日、YYYYMMDD
                  </Text>
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    统一输出格式：YYYY-MM-DD
                  </Text>
                  
                  {cleaningOptions[CLEANING_OPERATIONS.NORMALIZE_DATE] && (
                    <div style={{ marginTop: '12px' }}>
                      <Text type="secondary" style={{ display: 'block', marginBottom: '8px' }}>
                        选择日期列（不选则自动检测日期列）：
                      </Text>
                      <Select
                        mode="multiple"
                        style={{ width: '100%' }}
                        placeholder="选择日期列（可选）"
                        value={cleaningOptions.dateColumns || []}
                        onChange={handleDateColumnsChange}
                        allowClear
                      >
                        {allColumns.map(col => (
                          <Option key={col} value={col}>{col}</Option>
                        ))}
                      </Select>
                    </div>
                  )}
                </Space>
              </Card>
            </Col>

            <Col span={12}>
              <Card 
                title={
                  <Space>
                    <DeleteOutlined />
                    <span>去除重复行</span>
                    <Tag color="orange">可选</Tag>
                  </Space>
                }
                style={{ marginBottom: '16px' }}
              >
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Checkbox 
                    checked={cleaningOptions[CLEANING_OPERATIONS.REMOVE_DUPLICATES]}
                    onChange={(e) => handleOptionChange(CLEANING_OPERATIONS.REMOVE_DUPLICATES, e.target.checked)}
                  >
                    <Text strong>启用去除重复行</Text>
                  </Checkbox>
                  
                  {cleaningOptions[CLEANING_OPERATIONS.REMOVE_DUPLICATES] && (
                    <div style={{ marginTop: '12px' }}>
                      <Text type="secondary" style={{ display: 'block', marginBottom: '8px' }}>
                        选择用于判断重复的关键列（必填）：
                      </Text>
                      <Select
                        mode="multiple"
                        style={{ width: '100%' }}
                        placeholder="选择关键列"
                        value={cleaningOptions.duplicateKeyColumns || []}
                        onChange={handleDuplicateKeyColumnsChange}
                        allowClear
                      >
                        {allColumns.map(col => (
                          <Option key={col} value={col}>{col}</Option>
                        ))}
                      </Select>
                      <Text type="secondary" style={{ fontSize: '12px', marginTop: '8px' }}>
                        提示：保留第一次出现的行，后续重复行将被移除
                      </Text>
                    </div>
                  )}
                </Space>
              </Card>

              <Card 
                title={
                  <Space>
                    <EditOutlined />
                    <span>空值填充</span>
                    <Tag color="purple">可选</Tag>
                  </Space>
                }
                style={{ marginBottom: '16px' }}
              >
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Checkbox 
                    checked={cleaningOptions[CLEANING_OPERATIONS.FILL_NULLS]}
                    onChange={(e) => handleOptionChange(CLEANING_OPERATIONS.FILL_NULLS, e.target.checked)}
                  >
                    <Text strong>启用空值填充</Text>
                  </Checkbox>
                  
                  {cleaningOptions[CLEANING_OPERATIONS.FILL_NULLS] && (
                    <div style={{ marginTop: '12px' }}>
                      <Text type="secondary" style={{ display: 'block', marginBottom: '8px' }}>
                        选择填充方式：
                      </Text>
                      <Select
                        style={{ width: '100%', marginBottom: '12px' }}
                        placeholder="选择填充方式"
                        value={cleaningOptions.fillNullsMode}
                        onChange={handleFillNullsModeChange}
                      >
                        <Option value={FILL_NULLS_MODES.DEFAULT_VALUE}>使用指定默认值</Option>
                        <Option value={FILL_NULLS_MODES.PREVIOUS_ROW}>使用上一行的值</Option>
                      </Select>
                      
                      {cleaningOptions.fillNullsMode === FILL_NULLS_MODES.DEFAULT_VALUE && (
                        <div style={{ marginBottom: '12px' }}>
                          <Text type="secondary" style={{ display: 'block', marginBottom: '8px' }}>
                            默认值：
                          </Text>
                          <Input
                            placeholder="输入默认值"
                            value={cleaningOptions.fillNullsDefaultValue || ''}
                            onChange={(e) => handleFillNullsDefaultValueChange(e.target.value)}
                          />
                        </div>
                      )}
                      
                      <Text type="secondary" style={{ display: 'block', marginBottom: '8px' }}>
                        选择要填充的列（不选则应用于所有列）：
                      </Text>
                      <Select
                        mode="multiple"
                        style={{ width: '100%' }}
                        placeholder="选择列（可选）"
                        value={cleaningOptions.fillNullsColumns || []}
                        onChange={handleFillNullsColumnsChange}
                        allowClear
                      >
                        {allColumns.map(col => (
                          <Option key={col} value={col}>{col}</Option>
                        ))}
                      </Select>
                    </div>
                  )}
                </Space>
              </Card>
            </Col>
          </Row>

          <div style={{ marginTop: '24px', textAlign: 'center' }}>
            <Button 
              type="primary" 
              size="large"
              icon={<EyeOutlined />}
              onClick={generatePreview}
              loading={previewLoading}
              style={{ marginRight: '16px' }}
            >
              预览清洗效果
            </Button>
          </div>
        </TabPane>

        <TabPane 
          tab={
            <span>
              <EyeOutlined /> 清洗预览
              {previewData && previewData.totalChanges > 0 && (
                <Tag color="red" style={{ marginLeft: '8px' }}>
                  {previewData.totalChanges} 处变更
                </Tag>
              )}
            </span>
          } 
          key="preview"
        >
          {cleaningStats && (
            <Row gutter={16} style={{ marginBottom: '24px' }}>
              {statsCards}
            </Row>
          )}

          {previewData ? (
            <div>
              <Alert
                message={
                  <Space>
                    <span>预览前 {previewData.before.length} 行数据</span>
                    {previewData.totalChanges > 0 && (
                      <Tag color="blue">
                        检测到 {previewData.totalChanges} 行有变更
                      </Tag>
                    )}
                  </Space>
                }
                description={
                  <Text type="secondary">
                    删除线表示原始值，绿色加粗表示清洗后的值
                  </Text>
                }
                type="info"
                showIcon
                style={{ marginBottom: '16px' }}
              />

              <Card title="数据对比预览">
                <Table
                  columns={[
                    {
                      title: '#',
                      dataIndex: '_index',
                      key: '_index',
                      width: 60,
                      render: (_, __, index) => index + 1
                    },
                    ...previewColumns
                  ]}
                  dataSource={previewData.before.map((row, index) => ({
                    ...row,
                    _index: index,
                    key: index
                  }))}
                  rowKey="key"
                  pagination={{
                    pageSize: 10,
                    showSizeChanger: true,
                    showQuickJumper: true,
                    showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} 条`
                  }}
                  scroll={{ x: 'max-content' }}
                  size="small"
                />
              </Card>

              {previewData.changes.length > 0 && (
                <Card 
                  title="变更详情" 
                  style={{ marginTop: '16px' }}
                  size="small"
                >
                  <Table
                    columns={[
                      {
                        title: '行号',
                        dataIndex: 'rowIndex',
                        key: 'rowIndex',
                        width: 80,
                        render: (index) => index + 1
                      },
                      {
                        title: '列名',
                        dataIndex: 'column',
                        key: 'column',
                        width: 150
                      },
                      {
                        title: '原始值',
                        dataIndex: 'before',
                        key: 'before',
                        render: (value) => (
                          <Text delete type="secondary">
                            {String(value === null || value === undefined ? '' : value)}
                          </Text>
                        )
                      },
                      {
                        title: '清洗后',
                        dataIndex: 'after',
                        key: 'after',
                        render: (value) => (
                          <Text type="success" strong>
                            {String(value === null || value === undefined ? '' : value)}
                          </Text>
                        )
                      }
                    ]}
                    dataSource={previewData.changes.flatMap(change => 
                      change.changes.map(colChange => ({
                        ...colChange,
                        rowIndex: change.rowIndex,
                        key: `${change.rowIndex}-${colChange.column}`
                      }))
                    )}
                    rowKey="key"
                    pagination={{
                      pageSize: 10,
                      showSizeChanger: true,
                      showTotal: (total) => `共 ${total} 处变更`
                    }}
                    size="small"
                  />
                </Card>
              )}
            </div>
          ) : (
            <Alert
              message="暂无预览数据"
              description="请先选择清洗操作，然后点击\"预览清洗效果\"按钮"
              type="info"
              showIcon
            />
          )}
        </TabPane>
      </Tabs>

      <Divider />

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button 
          size="large"
          icon={<ArrowLeftOutlined />}
          onClick={onBack}
        >
          上一步
        </Button>
        <Button 
          type="primary" 
          size="large"
          icon={<ArrowRightOutlined />}
          onClick={onNext}
          disabled={!canProceed}
        >
          下一步：选择数据列
        </Button>
      </div>
    </div>
  );
};

export default DataCleanerComponent;
