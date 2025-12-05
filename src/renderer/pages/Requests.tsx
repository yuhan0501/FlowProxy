import React, { useState, useEffect, useCallback } from 'react';
import { 
  Table, Input, Select, Button, Space, Typography, Card, Tabs, 
  Tag, Descriptions, message, Empty, Tooltip, Collapse 
} from 'antd';
import { 
  CopyOutlined, ClearOutlined, ReloadOutlined, SearchOutlined 
} from '@ant-design/icons';
import { RequestRecord, HttpRequest, HttpResponse } from '../../shared/models';
import { useI18n } from '../i18n';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

const Requests: React.FC = () => {
  const { t } = useI18n();
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<RequestRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState({ search: '', method: '' });

  useEffect(() => {
    // 安全检查：如果 preload 未正确注入 electronAPI，则避免整个页面崩溃
    if (!window.electronAPI) {
      console.error('electronAPI is not available on window');
      return;
    }

    loadRequests();
    const unsubscribe = window.electronAPI.onNewRequest((record) => {
      setRequests(prev => [record, ...prev.filter(r => r.id !== record.id)].slice(0, 500));
    });
    return () => unsubscribe();
  }, []);

  const loadRequests = async () => {
    if (!window.electronAPI) {
      console.error('electronAPI is not available on window');
      return;
    }

    setLoading(true);
    try {
      const data = await window.electronAPI.getRequests(filter.search || filter.method ? filter : undefined);
      setRequests(data);
    } catch (error) {
      console.error('Failed to load requests:', error);
      message.error(t('requests.load.failed'));
    } finally {
      setLoading(false);
    }
  };

  const clearRequests = async () => {
    if (!window.electronAPI) {
      console.error('electronAPI is not available on window');
      return;
    }
    try {
      await window.electronAPI.clearRequests();
      setRequests([]);
      setSelectedRequest(null);
      message.success('Requests cleared');
    } catch (error) {
      console.error('Failed to clear requests:', error);
      message.error(t('requests.clear.failed'));
    }
  };

  const copyAsCurl = useCallback((record: RequestRecord) => {
    const req = record.request;
    let curl = `curl -X ${req.method} '${req.url}'`;
    
    Object.entries(req.headers).forEach(([key, value]) => {
      if (!['host', 'content-length'].includes(key.toLowerCase())) {
        curl += ` \\\n  -H '${key}: ${value}'`;
      }
    });
    
    if (req.body) {
      curl += ` \\\n  --data-binary '${req.body.replace(/'/g, "\\'")}'`;
    }
    
    navigator.clipboard.writeText(curl);
    message.success(t('requests.copy.curl.success'));
  }, []);

  const copyAsRaw = useCallback((record: RequestRecord) => {
    const req = record.request;
    let raw = '';
    
    try {
      const url = new URL(req.url);
      raw = `${req.method} ${url.pathname}${url.search} HTTP/1.1\n`;
      raw += `Host: ${url.host}\n`;
    } catch {
      raw = `${req.method} ${req.url} HTTP/1.1\n`;
    }
    
    Object.entries(req.headers).forEach(([key, value]) => {
      if (key.toLowerCase() !== 'host') {
        raw += `${key}: ${value}\n`;
      }
    });
    
    if (req.body) {
      raw += `\n${req.body}`;
    }
    
    navigator.clipboard.writeText(raw);
    message.success(t('requests.copy.raw.success'));
  }, []);

  const getMethodColor = (method: string) => {
    const colors: Record<string, string> = {
      GET: 'blue', POST: 'green', PUT: 'orange', 
      DELETE: 'red', PATCH: 'cyan', OPTIONS: 'purple'
    };
    return colors[method] || 'default';
  };

  const getStatusColor = (status?: number) => {
    if (!status) return 'default';
    if (status < 300) return 'green';
    if (status < 400) return 'orange';
    return 'red';
  };

  const columns = [
    {
      title: t('requests.table.method'),
      dataIndex: ['request', 'method'],
      width: 80,
      render: (method: string) => <Tag color={getMethodColor(method)}>{method}</Tag>,
    },
    {
      title: t('requests.table.url'),
      dataIndex: ['request', 'url'],
      ellipsis: true,
      render: (url: string) => (
        <Tooltip title={url}>
          <Text style={{ fontSize: '12px' }}>{url}</Text>
        </Tooltip>
      ),
    },
    {
      title: t('requests.table.status'),
      dataIndex: ['response', 'statusCode'],
      width: 80,
      render: (status?: number) => status ? (
        <Tag color={getStatusColor(status)}>{status}</Tag>
      ) : <Tag>{t('requests.status.pending')}</Tag>,
    },
    {
      title: t('requests.table.duration'),
      dataIndex: 'durationMs',
      width: 100,
      render: (ms?: number) => ms ? `${ms}${t('requests.duration.unit')}` : '-',
    },
  ];

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 112px)', gap: '16px' }}>
      {/* Request List */}
      <Card 
        style={{ flex: '0 0 50%', display: 'flex', flexDirection: 'column' }}
        bodyStyle={{ flex: 1, overflow: 'hidden', padding: '12px' }}
        title={
          <Space>
            <Title level={5} style={{ margin: 0 }}>{t('requests.title')}</Title>
            <Text type="secondary">({requests.length})</Text>
          </Space>
        }
        extra={
          <Space>
            <Input
              placeholder={t('requests.search.placeholder')}
              prefix={<SearchOutlined />}
              value={filter.search}
              onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
              style={{ width: 200 }}
              onPressEnter={loadRequests}
            />
            <Select
              placeholder={t('requests.method.placeholder')}
              value={filter.method || undefined}
              onChange={v => setFilter(f => ({ ...f, method: v || '' }))}
              allowClear
              style={{ width: 100 }}
            >
              {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map(m => (
                <Option key={m} value={m}>{m}</Option>
              ))}
            </Select>
            <Button icon={<ReloadOutlined />} onClick={loadRequests}>
              {t('requests.btn.refresh')}
            </Button>
            <Button icon={<ClearOutlined />} onClick={clearRequests} danger>
              {t('requests.btn.clear')}
            </Button>
          </Space>
        }
      >
        <Table
          dataSource={requests}
          columns={columns}
          rowKey="id"
          size="small"
          loading={loading}
          pagination={{ pageSize: 50, showSizeChanger: false }}
          scroll={{ y: 'calc(100vh - 280px)' }}
          onRow={(record) => ({
            onClick: () => setSelectedRequest(record),
            style: { 
              cursor: 'pointer',
              background: selectedRequest?.id === record.id ? '#1f1f1f' : undefined
            }
          })}
        />
      </Card>

      {/* Request Detail */}
      <Card 
        style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
        bodyStyle={{ flex: 1, overflow: 'auto', padding: '12px' }}
        title={t('requests.detail.title')}
        extra={
          selectedRequest && (
            <Space>
              <Button 
                icon={<CopyOutlined />} 
                onClick={() => copyAsCurl(selectedRequest)}
              >
                {t('requests.btn.copyCurl')}
              </Button>
              <Button 
                icon={<CopyOutlined />} 
                onClick={() => copyAsRaw(selectedRequest)}
              >
                {t('requests.btn.copyRaw')}
              </Button>
            </Space>
          )
        }
      >
        {selectedRequest ? (
          <RequestDetail record={selectedRequest} />
        ) : (
          <Empty description={t('requests.empty.detail')} />
        )}
      </Card>
    </div>
  );
};

