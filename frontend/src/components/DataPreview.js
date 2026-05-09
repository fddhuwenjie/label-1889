import React, { useState, useMemo, useCallback } from 'react';
import { 
  Card, Button, Typography, Space, Tag, Row, Col, 
  Statistic, Select, Input, Dropdown, Tooltip, Alert 
} from 'antd';
import { ProTable } from '@ant-design/pro-components';
import { 
  DownloadOutlined, 
  ReloadOutlined,
  RollbackOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileExcelOutlined,
  SearchOutlined,
  CloseOutlined
} from '@ant-design/icons';
import { Resizable } from 'react-resizable';

const { Title, Text } = Typography;

// 可调整宽度的表头单元格
const ResizableTitle = (props) => {
  const { onResize, width, ...restProps } = props;

  if (!width) {
    return <th {...restProps} />;
  }

  return (
    <Resizable
      width={width}
      height={0}
      handle={
        <span
          className="react-resizable-handle"
          onClick={(e) => e.stopPropagation()}
        />
      }
      onResize={onResize}
      draggableOpts={{ enableUserSelectHack: false }}
    >
      <th {...restProps} />
    </Resizable>
  );
};

const DataPreview = ({ data, columns, stats, selectedColumns, onSave, onReset, onRollback }) => {
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  // 多列筛选: { columnName: searchText, ... }
  const [columnFilters, setColumnFilters] = useState({});
  // 多列排序: [{ field, order }, ...]
  const [sortInfoList, setSortInfoList] = useState([]);
  // 列宽状态
  const [columnWidths, setColumnWidths] = useState({});
  // 表格高度（可拖拽调整）
  const [tableHeight, setTableHeight] = useState(400);
  const isDragging = React.useRef(false);
  const startY = React.useRef(0);
  const startHeight = React.useRef(400);

  // 表格高度拖拽调整
  const handleDragStart = useCallback((e) => {
    isDragging.current = true;
    startY.current = e.clientY;
    startHeight.current = tableHeight;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const handleDragMove = (moveEvent) => {
      if (!isDragging.current) return;
      const delta = moveEvent.clientY - startY.current;
      setTableHeight(Math.max(200, Math.min(800, startHeight.current + delta)));
    };

    const handleDragEnd = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
    };

    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
  }, [tableHeight]);

  // 更新某列的筛选值
  const updateFilter = useCallback((col, value) => {
    setColumnFilters(prev => {
      const next = { ...prev };
      if (value) {
        next[col] = value;
      } else {
        delete next[col];
      }
      return next;
    });
    setCurrentPage(1);
  }, []);

  // 移除某列的筛选
  const removeFilter = useCallback((col) => {
    setColumnFilters(prev => {
      const next = { ...prev };
      delete next[col];
      return next;
    });
  }, []);

  // 多列筛选 + 多列排序
  const processedData = useMemo(() => {
    let result = [...data];

    // 应用所有列的筛选条件
    Object.entries(columnFilters).forEach(([col, text]) => {
      if (text) {
        result = result.filter(row =>
          String(row[col] ?? '').toLowerCase().includes(text.toLowerCase())
        );
      }
    });

    // 多列排序
    if (sortInfoList.length > 0) {
      result.sort((a, b) => {
        for (const { field, order } of sortInfoList) {
          const valA = a[field];
          const valB = b[field];
          const cmp = String(valA ?? '').localeCompare(String(valB ?? ''), undefined, { numeric: true });
          if (cmp !== 0) {
            return order === 'ascend' ? cmp : -cmp;
          }
        }
        return 0;
      });
    }

    return result;
  }, [data, columnFilters, sortInfoList]);

  // 列宽调整回调
  const handleResize = useCallback((col) => (_, { size }) => {
    setColumnWidths(prev => ({ ...prev, [col]: size.width }));
  }, []);

  // 生成表格列配置（带可调整宽度）
  const tableColumns = useMemo(() => {
    return columns.map(col => ({
      title: (
        <Space>
          {col}
          {selectedColumns.includes(col) && (
            <Tooltip title="已补充的列">
              <Tag color="blue" style={{ fontSize: '10px' }}>补充</Tag>
            </Tooltip>
          )}
        </Space>
      ),
      dataIndex: col,
      key: col,
      width: columnWidths[col] || 150,
      ellipsis: true,
      sorter: { multiple: columns.indexOf(col) },
      render: (_, record) => {
        const value = record[col];
        const isFilled = record._filledColumns?.includes(col);
        const isNull = value === null || value === undefined || value === '';
        
        let className = '';
        if (isFilled && !isNull) {
          className = 'filled-cell';
        } else if (isNull && selectedColumns.includes(col)) {
          className = 'null-cell';
        }

        // 防御性处理：如果值是对象（如 Date 或 cell 对象），提取可显示的文本
        let displayValue;
        if (isNull) {
          displayValue = <Text type="secondary" italic>NULL</Text>;
        } else if (value instanceof Date) {
          displayValue = value.toLocaleDateString();
        } else if (typeof value === 'object') {
          displayValue = value.v !== undefined ? String(value.v) : String(value);
        } else {
          displayValue = String(value);
        }

        return (
          <span className={className}>
            {displayValue}
          </span>
        );
      },
      onHeaderCell: (column) => ({
        width: column.width,
        onResize: handleResize(col),
      }),
    }));
  }, [columns, selectedColumns, columnWidths, handleResize]);

  // 添加行号和匹配状态列
  const allColumns = [
    {
      title: '#',
      dataIndex: '_rowIndex',
      key: '_rowIndex',
      width: 60,
      fixed: 'left',
      render: (value) => value + 1
    },
    {
      title: '匹配',
      dataIndex: '_matched',
      key: '_matched',
      width: 80,
      fixed: 'left',
      filters: [
        { text: '已匹配', value: true },
        { text: '未匹配', value: false }
      ],
      onFilter: (value, record) => record._matched === value,
      render: (matched) => matched 
        ? <Tag color="success" icon={<CheckCircleOutlined />}>是</Tag>
        : <Tag color="error" icon={<CloseCircleOutlined />}>否</Tag>
    },
    ...tableColumns
  ];

  const handleTableChange = (pagination, filters, sorter) => {
    setCurrentPage(pagination.current);
    setPageSize(pagination.pageSize);

    // 处理多列排序（AntD 多列 sorter 返回数组）
    if (Array.isArray(sorter)) {
      setSortInfoList(
        sorter
          .filter(s => s.order)
          .map(s => ({ field: s.field, order: s.order }))
      );
    } else if (sorter.field && sorter.order) {
      setSortInfoList([{ field: sorter.field, order: sorter.order }]);
    } else {
      setSortInfoList([]);
    }
  };

  const saveMenuItems = [
    {
      key: 'csv',
      label: '保存为 CSV',
      icon: <FileExcelOutlined />
    },
    {
      key: 'xlsx',
      label: '保存为 Excel (.xlsx)',
      icon: <FileExcelOutlined />
    }
  ];

  // 当前活跃的筛选列
  const activeFilterCols = Object.keys(columnFilters);

  return (
    <div className="step-container">
      <Title level={4} style={{ marginBottom: '24px' }}>
        步骤 4: 预览与保存
      </Title>

      {/* 统计信息 */}
      <Row gutter={16} style={{ marginBottom: '24px' }}>
        <Col span={6}>
          <Card className="stat-card info">
            <Statistic 
              title={<span style={{ color: '#fff' }}>总行数</span>}
              value={stats?.totalRowsB || 0}
              valueStyle={{ color: '#fff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="stat-card success">
            <Statistic 
              title={<span style={{ color: '#fff' }}>匹配成功</span>}
              value={stats?.matchedRows || 0}
              suffix={`(${stats?.matchRate || 0}%)`}
              valueStyle={{ color: '#fff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="stat-card warning">
            <Statistic 
              title={<span style={{ color: '#fff' }}>未匹配</span>}
              value={stats?.unmatchedRows || 0}
              valueStyle={{ color: '#fff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="stat-card">
            <Statistic 
              title={<span style={{ color: '#fff' }}>补充单元格</span>}
              value={stats?.filledCells || 0}
              valueStyle={{ color: '#fff' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 多列筛选区域 */}
      <Card style={{ marginBottom: '16px' }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space wrap>
            <Select
              style={{ width: 200 }}
              placeholder="添加筛选列"
              value={undefined}
              onChange={(col) => {
                if (col && !columnFilters[col]) {
                  updateFilter(col, '');
                }
              }}
            >
              {columns.map(col => (
                <Select.Option key={col} value={col} disabled={col in columnFilters}>
                  {col}
                </Select.Option>
              ))}
            </Select>
            <Text type="secondary">
              显示 {processedData.length} / {data.length} 条记录
              {sortInfoList.length > 0 && (
                <Tag color="blue" style={{ marginLeft: 8 }}>
                  排序: {sortInfoList.map(s => `${s.field} ${s.order === 'ascend' ? '↑' : '↓'}`).join(', ')}
                </Tag>
              )}
            </Text>
          </Space>

          {/* 已添加的筛选条件 */}
          {activeFilterCols.length > 0 && (
            <Space wrap>
              {activeFilterCols.map(col => (
                <Space key={col} size={4}>
                  <Tag color="processing">{col}</Tag>
                  <Input
                    style={{ width: 180 }}
                    size="small"
                    placeholder={`筛选 ${col}`}
                    prefix={<SearchOutlined />}
                    value={columnFilters[col] || ''}
                    onChange={e => updateFilter(col, e.target.value)}
                    allowClear
                  />
                  <Button
                    type="text"
                    size="small"
                    icon={<CloseOutlined />}
                    onClick={() => removeFilter(col)}
                  />
                </Space>
              ))}
            </Space>
          )}
        </Space>
      </Card>

      {/* 数据表格 */}
      <Card 
        title="数据预览"
        extra={
          <Space>
            <Text type="secondary">
              <Tag color="blue">蓝色背景</Tag> 已补充数据
              <Tag color="orange" style={{ marginLeft: '8px' }}>橙色</Tag> 空值
            </Text>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              提示: 拖拽列边缘可调整列宽，拖拽表格底部边缘可调整高度，点击列头可排序（按住Shift多列排序）
            </Text>
          </Space>
        }
      >
        <ProTable
          components={{
            header: {
              cell: ResizableTitle,
            },
          }}
          columns={allColumns}
          dataSource={processedData}
          rowKey="_rowIndex"
          search={false}
          toolBarRender={false}
          pagination={{
            current: currentPage,
            pageSize: pageSize,
            total: processedData.length,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} 条`
          }}
          onChange={handleTableChange}
          scroll={{ x: 'max-content', y: tableHeight }}
          size="small"
          rowClassName={(record) => record._matched ? 'matched-row' : 'unmatched-row'}
        />
        {/* 拖拽调整表格高度的手柄 */}
        <div
          onMouseDown={handleDragStart}
          style={{
            height: '6px',
            cursor: 'row-resize',
            background: 'linear-gradient(to bottom, #f0f0f0, #d9d9d9)',
            borderRadius: '0 0 3px 3px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="拖拽调整表格高度"
        >
          <span style={{ 
            width: '30px', height: '2px', 
            background: '#999', borderRadius: '1px',
            display: 'block'
          }} />
        </div>
      </Card>

      {/* 操作按钮 */}
      <Alert
        message="导出格式说明"
        description="保存为 Excel 格式时，系统仅更新补充列的单元格值(cell.v)，严格保留文件B原始的数据类型、数字格式、样式等所有属性。保存为 CSV 格式为纯文本导出，无法保留原始数据类型、格式设置和样式属性。如需严格保持文件B原始格式，请选择 Excel 导出。"
        type="warning"
        showIcon
        style={{ marginTop: '24px', marginBottom: '16px' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Space>
          <Button 
            size="large"
            icon={<ReloadOutlined />}
            onClick={onReset}
          >
            重新开始
          </Button>
          {onRollback && (
            <Button 
              size="large"
              danger
              icon={<RollbackOutlined />}
              onClick={onRollback}
            >
              回滚数据
            </Button>
          )}
        </Space>
        <Dropdown
          menu={{
            items: saveMenuItems,
            onClick: ({ key }) => onSave(key)
          }}
        >
          <Button type="primary" size="large" icon={<DownloadOutlined />}>
            保存结果文件
          </Button>
        </Dropdown>
      </div>
    </div>
  );
};

export default DataPreview;
