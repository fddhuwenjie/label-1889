import React, { useState, useCallback, useEffect } from 'react';
import { 
  Layout, Steps, Button, message, Modal, Alert, Space, Typography 
} from 'antd';
import { 
  QuestionCircleOutlined, 
  ExclamationCircleOutlined,
  RollbackOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { ProCard, PageContainer } from '@ant-design/pro-components';
import FileUpload from './components/FileUpload';
import DataCleanerComponent from './components/DataCleaner';
import ColumnSelector from './components/ColumnSelector';
import DataPreview from './components/DataPreview';
import ProcessingStatus from './components/ProcessingStatus';
import HelpGuide from './components/HelpGuide';
import logger from './utils/logger';
import configManager from './utils/configManager';
import { PROCESS_STATUS, createDefaultMatchRule } from './constants';
import { CLEANING_OPERATIONS, FILL_NULLS_MODES } from './utils/dataCleaner';
import DataCleaner from './utils/dataCleaner';
import { v4 as uuidv4 } from 'uuid';

const { Header, Content } = Layout;
const { Text } = Typography;

function App() {
  const [currentStep, setCurrentStep] = useState(0);
  const [fileA, setFileA] = useState(null);
  const [fileB, setFileB] = useState(null);
  const [cleaningOptions, setCleaningOptions] = useState({
    [CLEANING_OPERATIONS.TRIM_SPACES]: false,
    [CLEANING_OPERATIONS.NORMALIZE_DATE]: false,
    [CLEANING_OPERATIONS.REMOVE_DUPLICATES]: false,
    [CLEANING_OPERATIONS.FILL_NULLS]: false,
    trimColumns: [],
    dateColumns: [],
    duplicateKeyColumns: [],
    fillNullsMode: null,
    fillNullsColumns: [],
    fillNullsDefaultValue: '',
  });
  const [cleanedFileA, setCleanedFileA] = useState(null);
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [keyColumnA, setKeyColumnA] = useState('');
  const [keyColumnB, setKeyColumnB] = useState('');
  const [resultData, setResultData] = useState(null);
  const [resultColumns, setResultColumns] = useState([]);
  const [stats, setStats] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [processStatus, setProcessStatus] = useState(PROCESS_STATUS.IDLE);
  const [progress, setProgress] = useState({ current: 0, total: 0, percentage: 0 });
  const [sessionId, setSessionId] = useState(null);
  const [helpVisible, setHelpVisible] = useState(false);
  const [appInfo, setAppInfo] = useState(null);
  const [hasCheckpoint, setHasCheckpoint] = useState(false);
  const [anomalies, setAnomalies] = useState([]);
  const [matchRules, setMatchRules] = useState([]);

  // 根据文件路径生成确定性 sessionId（跨重启可复现）
  const deriveSessionId = useCallback((fileAPath, fileBPath) => {
    // 简单哈希：取两个路径拼接后的稳定标识
    const raw = `${fileAPath}||${fileBPath}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
    }
    return `session_${Math.abs(hash).toString(36)}`;
  }, []);

  // 初始化
  useEffect(() => {
    window.electronAPI.getAppInfo().then(setAppInfo);
    
    // 扫描所有已有检查点，提示用户恢复
    window.electronAPI.listCheckpoints().then(checkpoints => {
      if (checkpoints && checkpoints.length > 0) {
        // 取最近的检查点
        const latest = checkpoints.sort((a, b) => 
          (b.checkpoint.savedAt || 0) - (a.checkpoint.savedAt || 0)
        )[0];
        
        setSessionId(latest.sessionId);
        setHasCheckpoint(true);
        Modal.confirm({
          title: '发现未完成的处理',
          icon: <ExclamationCircleOutlined />,
          content: `上次处理在 ${latest.checkpoint.processedCount} 行时中断，是否继续？`,
          okText: '继续处理',
          cancelText: '重新开始',
          onOk: () => {
            setProgress({
              current: latest.checkpoint.processedCount,
              total: latest.checkpoint.stats?.totalRowsB || 0,
              percentage: 0,
            });
          },
          onCancel: () => {
            setHasCheckpoint(false);
            // 生成新 sessionId 供后续使用
            setSessionId(uuidv4());
          },
        });
      } else {
        // 无检查点，生成新 sessionId
        setSessionId(uuidv4());
      }
    });

    // 监听处理进度
    const unsubscribe = window.electronAPI.onProcessProgress(setProgress);
    return () => unsubscribe();
  }, []);

  // 加载保存的列配置
  useEffect(() => {
    if (fileA && fileB) {
      const savedConfig = configManager.getColumnConfig();
      if (savedConfig.keyColumnA && fileA.columns.includes(savedConfig.keyColumnA)) {
        setKeyColumnA(savedConfig.keyColumnA);
      }
      if (savedConfig.keyColumnB && fileB.columns.includes(savedConfig.keyColumnB)) {
        setKeyColumnB(savedConfig.keyColumnB);
      }
    }
  }, [fileA, fileB]);

  const handleFileASelect = useCallback((file) => {
    setFileA(file);
    if (file && file.columns.length > 0) {
      setKeyColumnA(file.columns[0]);
    }
    logger.info('文件A已选择', { fileName: file?.fileName });
  }, []);

  const handleFileBSelect = useCallback((file) => {
    setFileB(file);
    if (file && file.columns.length > 0) {
      setKeyColumnB(file.columns[0]);
    }
    logger.info('文件B已选择', { fileName: file?.fileName });
  }, []);

  // 检测异常值（使用预览数据在渲染端做基本检测）
  const detectAnomalies = useCallback(() => {
    if (!fileA || !fileB || !keyColumnA || !keyColumnB || selectedColumns.length === 0) {
      return [];
    }
    
    const detected = [];
    // 基于预览数据的简单匹配率检测
    const fileAMap = new Map();
    fileA.data.forEach(row => {
      const key = String(row[keyColumnA] || '').trim();
      if (key) fileAMap.set(key, true);
    });
    let matched = 0;
    fileB.data.forEach(row => {
      const key = String(row[keyColumnB] || '').trim();
      if (fileAMap.has(key)) matched++;
    });
    const matchRate = fileB.data.length > 0 ? matched / fileB.data.length : 0;
    if (matchRate < 0.5) {
      detected.push({
        type: 'LOW_MATCH_RATE',
        severity: 'warning',
        message: `预览数据匹配率较低 (${(matchRate * 100).toFixed(1)}%)，请确认主键列选择是否正确`,
        matchRate: (matchRate * 100).toFixed(2),
      });
    }

    // 检测重复主键
    const keyCountA = new Map();
    fileA.data.forEach(row => {
      const key = String(row[keyColumnA] || '').trim();
      keyCountA.set(key, (keyCountA.get(key) || 0) + 1);
    });
    const duplicateCount = [...keyCountA.values()].filter(c => c > 1).length;
    if (duplicateCount > 0) {
      detected.push({
        type: 'DUPLICATE_KEYS',
        severity: 'warning',
        message: `文件A中发现 ${duplicateCount} 个重复主键值，匹配时将使用最后出现的行`,
        duplicateCount,
      });
    }

    setAnomalies(detected);
    return detected;
  }, [fileA, fileB, keyColumnA, keyColumnB, selectedColumns]);

  // 进入处理步骤前检测异常
  useEffect(() => {
    if (currentStep === 3) {
      detectAnomalies();
    }
  }, [currentStep, detectAnomalies]);

  const handleProcess = async (resume = false) => {
    if (!fileA || !fileB) {
      message.error('请先上传两个文件');
      return;
    }
    if (!keyColumnA || !keyColumnB) {
      message.error('请选择主键列');
      return;
    }
    if (selectedColumns.length === 0) {
      message.error('请至少选择一个要补充的列');
      return;
    }

    // 保存列配置
    configManager.saveColumnConfig(keyColumnA, keyColumnB, selectedColumns);

    // 新处理时，根据文件路径生成确定性 sessionId（跨重启可复现）
    let currentSessionId = sessionId;
    if (!resume) {
      currentSessionId = deriveSessionId(fileA.filePath, fileB.filePath);
      setSessionId(currentSessionId);
    }

    setProcessing(true);
    setProcessStatus(PROCESS_STATUS.PROCESSING);
    logger.info('开始处理数据', { sessionId: currentSessionId, resume });

    try {
      const result = await window.electronAPI.processData({
        fileAPath: fileA.filePath,
        fileBPath: fileB.filePath,
        keyColumnA,
        keyColumnB,
        selectedColumns,
        sessionId: currentSessionId,
        resume,
        matchRules: matchRules.length > 0 ? matchRules : null,
      });

      if (result.success) {
        setResultData(result.resultData);
        setResultColumns(result.columns);
        setStats(result.stats);
        setCurrentStep(4);
        setProcessStatus(PROCESS_STATUS.COMPLETED);
        setHasCheckpoint(false);
        message.success('数据处理完成！');
        logger.info('数据处理完成', { stats: result.stats });
      } else {
        setProcessStatus(PROCESS_STATUS.ERROR);
        if (result.autoRolledBack) {
          message.warning('处理失败，已自动回滚到原始状态');
        }
        if (result.canResume) {
          setHasCheckpoint(true);
          Modal.confirm({
            title: '处理中断',
            icon: <ExclamationCircleOutlined />,
            content: result.message + '，是否保存进度以便稍后继续？',
            okText: '保存进度',
            cancelText: '放弃',
            onOk: () => {
              message.info('进度已保存，可稍后点击"继续处理"恢复');
            },
            onCancel: () => {
              setHasCheckpoint(false);
              window.electronAPI.checkCheckpoint(sessionId);
              message.info('已放弃保存的进度');
            },
          });
        } else {
          message.error(result.message);
        }
      }
    } catch (error) {
      setProcessStatus(PROCESS_STATUS.ERROR);
      message.error('处理失败: ' + error.message);
      logger.error('处理失败', error);
    } finally {
      setProcessing(false);
    }
  };

  // 暂停处理
  const handlePause = () => {
    window.electronAPI.pauseProcess();
    setProcessStatus(PROCESS_STATUS.PAUSED);
    setHasCheckpoint(true);
    message.info('处理已暂停');
  };

  // 回滚操作
  const handleRollback = async () => {
    Modal.confirm({
      title: '确认回滚',
      icon: <RollbackOutlined />,
      content: '回滚将清除当前处理结果并恢复到原始状态，确定继续？',
      okText: '确认回滚',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          if (fileB) {
            const result = await window.electronAPI.rollback({
              sessionId,
              originalPath: fileB.filePath,
            });
            if (result.success) {
              message.success('回滚成功，文件已恢复到原始状态');
            } else {
              message.error('回滚失败: ' + result.message);
              return;
            }
          }
          
          setResultData(null);
          setResultColumns([]);
          setStats(null);
          setProcessStatus(PROCESS_STATUS.IDLE);
          setHasCheckpoint(false);
          setCurrentStep(3);
          logger.info('数据已回滚', { sessionId });
        } catch (error) {
          message.error('回滚失败: ' + error.message);
          logger.error('回滚失败', error);
        }
      },
    });
  };

  const handleSave = async (format) => {
    if (!resultData) {
      message.error('没有可保存的数据');
      return;
    }

    const result = await window.electronAPI.saveResult({
      data: resultData,
      format,
      originalFileName: fileB.fileName,
      fileAName: fileA.fileName,
      selectedColumns,
    });

    if (result.success) {
      if (result.warning) {
        message.warning(result.warning);
      }
      if (result.filePath) {
        Modal.success({
          title: '保存成功',
          content: `文件已保存至: ${result.filePath}`,
          okText: '打开所在文件夹',
          cancelText: '关闭',
          okCancel: true,
          onOk: () => {
            window.electronAPI.showItemInFolder(result.filePath);
          },
        });
      }
      logger.info('文件已保存', { filePath: result.filePath });
    } else {
      message.error(result.message);
    }
  };

  const handleReset = () => {
    setCurrentStep(0);
    setFileA(null);
    setFileB(null);
    setCleaningOptions({
      [CLEANING_OPERATIONS.TRIM_SPACES]: false,
      [CLEANING_OPERATIONS.NORMALIZE_DATE]: false,
      [CLEANING_OPERATIONS.REMOVE_DUPLICATES]: false,
      [CLEANING_OPERATIONS.FILL_NULLS]: false,
      trimColumns: [],
      dateColumns: [],
      duplicateKeyColumns: [],
      fillNullsMode: null,
      fillNullsColumns: [],
      fillNullsDefaultValue: '',
    });
    setCleanedFileA(null);
    setSelectedColumns([]);
    setKeyColumnA('');
    setKeyColumnB('');
    setResultData(null);
    setResultColumns([]);
    setStats(null);
    setProcessStatus(PROCESS_STATUS.IDLE);
    setHasCheckpoint(false);
    setAnomalies([]);
    setMatchRules([]);
    logger.info('应用已重置', { sessionId });
  };

  const steps = [
    { title: '上传文件', description: '上传源文件A和目标文件B' },
    { title: '数据清洗', description: '选择清洗操作并预览效果' },
    { title: '选择列', description: '选择主键列和要补充的数据列' },
    { title: '处理数据', description: '执行数据匹配和补充' },
    { title: '预览保存', description: '预览结果并保存文件' }
  ];

  const canProceedToStep2 = fileA && fileB;
  const canProceedToStep3 = canProceedToStep2;
  const canProceedToStep4 = canProceedToStep3 && keyColumnA && keyColumnB && selectedColumns.length > 0;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ 
        background: 'linear-gradient(135deg, #1890ff 0%, #722ed1 100%)',
        padding: '0 24px'
      }}>
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '100%'
        }}>
          <h1 style={{ color: '#fff', margin: 0, fontSize: '20px' }}>
            📊 离线数据处理器
          </h1>
          <Space>
            {appInfo && (
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: '12px' }}>
                桌面版
              </Text>
            )}
            <Button 
              type="text" 
              icon={<QuestionCircleOutlined />} 
              style={{ color: '#fff' }}
              onClick={() => setHelpVisible(true)}
            >
              使用帮助
            </Button>
          </Space>
        </div>
      </Header>

      <Content style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
        <PageContainer
          ghost
          header={{ title: null, breadcrumb: {} }}
        >
        {hasCheckpoint && currentStep < 3 && (
          <Alert
            message="发现未完成的处理"
            description={
              <Space>
                <span>上次处理未完成，可以继续处理或重新开始。</span>
                <Button 
                  type="primary" 
                  size="small" 
                  icon={<ReloadOutlined />}
                  onClick={() => handleProcess(true)}
                >
                  继续处理
                </Button>
              </Space>
            }
            type="warning"
            showIcon
            style={{ marginBottom: '16px' }}
          />
        )}

        <ProCard style={{ marginBottom: '24px' }}>
          <Steps current={currentStep} items={steps} />
        </ProCard>

        {currentStep === 0 && (
          <FileUpload
            fileA={fileA}
            fileB={fileB}
            onFileASelect={handleFileASelect}
            onFileBSelect={handleFileBSelect}
            onNext={() => setCurrentStep(1)}
            canProceed={canProceedToStep2}
          />
        )}

        {currentStep === 1 && (
          <DataCleanerComponent
            fileA={fileA}
            fileB={fileB}
            cleaningOptions={cleaningOptions}
            onCleaningOptionsChange={setCleaningOptions}
            onBack={() => setCurrentStep(0)}
            onNext={() => setCurrentStep(2)}
            canProceed={canProceedToStep3}
          />
        )}

        {currentStep === 2 && (
          <ColumnSelector
            fileA={fileA}
            fileB={fileB}
            keyColumnA={keyColumnA}
            keyColumnB={keyColumnB}
            selectedColumns={selectedColumns}
            onKeyColumnAChange={setKeyColumnA}
            onKeyColumnBChange={setKeyColumnB}
            onSelectedColumnsChange={setSelectedColumns}
            onBack={() => setCurrentStep(1)}
            onNext={() => setCurrentStep(3)}
            canProceed={canProceedToStep4}
            matchRules={matchRules}
            onMatchRulesChange={setMatchRules}
          />
        )}

        {currentStep === 3 && (
          <ProcessingStatus
            processing={processing}
            processStatus={processStatus}
            progress={progress}
            anomalies={anomalies}
            hasCheckpoint={hasCheckpoint}
            onProcess={() => handleProcess(false)}
            onResume={() => handleProcess(true)}
            onPause={handlePause}
            onRollback={handleRollback}
            onBack={() => setCurrentStep(2)}
            fileA={fileA}
            fileB={fileB}
            selectedColumns={selectedColumns}
            keyColumnA={keyColumnA}
            keyColumnB={keyColumnB}
          />
        )}

        {currentStep === 4 && (
          <DataPreview
            data={resultData}
            columns={resultColumns}
            stats={stats}
            selectedColumns={selectedColumns}
            onSave={handleSave}
            onReset={handleReset}
            onRollback={handleRollback}
          />
        )}
        </PageContainer>
      </Content>

      <Modal
        title="使用帮助"
        open={helpVisible}
        onCancel={() => setHelpVisible(false)}
        footer={null}
        width={800}
      >
        <HelpGuide appInfo={appInfo} />
      </Modal>
    </Layout>
  );
}

export default App;
