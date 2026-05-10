import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { 
  Card, Row, Col, Select, Checkbox, Button, Typography, Space, Tag, 
  Alert, Divider, InputNumber, Tabs, List, Popconfirm, Tooltip, Switch
} from 'antd';
import { 
  ArrowLeftOutlined, ArrowRightOutlined, SwapOutlined, HolderOutlined,
  PlusOutlined, DeleteOutlined, UpOutlined, DownOutlined, SettingOutlined
} from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';
import {
  MATCH_STRATEGY,
  LEVENSHTEIN_CONFIG,
  createDefaultMatchRule,
} from '../constants';

const { Title, Text } = Typography;
const { TabPane } = Tabs;
const { Option } = Select;

const ColumnSelector = ({
  fileA,
  fileB,
  keyColumnA,
  keyColumnB,
  selectedColumns,
  matchRules,
  onKeyColumnAChange,
  onKeyColumnBChange,
  onSelectedColumnsChange,
  onMatchRulesChange,
  onBack,
  onNext,
  canProceed
}) => {
  const [activeTab, setActiveTab] = useState('simple');

  useEffect(() => {
    if (matchRules.length === 0 && fileA && fileB && keyColumnA && keyColumnB) {
      const defaultRule = createDefaultMatchRule(
        uuidv4(),
        keyColumnA,
        keyColumnB
      );
      onMatchRulesChange([defaultRule]);
    }
  }, [fileA, fileB, keyColumnA, keyColumnB, matchRules.length, onMatchRulesChange]);

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

  const handleAddRule = useCallback(() => {
    const newRule = createDefaultMatchRule(uuidv4());
    onMatchRulesChange([...matchRules, newRule]);
  }, [matchRules, onMatchRulesChange]);

  const handleDeleteRule = useCallback((ruleId) => {
    if (matchRules.length <= 1) return;
    onMatchRulesChange(matchRules.filter(r => r.id !== ruleId));
  }, [matchRules, onMatchRulesChange]);

  const handleMoveRuleUp = useCallback((index) => {
    if (index <= 0) return;
    const newRules = [...matchRules];
    [newRules[index - 1], newRules[index]] = [newRules[index], newRules[index - 1]];
    onMatchRulesChange(newRules);
  }, [matchRules, onMatchRulesChange]);

  const handleMoveRuleDown = useCallback((index) => {
    if (index >= matchRules.length - 1) return;
    const newRules = [...matchRules];
    [newRules[index], newRules[index + 1]] = [newRules[index + 1], newRules[index]];
    onMatchRulesChange(newRules);
  }, [matchRules, onMatchRulesChange]);

  const handleRuleChange = useCallback((ruleId, updates) => {
    onMatchRulesChange(
      matchRules.map(r => r.id === ruleId ? { ...r, ...updates } : r)
    );
  }, [matchRules, onMatchRulesChange]);

  const handleStrategyChange = useCallback((ruleId, strategy, enabled) => {
    const rule = matchRules.find(r => r.id === ruleId);
    if (!rule) return;
    handleRuleChange(ruleId, {
      strategies: {
        ...rule.strategies,
        [strategy]: enabled,
      }
    });
  }, [matchRules, handleRuleChange]);

  const renderMatchRule = (rule, index) => (
    <Card
      key={rule.id}
      size="small"
      style={{ marginBottom: '12px' }}
      title={
        <Space>
          <HolderOutlined style={{ cursor: 'grab', color: '#999' }} />
          <Text strong>规则 {index + 1}</Text>
          <Switch
            checked={rule.enabled}
            onChange={(checked) => handleRuleChange(rule.id, { enabled: checked })}
            size="small"
          />
          {!rule.enabled && <Tag color="default">已禁用</Tag>}
        </Space>
      }
      extra={
        <Space>
          <Tooltip title="上移">
            <Button
              icon={<UpOutlined />}
              size="small"
              disabled={index === 0}
              onClick={() => handleMoveRuleUp(index)}
            />
          </Tooltip>
          <Tooltip title="下移">
            <Button
              icon={<DownOutlined />}
              size="small"
              disabled={index === matchRules.length - 1}
              onClick={() => handleMoveRuleDown(index)}
            />
          </Tooltip>
          <Popconfirm
            title="确定删除此规则？"
            disabled={matchRules.length <= 1}
            onConfirm={() => handleDeleteRule(rule.id)}
          >
            <Button
              icon={<DeleteOutlined />}
              size="small"
              danger
              disabled={matchRules.length <= 1}
            />
          </Popconfirm>
        </Space>
      }
    >
      <Row gutter={16}>
        <Col span={12}>
          <div style={{ marginBottom: '12px' }}>
            <Text strong style={{ display: 'block', marginBottom: '4px' }}>
              文件A主键列：
            </Text>
            <Select
              style={{ width: '100%' }}
              value={rule.keyColumnA}
              onChange={(val) => handleRuleChange(rule.id, { keyColumnA: val })}
              placeholder="选择文件A主键列"
            >
              {fileA?.columns.map(col => (
                <Option key={col} value={col}>{col}</Option>
              ))}
            </Select>
          </div>
        </Col>
        <Col span={12}>
          <div style={{ marginBottom: '12px' }}>
            <Text strong style={{ display: 'block', marginBottom: '4px' }}>
              文件B主键列：
            </Text>
            <Select
              style={{ width: '100%' }}
              value={rule.keyColumnB}
              onChange={(val) => handleRuleChange(rule.id, { keyColumnB: val })}
              placeholder="选择文件B主键列"
            >
              {fileB?.columns.map(col => (
                <Option key={col} value={col}>{col}</Option>
              ))}
            </Select>
          </div>
        </Col>
      </Row>

      <Divider style={{ margin: '12px 0' }} />

      <Text strong style={{ display: 'block', marginBottom: '8px' }}>
        匹配策略（按优先级链式执行）：
      </Text>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Space>
          <Checkbox
            checked={rule.strategies[MATCH_STRATEGY.IGNORE_CASE]}
            onChange={(e) => handleStrategyChange(
              rule.id,
              MATCH_STRATEGY.IGNORE_CASE,
              e.target.checked
            )}
          >
            <Text>忽略大小写</Text>
          </Checkbox>
          <Tag color="blue">优先级 1</Tag>
        </Space>
        <Space>
          <Checkbox
            checked={rule.strategies[MATCH_STRATEGY.IGNORE_SPACE_PUNCT]}
            onChange={(e) => handleStrategyChange(
              rule.id,
              MATCH_STRATEGY.IGNORE_SPACE_PUNCT,
              e.target.checked
            )}
          >
            <Text>忽略空格与标点符号</Text>
          </Checkbox>
          <Tag color="green">优先级 2</Tag>
        </Space>
        <Space>
          <Checkbox
            checked={rule.strategies[MATCH_STRATEGY.LEVENSHTEIN]}
            onChange={(e) => handleStrategyChange(
              rule.id,
              MATCH_STRATEGY.LEVENSHTEIN,
              e.target.checked
            )}
          >
            <Text>Levenshtein 编辑距离</Text>
          </Checkbox>
          <Tag color="orange">优先级 3</Tag>
          {rule.strategies[MATCH_STRATEGY.LEVENSHTEIN] && (
            <Space>
              <Text type="secondary">阈值：</Text>
              <InputNumber
                min={LEVENSHTEIN_CONFIG.MIN_THRESHOLD}
                max={LEVENSHTEIN_CONFIG.MAX_THRESHOLD}
                value={rule.levenshteinThreshold}
                onChange={(val) => handleRuleChange(rule.id, { levenshteinThreshold: val })}
              />
            </Space>
          )}
        </Space>
      </Space>
    </Card>
  );

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

      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane tab={<span><SettingOutlined /> 简单模式</span>} key="simple">
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
                message="简单模式说明"
                description="使用单个主键列进行精确匹配。如需模糊匹配或多规则匹配，请切换到高级模式。"
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
        </TabPane>

        <TabPane tab={<span><SettingOutlined /> 高级模式（匹配规则链）</span>} key="advanced">
          <Alert
            message="匹配规则链说明"
            description={
              <Space direction="vertical">
                <Text>• 系统按规则顺序依次执行匹配，前一条规则未匹配成功的行才会进入下一条规则</Text>
                <Text>• 每条规则可独立配置主键列对和匹配策略</Text>
                <Text>• 匹配策略按"忽略大小写 → 忽略空格标点 → 编辑距离"的优先级链式执行</Text>
                <Text>• 最终汇总所有规则的匹配结果</Text>
              </Space>
            }
            type="info"
            showIcon
            style={{ marginBottom: '16px' }}
          />

          <Row gutter={24}>
            <Col span={12}>
              <Card
                title={
                  <Space>
                    <span>匹配规则链</span>
                    <Tag color="blue">{matchRules.length} 条规则</Tag>
                  </Space>
                }
                extra={
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    size="small"
                    onClick={handleAddRule}
                  >
                    添加规则
                  </Button>
                }
                style={{ marginBottom: '16px' }}
              >
                {matchRules.length === 0 ? (
                  <Text type="secondary">暂无规则，点击上方按钮添加</Text>
                ) : (
                  <div>
                    {matchRules.map((rule, index) => renderMatchRule(rule, index))}
                  </div>
                )}
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
        </TabPane>
      </Tabs>

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
