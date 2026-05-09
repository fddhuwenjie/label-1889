import React from 'react';
import { Typography, Collapse, Tag, Space, Divider, Alert } from 'antd';
import { 
  UploadOutlined, 
  TableOutlined, 
  PlayCircleOutlined, 
  DownloadOutlined,
  QuestionCircleOutlined,
  SafetyOutlined
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

const HelpGuide = ({ appInfo }) => {
  const items = [
    {
      key: '1',
      label: (
        <Space>
          <UploadOutlined />
          <span>步骤1：上传文件</span>
        </Space>
      ),
      children: (
        <div>
          <Paragraph>
            <Text strong>支持的文件格式（完整列表）：</Text>
          </Paragraph>
          <table style={{ width: '100%', marginBottom: '16px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafafa' }}>
                <th style={{ padding: '8px', border: '1px solid #f0f0f0', textAlign: 'left' }}>格式</th>
                <th style={{ padding: '8px', border: '1px solid #f0f0f0', textAlign: 'left' }}>扩展名</th>
                <th style={{ padding: '8px', border: '1px solid #f0f0f0', textAlign: 'left' }}>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '8px', border: '1px solid #f0f0f0' }}><Tag color="blue">CSV</Tag></td>
                <td style={{ padding: '8px', border: '1px solid #f0f0f0' }}>.csv</td>
                <td style={{ padding: '8px', border: '1px solid #f0f0f0' }}>逗号分隔值文件，UTF-8 编码，通用性最强</td>
              </tr>
              <tr>
                <td style={{ padding: '8px', border: '1px solid #f0f0f0' }}><Tag color="green">Excel</Tag></td>
                <td style={{ padding: '8px', border: '1px solid #f0f0f0' }}>.xlsx</td>
                <td style={{ padding: '8px', border: '1px solid #f0f0f0' }}>Excel 2007+ 格式（Office Open XML），推荐使用</td>
              </tr>
              <tr>
                <td style={{ padding: '8px', border: '1px solid #f0f0f0' }}><Tag color="orange">Excel 97-2003</Tag></td>
                <td style={{ padding: '8px', border: '1px solid #f0f0f0' }}>.xls</td>
                <td style={{ padding: '8px', border: '1px solid #f0f0f0' }}>旧版 Excel 格式（BIFF8），兼容旧系统</td>
              </tr>
            </tbody>
          </table>
          <Paragraph>
            <Text strong>文件限制：</Text>
          </Paragraph>
          <ul>
            <li>单个文件最大 100MB</li>
            <li>建议单文件行数不超过 100,000 行，列数不超过 500 列</li>
            <li>文件内容需与扩展名匹配（系统会进行魔数验证）</li>
          </ul>
          <Paragraph>
            <Text strong>文件说明：</Text>
          </Paragraph>
          <ul>
            <li><Text strong>文件A（源数据文件）：</Text>包含您想要提取的数据列</li>
            <li><Text strong>文件B（目标文件）：</Text>需要补充数据的文件，处理后将保持原有结构</li>
          </ul>
          <Alert
            message="提示"
            description="点击上传区域选择文件，或直接将文件拖拽到上传区域。项目提供了示例数据（sample_data 目录）供测试使用。"
            type="info"
            showIcon
          />
        </div>
      )
    },
    {
      key: '2',
      label: (
        <Space>
          <TableOutlined />
          <span>步骤2：选择数据列</span>
        </Space>
      ),
      children: (
        <div>
          <Paragraph>
            <Text strong>主键列：</Text>
          </Paragraph>
          <Paragraph>
            主键列用于匹配两个文件中的对应行。请选择两个文件中具有相同含义的列（如 ID、编号、姓名等唯一标识）。
          </Paragraph>
          <Paragraph>
            <Text strong>要补充的列：</Text>
          </Paragraph>
          <Paragraph>
            勾选您想要从文件A中提取并补充到文件B的数据列。系统会自动识别：
          </Paragraph>
          <ul>
            <li><Tag color="green">共有列</Tag>：两个文件都有的列，匹配成功时用文件A的值补充到文件B</li>
            <li><Tag color="blue">新增列</Tag>：文件A独有的列，将作为新列添加到文件B</li>
            <li><Tag color="default">B独有列</Tag>：文件B独有、文件A中不存在的列，不可选择，保持原样不修改</li>
          </ul>
        </div>
      )
    },
    {
      key: '3',
      label: (
        <Space>
          <PlayCircleOutlined />
          <span>步骤3：处理数据</span>
        </Space>
      ),
      children: (
        <div>
          <Paragraph>
            确认配置后，点击"开始处理"按钮。系统将：
          </Paragraph>
          <ol>
            <li>自动创建原始文件的备份</li>
            <li>根据主键列匹配两个文件中的对应行</li>
            <li>将文件A中选定列的数据补充到文件B</li>
            <li>对于未匹配的行，使用空值（NULL）填充</li>
          </ol>
          <Alert
            message="数据安全"
            description="处理过程中会自动创建备份，您的原始文件不会被修改。支持断点续处理和回滚操作。"
            type="success"
            showIcon
          />
        </div>
      )
    },
    {
      key: '4',
      label: (
        <Space>
          <DownloadOutlined />
          <span>步骤4：预览与保存</span>
        </Space>
      ),
      children: (
        <div>
          <Paragraph>
            <Text strong>数据预览：</Text>
          </Paragraph>
          <ul>
            <li>支持分页浏览、多列排序（按住 Shift 点击列头）和多列条件筛选</li>
            <li>拖拽列头边缘可调整列宽</li>
            <li><Tag color="blue">蓝色背景</Tag>表示已补充的数据</li>
            <li><Tag color="orange">橙色文字</Tag>表示空值（NULL）</li>
            <li>绿色行表示匹配成功，红色行表示未匹配</li>
          </ul>
          <Paragraph>
            <Text strong>保存格式：</Text>
          </Paragraph>
          <Space wrap>
            <Tag color="blue">CSV - 通用格式，兼容性好</Tag>
            <Tag color="green">Excel (.xlsx) - 保留格式，适合进一步编辑</Tag>
          </Space>
          <Alert
            message="格式保留说明"
            description="保存为 Excel 格式时，系统仅更新补充列的单元格值(cell.v)，严格保留文件B原有的单元格类型、数字格式和样式属性，不会重建整个表格结构。如果 Excel 保存失败，系统会自动提示并降级保存为 CSV 格式，确保数据不丢失。CSV 为纯文本格式，无法保留原始数据类型和格式设置。"
            type="info"
            showIcon
            style={{ marginTop: '12px' }}
          />
        </div>
      )
    },
    {
      key: '5',
      label: (
        <Space>
          <QuestionCircleOutlined />
          <span>常见问题</span>
        </Space>
      ),
      children: (
        <div>
          <Paragraph>
            <Text strong>Q: 为什么有些行显示未匹配？</Text>
          </Paragraph>
          <Paragraph>
            A: 未匹配表示在文件A中找不到与文件B主键值相同的行。请检查主键列选择是否正确，或数据是否存在差异。
          </Paragraph>
          <Divider />
          <Paragraph>
            <Text strong>Q: 处理后文件B的顺序会改变吗？</Text>
          </Paragraph>
          <Paragraph>
            A: 不会。系统严格保持文件B的原始行顺序和数据结构。
          </Paragraph>
          <Divider />
          <Paragraph>
            <Text strong>Q: 备份文件存储在哪里？</Text>
          </Paragraph>
          <Paragraph>
            A: 备份文件存储在应用数据目录的 backups 文件夹中。
            {appInfo?.backupDir && <Text code>{appInfo.backupDir}</Text>}
          </Paragraph>
          <Divider />
          <Paragraph>
            <Text strong>Q: 如何回滚到原始数据？</Text>
          </Paragraph>
          <Paragraph>
            A: 在处理完成后，点击"回滚"按钮可以恢复到处理前的原始状态。系统会自动从备份中恢复数据。
          </Paragraph>
        </div>
      )
    },
    {
      key: '6',
      label: (
        <Space>
          <SafetyOutlined />
          <span>数据安全说明</span>
        </Space>
      ),
      children: (
        <div>
          <Alert
            message="离线处理"
            description="本应用为纯离线版本，所有数据处理均在本地计算机完成，不会上传任何数据到互联网，确保您的数据隐私安全。"
            type="success"
            showIcon
            style={{ marginBottom: '16px' }}
          />
          <ul>
            <li>所有文件处理在本地完成</li>
            <li>不需要网络连接</li>
            <li>不会收集或上传任何用户数据</li>
            <li>自动创建本地备份保护原始数据</li>
            <li>支持事务回滚，确保数据安全</li>
          </ul>
        </div>
      )
    }
  ];

  return (
    <div>
      <Title level={5}>使用指南</Title>
      <Collapse items={items} defaultActiveKey={['1']} />
    </div>
  );
};

export default HelpGuide;
