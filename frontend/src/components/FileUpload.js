import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Button, Progress, Tag, Alert, Space, Typography, message } from 'antd';
import { 
  FileExcelOutlined, 
  CheckCircleOutlined, 
  CloseCircleOutlined,
  DeleteOutlined,
  ArrowRightOutlined,
  LoadingOutlined,
  InboxOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { APP_CONFIG } from '../constants';
import { UPLOAD_STATUS } from '../constants';

const { Text, Title } = Typography;

const { SUPPORTED_FORMATS } = APP_CONFIG;

const FileUpload = ({ onFileASelect, onFileBSelect, onNext, canProceed, fileA, fileB }) => {
  const [uploadStatusA, setUploadStatusA] = useState(UPLOAD_STATUS.IDLE);
  const [uploadStatusB, setUploadStatusB] = useState(UPLOAD_STATUS.IDLE);
  const [progressA, setProgressA] = useState(0);
  const [progressB, setProgressB] = useState(0);
  const [errorA, setErrorA] = useState('');
  const [errorB, setErrorB] = useState('');
  const [draggingA, setDraggingA] = useState(false);
  const [draggingB, setDraggingB] = useState(false);
  // 记录上次失败的文件路径，用于重试
  const [lastPathA, setLastPathA] = useState(null);
  const [lastPathB, setLastPathB] = useState(null);

  // 监听 Electron 文件解析进度
  useEffect(() => {
    const unsubscribe = window.electronAPI.onFileParseProgress((progress) => {
      const { fileType, percentage, phase } = progress;
      const setStatus = fileType === 'A' ? setUploadStatusA : setUploadStatusB;
      const setProg = fileType === 'A' ? setProgressA : setProgressB;

      if (phase === 'validating') {
        setStatus(prev => prev === UPLOAD_STATUS.SUCCESS ? prev : UPLOAD_STATUS.PREPARING);
        setProg(percentage);
      } else if (phase === 'parsing') {
        setStatus(prev => prev === UPLOAD_STATUS.SUCCESS ? prev : UPLOAD_STATUS.UPLOADING);
        setProg(prev => prev === 100 ? prev : Math.min(percentage, 95));
      } else if (phase === 'done') {
        setProg(100);
      }
    });
    return () => unsubscribe();
  }, []);

  // 通过原生对话框选择文件
  const handleFileSelect = async (fileType) => {
    const setStatus = fileType === 'A' ? setUploadStatusA : setUploadStatusB;
    const setProg = fileType === 'A' ? setProgressA : setProgressB;
    const setError = fileType === 'A' ? setErrorA : setErrorB;
    const onSelect = fileType === 'A' ? onFileASelect : onFileBSelect;

    setError('');
    setProg(0);
    setStatus(UPLOAD_STATUS.PREPARING);

    try {
      const result = await window.electronAPI.selectFile(fileType);
      
      if (!result.success) {
        setStatus(UPLOAD_STATUS.IDLE);
        if (result.message !== '未选择文件') {
          setStatus(UPLOAD_STATUS.ERROR);
          setError(result.message);
        }
        return;
      }

      setStatus(UPLOAD_STATUS.SUCCESS);
      setProg(100);
      onSelect(result);
      message.success(`文件 ${result.fileName} 上传完成！`);
    } catch (error) {
      setStatus(UPLOAD_STATUS.ERROR);
      setError(error.message);
    }
  };

  // 拖拽文件：通过主进程解析（使用磁盘绝对路径）
  const handleElectronDrop = async (fileType, filePath) => {
    const setStatus = fileType === 'A' ? setUploadStatusA : setUploadStatusB;
    const setProg = fileType === 'A' ? setProgressA : setProgressB;
    const setError = fileType === 'A' ? setErrorA : setErrorB;
    const onSelect = fileType === 'A' ? onFileASelect : onFileBSelect;
    const setLastPath = fileType === 'A' ? setLastPathA : setLastPathB;

    const ext = '.' + filePath.split('.').pop().toLowerCase();
    if (!SUPPORTED_FORMATS.includes(ext)) {
      setStatus(UPLOAD_STATUS.ERROR);
      setError(`不支持的文件格式: ${ext}。支持的格式: ${SUPPORTED_FORMATS.join(', ')}`);
      return;
    }

    setError('');
    setProg(0);
    setStatus(UPLOAD_STATUS.PREPARING);
    setLastPath(filePath);

    try {
      const result = await window.electronAPI.parseDroppedFile(fileType, filePath);

      if (!result.success) {
        setStatus(UPLOAD_STATUS.ERROR);
        setError(result.message);
        return;
      }

      setStatus(UPLOAD_STATUS.SUCCESS);
      setProg(100);
      onSelect(result);
      message.success(`文件 ${result.fileName} 上传完成！`);
    } catch (error) {
      setStatus(UPLOAD_STATUS.ERROR);
      setError(error.message);
    }
  };

  // 重试上次失败的文件加载
  const handleRetry = (fileType) => {
    const lastPath = fileType === 'A' ? lastPathA : lastPathB;
    if (lastPath) {
      handleElectronDrop(fileType, lastPath);
    } else {
      handleFileSelect(fileType);
    }
  };

  // 拖放事件处理
  const handleDragEnter = (e, fileType) => {
    e.preventDefault();
    e.stopPropagation();
    if (fileType === 'A') setDraggingA(true);
    else setDraggingB(true);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e, fileType) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget)) return;
    if (fileType === 'A') setDraggingA(false);
    else setDraggingB(false);
  };

  const handleDrop = (e, fileType) => {
    e.preventDefault();
    e.stopPropagation();
    if (fileType === 'A') setDraggingA(false);
    else setDraggingB(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.path) {
        handleElectronDrop(fileType, file.path);
      }
    }
  };

  const clearFile = (fileType) => {
    if (fileType === 'A') {
      onFileASelect(null);
      setUploadStatusA(UPLOAD_STATUS.IDLE);
      setProgressA(0);
      setErrorA('');
      setLastPathA(null);
    } else {
      onFileBSelect(null);
      setUploadStatusB(UPLOAD_STATUS.IDLE);
      setProgressB(0);
      setErrorB('');
      setLastPathB(null);
    }
  };

  const getStatusIcon = (status, isA) => {
    const color = isA ? '#1890ff' : '#722ed1';
    switch (status) {
      case UPLOAD_STATUS.SUCCESS: return <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '48px' }} />;
      case UPLOAD_STATUS.ERROR: return <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: '48px' }} />;
      case UPLOAD_STATUS.PREPARING: 
        return <LoadingOutlined style={{ color, fontSize: '48px' }} />;
      case UPLOAD_STATUS.UPLOADING: 
        return <FileExcelOutlined style={{ color, fontSize: '48px' }} className="pulse-animation" />;
      default: return <FileExcelOutlined style={{ color, fontSize: '48px' }} />;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case UPLOAD_STATUS.PREPARING: return '准备中...';
      case UPLOAD_STATUS.UPLOADING: return '上传中...';
      case UPLOAD_STATUS.SUCCESS: return '上传完成';
      case UPLOAD_STATUS.ERROR: return '上传失败';
      default: return '准备就绪';
    }
  };

  const renderUploadArea = (fileType, file, status, progress, error) => {
    const isA = fileType === 'A';
    const color = isA ? '#1890ff' : '#722ed1';
    const bgColor = isA ? 'rgba(24, 144, 255, 0.02)' : 'rgba(114, 46, 209, 0.02)';
    const borderColor = isA ? 'rgba(24, 144, 255, 0.3)' : 'rgba(114, 46, 209, 0.3)';
    const label = isA ? '源数据文件 (A)' : '目标文件 (B)';
    const description = isA 
      ? '包含要提取的数据列' 
      : '需要补充数据的目标文件';
    const isDragging = isA ? draggingA : draggingB;

    return (
      <Card 
        title={
          <Space>
            <Tag color={isA ? 'blue' : 'purple'}>{fileType}</Tag>
            <span>{label}</span>
          </Space>
        }
        style={{ 
          height: '100%',
          background: bgColor,
          borderColor: borderColor,
          borderWidth: '2px',
          transition: 'all 0.3s ease'
        }}
        extra={file && (
          <Button 
            type="text" 
            danger 
            icon={<DeleteOutlined />}
            onClick={() => clearFile(fileType)}
          >
            清除
          </Button>
        )}
      >
        <div
          className={`upload-dragger${isDragging ? ' dragging' : ''}`}
          style={{ 
            borderColor: isDragging ? color : borderColor,
            backgroundColor: isDragging ? (isA ? 'rgba(24, 144, 255, 0.08)' : 'rgba(114, 46, 209, 0.08)') : undefined,
            minHeight: '200px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.3s ease',
            cursor: 'pointer'
          }}
          onClick={() => handleFileSelect(fileType)}
          onDragEnter={(e) => handleDragEnter(e, fileType)}
          onDragOver={handleDragOver}
          onDragLeave={(e) => handleDragLeave(e, fileType)}
          onDrop={(e) => handleDrop(e, fileType)}
        >
          {isDragging 
            ? <InboxOutlined style={{ color, fontSize: '48px' }} />
            : getStatusIcon(status, isA)
          }
          
          <Text strong style={{ marginTop: '16px', fontSize: '16px' }}>
            {file ? file.fileName : description}
          </Text>

          {(status === UPLOAD_STATUS.PREPARING || status === UPLOAD_STATUS.UPLOADING) && (
            <>
              <Progress 
                percent={progress} 
                style={{ width: '80%', marginTop: '16px' }} 
                strokeColor={color}
                status={status === UPLOAD_STATUS.PREPARING ? 'active' : 'normal'}
              />
              {status === UPLOAD_STATUS.UPLOADING && progress > 0 && progress < 100 && (
                <Text type="secondary" style={{ fontSize: '11px', marginTop: '4px' }}>
                  Excel 文件进度为估算值（非流式解析），CSV 文件为实时进度
                </Text>
              )}
            </>
          )}

          {status === UPLOAD_STATUS.IDLE && (
            <Text type="secondary" style={{ marginTop: '8px' }}>
              {isDragging ? '松开鼠标即可加载文件' : '点击选择文件或将文件拖拽到此区域'}
            </Text>
          )}

          {file && status === UPLOAD_STATUS.SUCCESS && (
            <Space direction="vertical" style={{ marginTop: '16px' }} align="center">
              <Tag color="green">{getStatusText(status)}</Tag>
              <Text type="secondary">
                {file.totalRows || file.data.length} 行数据 · {file.columns.length} 列
                {file.isPreview && ` (预览前 ${file.data.length} 行)`}
              </Text>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                列: {file.columns.slice(0, 5).join(', ')}{file.columns.length > 5 ? '...' : ''}
              </Text>
            </Space>
          )}
        </div>

        {error && (
          <Alert 
            message="错误" 
            description={
              <Space direction="vertical">
                <span>{error}</span>
                <Button 
                  type="primary" 
                  size="small" 
                  icon={<ReloadOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRetry(fileType);
                  }}
                >
                  重试
                </Button>
              </Space>
            }
            type="error" 
            showIcon 
            style={{ marginTop: '16px' }}
          />
        )}
      </Card>
    );
  };

  return (
    <div className="step-container">
      <Title level={4} style={{ marginBottom: '24px' }}>
        步骤 1: 选择文件
      </Title>

      <Alert
        message="支持的文件格式"
        description={
          <Space>
            <Tag color="blue">CSV (.csv)</Tag>
            <Tag color="green">Excel (.xlsx)</Tag>
            <Tag color="orange">Excel 97-2003 (.xls)</Tag>
            <Text type="secondary">最大文件大小: 100MB</Text>
          </Space>
        }
        type="info"
        showIcon
        style={{ marginBottom: '24px' }}
      />

      <Row gutter={24}>
        <Col span={12}>
          {renderUploadArea('A', fileA, uploadStatusA, progressA, errorA)}
        </Col>
        <Col span={12}>
          {renderUploadArea('B', fileB, uploadStatusB, progressB, errorB)}
        </Col>
      </Row>

      <div style={{ marginTop: '24px', textAlign: 'right' }}>
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

export default FileUpload;
