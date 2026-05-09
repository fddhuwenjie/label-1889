import React, { useMemo, useState, useCallback, useRef } from 'react';
import { Card, Row, Col, Select, Checkbox, Button, Typography, Space, Tag, Alert, Divider } from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined, SwapOutlined, HolderOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const ColumnSelector = ({
  fileA,
  fileB,
  keyColumnA,
  keyColumnB,
  selectedColumns,
  onKeyColumnAChange,
  onKeyColumnBChange,
  onSelectedColumnsChange,
  onBack,
  onNext,
  canProceed
}) => {
  // 检测可能匹配的列名
  const suggestedMatches = useMemo(() => {
    if (!fileA || !fileB) return [];
    
    const matches = [];
    fileA.columns.forEach(colA => {
      fileB.columns.forEach(colB => {
        const similarity = calculateSimilarity(colA.toLowerCase(), colB.toLowerCase());
        if (similarity > 0.6 && colA !== colB) {
          matches.push({ colA, colB, similarity: Math.round(similarity * 100) });
        }
      });
    });
    return matches.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
  }, [fileA, fileB]);

  // 简单的字符串相似度计算
  function calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  function levenshteinDistance(str1, str2) {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[str2.length][str1.length];
  }

  const handleColumnToggle = (column) => {
    if (selectedColumns.includes(column)) {
      onSelectedColumnsChange(selectedColumns.filter(c => c !== column));
    } else {
      onSelectedColumnsChange([...selectedColumns, column]);
    }
  };

  // 所有可选列 = 仅文件A的列（B独有列不可选，避免破坏B原始数据）
  const allSelectableColumns = useMemo(() => {
    if (!fileA || !fileB) return [];
    return [...fileA.columns];
  }, [fileA, fileB]);

  const handleSelectAll = () => {
    if (selectedColumns.length === allSelectableColumns.length) {
      onSelectedColumnsChange([]);
    } else {
      onSelectedColumnsChange([...allSelectableColumns]);
    }
  };

  // ============ 拖拽选列支持 ============
  const [dragOverTarget, setDragOverTarget] = useState(null);
  const dragSourceCol = useRef(null);

  const handleDragStart = useCallback((e, col) => {
    dragSourceCol.current = col;
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', col);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragEnterSelected = useCallback((e) => {
    e.preventDefault();
    setDragOverTarget('selected');
  }, []);

  const handleDragLeaveSelected = useCallback((e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragOverTarget(null);
  }, []);

  const handleDropOnSelected = useCallback((e) => {
    e.preventDefault();
    setDragOverTarget(null);
    const col = e.dataTransfer.getData('text/plain') || dragSourceCol.current;
    if (col && !selectedColumns.includes(col) && fileA.columns.includes(col)) {
      onSelectedColumnsChange([...selectedColumns, col]);
    }
    dragSourceCol.current = null;
  }, [selectedColumns, onSelectedColumnsChange, fileA]);

  // 获取文件B中独有的列（不在文件A中）
  const uniqueColumnsB = useMemo(() => {
    if (!fileA || !fileB) return [];
    return fileB.columns.filter(col => !fileA.columns.includes(col));
  }, [fileA, fileB]);

  // 获取文件A中独有的列（不在文件B中）
  const uniqueColumnsA = useMemo(() => {
    if (!fileA || !fileB) return [];
    return fileA.columns.filter(col => !fileB.columns.includes(col));
  }, [fileA, fileB]);

  // 获取两个文件共有的列
  const commonColumns = useMemo(() => {
    if (!fileA || !fileB) return [];
    return fileA.columns.filter(col => fileB.columns.includes(col));
  }, [fileA, fileB]);

  return (
    <div className="step-container">
      <Title level={4} style={{ marginBottom: '24px' }}>
        步骤 2: 选择数据列
      </Title>

      {suggestedMatches.length > 0 && (
        <Alert
          message="检测到相似列名"
          description={
            <Space direction="vertical">
              <Text>以下列名可能需要确认是否匹配，点击"应用"可将建议的列设为主键列：</Text>
              {suggestedMatches.map((match, index) => (
                <Space key={index} align="center">
                  <Text>
                    文件A: <Tag color="blue">{match.colA}</Tag> 
                    <SwapOutlined style={{ margin: '0 8px' }} />
                    文件B: <Tag color="purple">{match.colB}</Tag>
                    <Tag color="orange">{match.similarity}% 相似</Tag>
                  </Text>
                  <Button
                    type="link"
                    size="small"
                    onClick={() => {
                      onKeyColumnAChange(match.colA);
                      onKeyColumnBChange(match.colB);
                    }}
                  >
                    应用为主键
                  </Button>
                </Space>
              ))}
            </Space>
          }
          type="warning"
          showIcon
          style={{ marginBottom: '24px' }}
        />
      )}

      <Row gutter={24}>
        <Col span={12}>
          <Card title="主键列选择" style={{ marginBottom: '16px' }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Text strong>文件A主键列：</Text>
                <Select
                  style={{ width: '100%', marginTop: '8px' }}
                  value={keyColumnA}
                  onChange={onKeyColumnAChange}
                  placeholder="选择用于匹配的主键列"
                >
                  {fileA?.columns.map(col => (
                    <Select.Option key={col} value={col}>{col}</Select.Option>
                  ))}
                </Select>
              </div>
              <Divider />
              <div>
                <Text strong>文件B主键列：</Text>
                <Select
                  style={{ width: '100%', marginTop: '8px' }}
                  value={keyColumnB}
                  onChange={onKeyColumnBChange}
                  placeholder="选择用于匹配的主键列"
                >
                  {fileB?.columns.map(col => (
                    <Select.Option key={col} value={col}>{col}</Select.Option>
                  ))}
                </Select>
              </div>
            </Space>
          </Card>

          <Alert
            message="主键说明"
            description="主键列用于匹配两个文件中的对应行。请选择两个文件中具有相同含义的列（如ID、编号等）。"
            type="info"
            showIcon
          />

          <Card title="文件列总览" style={{ marginTop: '16px' }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: '8px' }}>
              文件A 共 {fileA?.columns.length || 0} 列：
            </Text>
            <div style={{ marginBottom: '12px' }}>
              {fileA?.columns.map(col => (
                <Tag key={col} color={fileB?.columns.includes(col) ? 'green' : 'blue'} style={{ marginBottom: '4px' }}>
                  {col}
                </Tag>
              ))}
            </div>
            <Divider style={{ margin: '8px 0' }} />
            <Text type="secondary" style={{ display: 'block', marginBottom: '8px' }}>
              文件B 共 {fileB?.columns.length || 0} 列：
            </Text>
            <div>
              {fileB?.columns.map(col => (
                <Tag key={col} color={fileA?.columns.includes(col) ? 'green' : 'orange'} style={{ marginBottom: '4px' }}>
                  {col}
                </Tag>
              ))}
            </div>
            <Divider style={{ margin: '8px 0' }} />
            <Space wrap size={[0, 4]}>
              <Tag color="green">共有列</Tag>
              <Tag color="blue">A 独有</Tag>
              <Tag color="orange">B 独有</Tag>
            </Space>
          </Card>
        </Col>

        <Col span={12}>
          <Card 
            title={
              <Space>
                <span>文件A和文件B的所有列</span>
                <Tag color="blue">已选 {selectedColumns.length} 列</Tag>
              </Space>
            }
            extra={
              <Button type="link" onClick={handleSelectAll}>
                {selectedColumns.length === allSelectableColumns.length ? '取消全选' : '全选'}
              </Button>
            }
          >
            <Alert
              message="勾选或拖拽列名到此区域，指定要从文件A提取并补充到文件B的列。匹配成功时，A的数据将写入B对应单元格。"
              type="info"
              style={{ marginBottom: '12px' }}
            />
            <div
              className="column-selector"
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnterSelected}
              onDragLeave={handleDragLeaveSelected}
              onDrop={handleDropOnSelected}
              style={{
                border: dragOverTarget === 'selected' ? '2px dashed #1890ff' : '2px dashed transparent',
                borderRadius: '6px',
                transition: 'border-color 0.2s',
                minHeight: '100px',
              }}
            >
              {commonColumns.length > 0 && (
                <>
                  <Text type="secondary" style={{ display: 'block', marginBottom: '8px' }}>
                    共有列（A和B都有，匹配成功时用A的值补充到B）：
                  </Text>
                  {commonColumns.map(col => (
                    <div 
                      key={col}
                      draggable
                      onDragStart={(e) => handleDragStart(e, col)}
                      className={`column-item ${selectedColumns.includes(col) ? 'selected' : ''}`}
                      onClick={() => handleColumnToggle(col)}
                      style={{ cursor: 'grab' }}
                    >
                      <Checkbox checked={selectedColumns.includes(col)}>
                        <Space>
                          <HolderOutlined style={{ color: '#999', cursor: 'grab' }} />
                          <span>{col}</span>
                          <Tag color="green" style={{ fontSize: '10px' }}>共有</Tag>
                        </Space>
                      </Checkbox>
                    </div>
                  ))}
                  <Divider style={{ margin: '12px 0' }} />
                </>
              )}

              {uniqueColumnsA.length > 0 && (
                <>
                  <Text type="secondary" style={{ display: 'block', marginBottom: '8px' }}>
                    文件A独有列（将新增到文件B）：
                  </Text>
                  {uniqueColumnsA.map(col => (
                    <div 
                      key={col}
                      draggable
                      onDragStart={(e) => handleDragStart(e, col)}
                      className={`column-item ${selectedColumns.includes(col) ? 'selected' : ''}`}
                      onClick={() => handleColumnToggle(col)}
                      style={{ cursor: 'grab' }}
                    >
                      <Checkbox checked={selectedColumns.includes(col)}>
                        <Space>
                          <HolderOutlined style={{ color: '#999', cursor: 'grab' }} />
                          <span>{col}</span>
                          <Tag color="blue" style={{ fontSize: '10px' }}>新增</Tag>
                        </Space>
                      </Checkbox>
                    </div>
                  ))}
                </>
              )}

              {fileA?.columns.length === 0 && (
                <Text type="secondary">文件A没有可选择的列</Text>
              )}

              {uniqueColumnsB.length > 0 && (
                <>
                  <Divider style={{ margin: '12px 0' }} />
                  <Text type="secondary" style={{ display: 'block', marginBottom: '8px', color: '#999' }}>
                    文件B独有列（A中无此列，不可选择，保持原样不修改）：
                  </Text>
                  {uniqueColumnsB.map(col => (
                    <div 
                      key={col} 
                      className="column-item"
                      style={{ cursor: 'default', opacity: 0.5 }}
                    >
                      <Checkbox checked={false} disabled>
                        <Space>
                          <span>{col}</span>
                          <Tag color="default" style={{ fontSize: '10px' }}>B独有·不可选</Tag>
                        </Space>
                      </Checkbox>
                    </div>
                  ))}
                </>
              )}
            </div>
          </Card>
        </Col>
      </Row>

      <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between' }}>
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
          下一步：处理数据
        </Button>
      </div>
    </div>
  );
};

export default ColumnSelector;