const { Panel } = Collapse;

const RequestDetail: React.FC<{ record: RequestRecord }> = ({ record }) => {
  const { request, response } = record;
  const { t } = useI18n();

  const formatBody = (body?: string, contentType?: string) => {
    if (!body) return <Text type="secondary">{t('requests.body.none')}</Text>;

    // JSON pretty-print
    if (contentType?.includes('application/json')) {
      try {
        const parsed = JSON.parse(body);
        return (
          <pre className="code-block json-body">
            {JSON.stringify(parsed, null, 2)}
          </pre>
        );
      } catch {
        // fall through
      }
    }

    // XML: 简单缩进（不做严格解析）
    if (contentType?.includes('xml')) {
      return (
        <pre className="code-block xml-body">
          {body}
        </pre>
      );
    }

    return <pre className="code-block plain-body">{body}</pre>;
  };

  const tabs = [
    {
      key: 'request',
      label: 'Request',
      children: (
        <>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Method">{request.method}</Descriptions.Item>
            <Descriptions.Item label="URL">{request.url}</Descriptions.Item>
            <Descriptions.Item label="Timestamp">
              {new Date(request.timestamp).toLocaleString()}
            </Descriptions.Item>
          </Descriptions>

          <Collapse defaultActiveKey={[]} style={{ marginTop: '16px' }}>
            <Panel header="Headers" key="headers">
              <Descriptions column={1} size="small" bordered>
                {Object.entries(request.headers).map(([key, value]) => (
                  <Descriptions.Item key={key} label={key}>
                    {value}
                  </Descriptions.Item>
                ))}
              </Descriptions>
            </Panel>
          </Collapse>

          <Title level={5} style={{ marginTop: '16px' }}>Body</Title>
          {formatBody(request.body, request.headers['content-type'])}
        </>
      ),
    },
    {
      key: 'response',
      label: 'Response',
      children: response ? (
        <>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Status">
              <Tag color={response.statusCode < 400 ? 'green' : 'red'}>
                {response.statusCode} {response.statusMessage}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Duration">
              {record.durationMs}ms
            </Descriptions.Item>
          </Descriptions>

          <Collapse defaultActiveKey={[]} style={{ marginTop: '16px' }}>
            <Panel header="Headers" key="headers">
              <Descriptions column={1} size="small" bordered>
                {Object.entries(response.headers).map(([key, value]) => (
                  <Descriptions.Item key={key} label={key}>
                    {value}
                  </Descriptions.Item>
                ))}
              </Descriptions>
            </Panel>
          </Collapse>

          <Title level={5} style={{ marginTop: '16px' }}>Body</Title>
          {formatBody(response.body, response.headers['content-type'])}
        </>
      ) : (
        <Empty description={t('requests.empty.response')} />
      ),
    },
  ];

  return <Tabs defaultActiveKey="request" items={tabs} />;
};

export default Requests;
