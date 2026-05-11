import React, { useMemo, useState, useCallback, useRef } from 'react';
import { Card, Row, Col, Select, Checkbox, Button, Typography, Space, Tag, Alert, Divider, InputNumber, Switch, Tabs } from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined, SwapOutlined, HolderOutlined, PlusOutlined, DeleteOutlined, SettingOutlined, UpOutlined, DownOutlined } from '@ant-design/icons';
import { createDefaultMatchRule, FUZZY_STRATEGIES } from '../constants';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

const ColumnSelector = ({
  fileA,
  fileB,
  keyColumnA,
  keyColumnB,
  selectedColumns,
  matchRules,
  useMatchRuleChain,
  onKeyColumnAChange,
  onKeyColumnBChange,
  onSelectedColumnsChange,
  onMatchRulesChange,
  onUseMatchRuleChainChange,
  onBack,
  onNext,
  canProceed
}) => {
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

  const uniqueColumnsB = useMemo(() => {
    if (!fileA || !fileB) return [];
    return fileB.columns.filter(col => !fileA.columns.includes(col));
  }, [fileA, fileB]);

  const uniqueColumnsA = useMemo(() => {
    if (!fileA || !fileB) return [];
    return fileA.columns.filter(col => !fileB.columns.includes(col));
  }, [fileA, fileB]);

  const commonColumns = useMemo(() => {
    if (!fileA || !fileB) return [];
    return fileA.columns.filter(col => fileB.columns.includes(col));
  }, [fileA, fileB]);

  const handleAddRule = () => {
    const newId = matchRules.length > 0 
      ? Math.max(...matchRules.map(r => r.id)) + 1 
      : 1;
    const newRule = createDefaultMatchRule(newId);
    if (fileA?.columns?.length > 0) {
      newRule.keyColumnA = fileA.columns[0];
    }
    if (fileB?.columns?.length > 0) {
      newRule.keyColumnB = fileB.columns[0];
    }
    onMatchRulesChange([...matchRules, newRule]);
  };

  const handleRemoveRule = (ruleId) => {
    onMatchRulesChange(matchRules.filter(r => r.id !== ruleId));
  };

  const handleRuleChange = (ruleId, field, value) => {
    onMatchRulesChange(matchRules.map(rule => 
      rule.id === ruleId ? { ...rule, [field]: value } : rule
    ));
  };

  const handleStrategyChange = (ruleId, strategy, checked) => {
    onMatchRulesChange(matchRules.map(rule => 
      rule.id === ruleId 
        ? { ...rule, strategies: { ...rule.strategies, [strategy]: checked } }
        : rule
    ));
  };

  const handleMoveRule = (index, direction) => {
    const newRules = [...matchRules];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= newRules.length) return;
    [newRules[index], newRules[newIndex]] = [newRules[newIndex], newRules[index]];
    onMatchRulesChange(newRules);
  };

  return (
    <div className="step-container">
      <Title level={4} style={{ marginBottom: '24px' }}>
      步骤 3: 选择数据列与匹配规则
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
        <Card 
          title={
            <Space>
              <SettingOutlined />
              <span>匹配规则配置</span>
            </Space>
          } 
          style={{ marginBottom: '16px' }}
          extra={
            <Space>
              <Text type="secondary">规则链模式</Text>
              <Switch
                checked={useMatchRuleChain}
                onChange={onUseMatchRuleChainChange}
              />
            </Space>
          }
        >
          {!useMatchRuleChain ? (
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
              <Divider />
              <div>
                <Text strong>模糊匹配策略：</Text>
                <div style={{ marginTop: '8px' }}>
                  <Alert
                    message="简单模式下不启用模糊匹配，如需使用请开启规则链模式"
                    type="info"
                    showIcon
                    size="small"
                  />
                </div>
              </div>
            </Space>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Alert
                message="匹配规则链说明"
                description="系统按规则顺序依次执行，前一条规则未匹配成功的行才进入下一条规则，最终汇总所有规则的匹配结果。"
                type="info"
                showIcon
                style={{ marginBottom: '12px' }}
              />
              
              {matchRules.map((rule, index) => (
                <Card
                  key={rule.id}
                  size="small"
                  title={
                    <Space>
                      <Tag color="blue">{rule.name}</Tag>
                      <Switch
                        size="small"
                        checked={rule.enabled}
                        onChange={(checked) => handleRuleChange(rule.id, 'enabled', checked)}
                      />
                    </Space>
                  }
                  extra={
                    <Space>
                      <Button
                        type="text"
                        size="small"
                        icon={<UpOutlined />}
                        onClick={() => handleMoveRule(index, -1)}
                        disabled={index === 0}
                      />
                      <Button
                        type="text"
                        size="small"
                        icon={<DownOutlined />}
                        onClick={() => handleMoveRule(index, 1)}
                        disabled={index === matchRules.length - 1}
                      />
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleRemoveRule(rule.id)}
                        disabled={matchRules.length <= 1}
                      />
                    </Space>
                  }
                  style={{ marginBottom: '12px' }}
                >
                  <Space direction="vertical" style={{ width: '100%' }} size="small">
                    <Row gutter={8}>
                      <Col span={12}>
                        <Text type="secondary" style={{ fontSize: '12px' }}>文件A主键列</Text>
                        <Select
                          style={{ width: '100%', marginTop: '4px' }}
                      value={rule.keyColumnA}
                      size="small"
                      onChange={(value) => handleRuleChange(rule.id, 'keyColumnA', value)}
                    >
                      {fileA?.columns.map(col => (
                        <Select.Option key={col} value={col}>{col}</Select.Option>
                      ))}
                    </Select>
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: '12px' }}>文件B主键列</Text>
                    <Select
                      style={{ width: '100%', marginTop: '4px' }}
                      value={rule.keyColumnB}
                      size="small"
                      onChange={(value) => handleRuleChange(rule.id, 'keyColumnB', value)}
                    >
                      {fileB?.columns.map(col => (
                        <Select.Option key={col} value={col}>{col}</Select.Option>
                      ))}
                    </Select>
                  </Col>
                </Row>
                <div>
                  <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>
                    匹配策略（可多选，按优先级执行）：
                  </Text>
                  <Space wrap>
                    <Checkbox
                      checked={rule.strategies[FUZZY_STRATEGIES.IGNORE_CASE]}
                      onChange={(e) => handleStrategyChange(rule.id, FUZZY_STRATEGIES.IGNORE_CASE, e.target.checked)}
                    >
                      忽略大小写
                    </Checkbox>
                    <Checkbox
                      checked={rule.strategies[FUZZY_STRATEGIES.IGNORE_SPACE_PUNCT]}
                      onChange={(e) => handleStrategyChange(rule.id, FUZZY_STRATEGIES.IGNORE_SPACE_PUNCT, e.target.checked)}
                    >
                      忽略空格标点
                    </Checkbox>
                    <Checkbox
                      checked={rule.strategies[FUZZY_STRATEGIES.LEVENSHTEIN]}
                      onChange={(e) => handleStrategyChange(rule.id, FUZZY_STRATEGIES.LEVENSHTEIN, e.target.checked)}
                    >
                      编辑距离
                    </Checkbox>
                    {rule.strategies[FUZZY_STRATEGIES.LEVENSHTEIN] && (
                      <Space size="small">
                        <Text type="secondary" style={{ fontSize: '12px' }}>阈值:</Text>
                        <InputNumber
                          min={1}
                          max={3}
                          size="small"
                          value={rule.levenshteinThreshold}
                          onChange={(value) => handleRuleChange(rule.id, 'levenshteinThreshold', value)}
                          style={{ width: 60 }}
                        />
                      </Space>
                    )}
                  </Space>
                </div>
              </Space>
            </Card>
          ))}
          
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={handleAddRule}
            style={{ width: '100%' }}
          >
            添加匹配规则
          </Button>
        </Space>
      )}
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
