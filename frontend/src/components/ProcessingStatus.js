import React from 'react';
import { Card, Button, Typography, Space, Tag, Descriptions, Spin, Alert, Progress } from 'antd';
import { ProCard } from '@ant-design/pro-components';
import { 
  ArrowLeftOutlined, 
  PlayCircleOutlined, 
  PauseCircleOutlined,
  RollbackOutlined,
  FileExcelOutlined,
  KeyOutlined,
  TableOutlined,
  WarningOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { PROCESS_STATUS } from '../constants';

const { Title, Text } = Typography;

const ProcessingStatus = ({
  processing,
  processStatus,
  progress,
  anomalies = [],
  hasCheckpoint,
  onProcess,
  onResume,
  onPause,
  onRollback,
  onBack,
  fileA,
  fileB,
  selectedColumns,
  keyColumnA,
  keyColumnB
}) => {
  const isProcessing = processStatus === PROCESS_STATUS.PROCESSING;
  const isPaused = processStatus === PROCESS_STATUS.PAUSED;
  const isError = processStatus === PROCESS_STATUS.ERROR;

  const getStatusTag = () => {
    switch (processStatus) {
      case PROCESS_STATUS.PROCESSING:
        return <Tag color="processing">处理中</Tag>;
      case PROCESS_STATUS.PAUSED:
        return <Tag color="warning">已暂停</Tag>;
      case PROCESS_STATUS.COMPLETED:
        return <Tag color="success">已完成</Tag>;
      case PROCESS_STATUS.ERROR:
        return <Tag color="error">出错</Tag>;
      case PROCESS_STATUS.ROLLING_BACK:
        return <Tag color="orange">回滚中</Tag>;
      default:
        return <Tag color="default">就绪</Tag>;
    }
  };

  return (
    <div className="step-container">
      <Title level={4} style={{ marginBottom: '24px' }}>
        步骤 3: 处理数据 {getStatusTag()}
      </Title>

      {/* 异常警告 */}
      {anomalies.length > 0 && (
        <Alert
          message="数据异常检测"
          description={
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              {anomalies.map((anomaly, index) => (
                <li key={index}>
                  <WarningOutlined style={{ color: '#faad14', marginRight: '8px' }} />
                  {anomaly.message}
                </li>
              ))}
            </ul>
          }
          type="warning"
          showIcon
          style={{ marginBottom: '24px' }}
        />
      )}

      <ProCard title="处理配置确认" style={{ marginBottom: '24px' }}>
        <Descriptions column={2} bordered>
          <Descriptions.Item label={<><FileExcelOutlined /> 源文件 (A)</>}>
            <Space direction="vertical">
              <Text strong>{fileA?.fileName}</Text>
              <Text type="secondary">{fileA?.data.length} 行 · {fileA?.columns.length} 列</Text>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label={<><FileExcelOutlined /> 目标文件 (B)</>}>
            <Space direction="vertical">
              <Text strong>{fileB?.fileName}</Text>
              <Text type="secondary">{fileB?.data.length} 行 · {fileB?.columns.length} 列</Text>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label={<><KeyOutlined /> 主键列</>}>
            <Space>
              <Tag color="blue">A: {keyColumnA}</Tag>
              <Tag color="purple">B: {keyColumnB}</Tag>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label={<><TableOutlined /> 要补充的列</>}>
            <Space wrap>
              {selectedColumns.map(col => (
                <Tag key={col} color="green">{col}</Tag>
              ))}
            </Space>
          </Descriptions.Item>
        </Descriptions>
      </ProCard>

      <Alert
        message="处理说明"
        description={
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            <li>系统将根据主键列匹配文件A和文件B中的对应行</li>
            <li>匹配成功的行将从文件A中提取选定列的数据补充到文件B</li>
            <li>未匹配的行将保留文件B原有数据，无法从A补充的单元格保持空值(NULL)</li>
            <li>文件B的原始数据顺序和结构将保持不变</li>
            <li>处理前会自动创建原始文件的备份</li>
            <li><Text strong>支持断点续处理</Text>：处理中断后可从上次位置继续</li>
            <li><Text strong>支持事务回滚</Text>：可随时回滚到原始状态</li>
          </ul>
        }
        type="info"
        showIcon
        style={{ marginBottom: '24px' }}
      />

      {/* 处理进度 */}
      {(isProcessing || isPaused || progress.current > 0) && (
        <Card style={{ textAlign: 'center', marginBottom: '24px' }}>
          {isProcessing && <Spin size="large" />}
          <Title level={4} style={{ marginTop: '16px' }}>
            {isProcessing ? '正在处理数据...' : isPaused ? '处理已暂停' : '准备处理'}
          </Title>
          
          <Progress 
            percent={progress.percentage} 
            status={isProcessing ? 'active' : isPaused ? 'exception' : 'normal'}
            style={{ maxWidth: '400px', margin: '16px auto' }}
          />
          
          <Text type="secondary">
            已处理 {progress.current} / {progress.total} 行
          </Text>

          {isPaused && (
            <div style={{ marginTop: '16px' }}>
              <Space>
                <Button 
                  type="primary" 
                  icon={<ReloadOutlined />}
                  onClick={onResume}
                >
                  继续处理
                </Button>
                <Button 
                  danger
                  icon={<RollbackOutlined />}
                  onClick={onRollback}
                >
                  回滚
                </Button>
              </Space>
            </div>
          )}
        </Card>
      )}

      {/* 断点续处理提示 */}
      {hasCheckpoint && !isProcessing && !isPaused && (
        <Alert
          message="发现未完成的处理"
          description={
            <Space>
              <span>上次处理在 {progress.current} 行时中断</span>
              <Button type="primary" size="small" onClick={onResume}>
                继续处理
              </Button>
              <Button size="small" onClick={onProcess}>
                重新开始
              </Button>
            </Space>
          }
          type="warning"
          showIcon
          style={{ marginBottom: '24px' }}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button 
          size="large"
          icon={<ArrowLeftOutlined />}
          onClick={onBack}
          disabled={isProcessing}
        >
          上一步
        </Button>
        
        <Space>
          {isProcessing && (
            <Button 
              size="large"
              icon={<PauseCircleOutlined />}
              onClick={onPause}
            >
              暂停
            </Button>
          )}
          
          {!isProcessing && !isPaused && (
            <Button 
              type="primary" 
              size="large"
              icon={<PlayCircleOutlined />}
              onClick={hasCheckpoint ? onResume : onProcess}
              loading={processing}
            >
              {hasCheckpoint ? '继续处理' : '开始处理'}
            </Button>
          )}
        </Space>
      </div>
    </div>
  );
};

export default ProcessingStatus;
