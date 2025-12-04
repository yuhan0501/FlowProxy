import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Card, Table, Button, Space, Switch, Typography, Modal, 
  Form, Input, message, Popconfirm, Tag, Select, Collapse, Descriptions, Tabs 
} from 'antd';
import { 
  PlusOutlined, EditOutlined, DeleteOutlined, CopyOutlined, BugOutlined 
} from '@ant-design/icons';
import { FlowDefinition, RequestRecord, FlowDebugResult, HttpRequest, HttpResponse } from '../../shared/models';
import { v4 as uuidv4 } from 'uuid';

const { Title, Text } = Typography;
const { Panel } = Collapse;

const Flows: React.FC = () => {
  const navigate = useNavigate();
  const [flows, setFlows] = useState<FlowDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();

  const [debugModalVisible, setDebugModalVisible] = useState(false);
  const [debugFlowTarget, setDebugFlowTarget] = useState<FlowDefinition | null>(null);
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string>('');
  const [debugResult, setDebugResult] = useState<FlowDebugResult | null>(null);

  useEffect(() => {
    loadFlows();
  }, []);

  const loadFlows = async () => {
    if (!window.electronAPI) {
      console.error('electronAPI is not available on window');
      return;
    }

    setLoading(true);
    try {
      const data = await window.electronAPI.getFlows();
      setFlows(data);
    } catch (error) {
      console.error('Failed to load flows:', error);
      message.error('Failed to load flows');
    } finally {
      setLoading(false);
    }
  };

  const createFlow = async () => {
    if (!window.electronAPI) {
      console.error('electronAPI is not available on window');
      return;
    }

    try {
      const values = await form.validateFields();
      const newFlow: FlowDefinition = {
        id: uuidv4(),
        name: values.name,
        enabled: false,
        nodes: [
          {
            id: 'entry-1',
            type: 'entry',
            name: 'Entry',
            position: { x: 100, y: 200 },
            match: { methods: ['GET', 'POST'], hostPatterns: ['*'] },
          },
          {
            id: 'term-1',
            type: 'terminator',
            name: 'Pass Through',
            position: { x: 500, y: 200 },
            mode: 'pass_through',
          },
        ],
        edges: [{ id: 'e1', from: 'entry-1', to: 'term-1' }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      
      await window.electronAPI.saveFlow(newFlow);
      message.success('Flow created');
      setModalVisible(false);
      form.resetFields();
      loadFlows();
    } catch (error) {
      console.error('Failed to create flow:', error);
      message.error('Failed to create flow');
    }
  };

  const toggleFlow = async (id: string, enabled: boolean) => {
    if (!window.electronAPI) {
      console.error('electronAPI is not available on window');
      return;
    }
    try {
      await window.electronAPI.toggleFlow(id, enabled);
      setFlows(flows.map(f => f.id === id ? { ...f, enabled } : f));
    } catch (error) {
      console.error('Failed to toggle flow:', error);
      message.error('Failed to toggle flow');
    }
  };

  const deleteFlow = async (id: string) => {
    if (!window.electronAPI) {
      console.error('electronAPI is not available on window');
      return;
    }
    try {
      await window.electronAPI.deleteFlow(id);
      message.success('Flow deleted');
      loadFlows();
    } catch (error) {
      console.error('Failed to delete flow:', error);
      message.error('Failed to delete flow');
    }
  };

  const loadRequests = async () => {
    try {
      const data = await window.electronAPI.getRequests();
      setRequests(data);
    } catch (error) {
      console.error('Failed to load requests for flow debug:', error);
    }
  };

  const openDebugModal = (flow: FlowDefinition) => {
    setDebugFlowTarget(flow);
    setDebugResult(null);
    setSelectedRequestId('');
    loadRequests();
    setDebugModalVisible(true);
  };

  const runFlowDebug = async () => {
    if (!debugFlowTarget || !selectedRequestId) {
      message.warning('Please select a request');
      return;
    }
    try {
      const result = await window.electronAPI.debugFlow({
        flowId: debugFlowTarget.id,
        requestRecordId: selectedRequestId,
      });
      setDebugResult(result);
    } catch (error) {
      console.error('Flow debug failed:', error);
      message.error('Flow debug failed');
    }
  };

  const duplicateFlow = async (flow: FlowDefinition) => {
    if (!window.electronAPI) {
      console.error('electronAPI is not available on window');
      return;
    }
    const newFlow: FlowDefinition = {
      ...JSON.parse(JSON.stringify(flow)),
      id: uuidv4(),
      name: `${flow.name} (Copy)`,
      enabled: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    try {
      await window.electronAPI.saveFlow(newFlow);
      message.success('Flow duplicated');
      loadFlows();
    } catch (error) {
      console.error('Failed to duplicate flow:', error);
      message.error('Failed to duplicate flow');
    }
  };

  const columns = [
    {
      title: 'Enabled',
      dataIndex: 'enabled',
      width: 80,
      render: (enabled: boolean, record: FlowDefinition) => (
        <Switch 
          checked={enabled} 
          onChange={(checked) => toggleFlow(record.id, checked)}
          size="small"
        />
      ),
    },
    {
      title: 'Name',
      dataIndex: 'name',
      render: (name: string, record: FlowDefinition) => (
        <a onClick={() => navigate(`/flows/${record.id}`)}>{name}</a>
      ),
    },
    {
      title: 'Nodes',
      dataIndex: 'nodes',
      width: 100,
      render: (nodes: any[]) => <Tag>{nodes.length} nodes</Tag>,
    },
    {
      title: 'Updated',
      dataIndex: 'updatedAt',
      width: 180,
      render: (ts: number) => new Date(ts).toLocaleString(),
    },
    {
      title: 'Actions',
      width: 200,
      render: (_: any, record: FlowDefinition) => (
        <Space size={4}>
          <Button
            icon={<BugOutlined />}
            size="small"
            type="text"
            onClick={() => openDebugModal(record)}
          />
          <Button 
            icon={<EditOutlined />} 
            size="small"
            type="text"
            onClick={() => navigate(`/flows/${record.id}`)}
          />
          <Button 
            icon={<CopyOutlined />} 
            size="small"
            type="text"
            onClick={() => duplicateFlow(record)}
          />
          <Popconfirm
            title="Delete this flow?"
            onConfirm={() => deleteFlow(record.id)}
          >
            <Button icon={<DeleteOutlined />} size="small" type="text" danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '8px' }}>
      <Card
        title={<Title level={4} style={{ margin: 0 }}>Flows</Title>}
        extra={
          <Button 
            type="primary" 
            icon={<PlusOutlined />}
            onClick={() => setModalVisible(true)}
          >
            New Flow
          </Button>
        }
      >
        <Table
          dataSource={flows}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
        />
      </Card>

      <Modal
        title="Create New Flow"
        open={modalVisible}
        onOk={createFlow}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="Flow Name"
            rules={[{ required: true, message: 'Please enter flow name' }]}
          >
            <Input placeholder="My Flow" />
          </Form.Item>
        </Form>
      </Modal>

      <FlowDebugModal
        open={debugModalVisible}
        onClose={() => setDebugModalVisible(false)}
        flow={debugFlowTarget}
        requests={requests}
        selectedRequestId={selectedRequestId}
        onChangeRequest={setSelectedRequestId}
        result={debugResult}
        onRun={runFlowDebug}
      />
    </div>
  );
};

const FlowDebugModal: React.FC<{
  open: boolean;
  onClose: () => void;
  flow: FlowDefinition | null;
  requests: RequestRecord[];
  selectedRequestId: string;
  onChangeRequest: (id: string) => void;
  result: FlowDebugResult | null;
  onRun: () => void;
}> = ({ open, onClose, flow, requests, selectedRequestId, onChangeRequest, result, onRun }) => {
  if (!flow) return null;

  const formatBody = (body?: string, contentType?: string) => {
    if (!body) return <Text type="secondary">No body</Text>;
    if (contentType?.includes('application/json')) {
      try {
        const parsed = JSON.parse(body);
        return <pre className="code-block json-body">{JSON.stringify(parsed, null, 2)}</pre>;
      } catch {
        // fall through
      }
    }
    if (contentType?.includes('xml')) {
      return <pre className="code-block xml-body">{body}</pre>;
    }
    return <pre className="code-block plain-body">{body}</pre>;
  };

  const renderRequestView = (req?: HttpRequest) => {
    if (!req) return <Text type="secondary">No request</Text>;
    const ct = req.headers['content-type'] || req.headers['Content-Type'];
    return (
      <>
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="Method">{req.method}</Descriptions.Item>
          <Descriptions.Item label="URL">{req.url}</Descriptions.Item>
        </Descriptions>
        <Collapse defaultActiveKey={[]} style={{ marginTop: 8 }}>
          <Panel header="Headers" key="headers">
            <Descriptions column={1} size="small" bordered>
              {Object.entries(req.headers).map(([key, value]) => (
                <Descriptions.Item key={key} label={key}>
                  {value}
                </Descriptions.Item>
              ))}
            </Descriptions>
          </Panel>
        </Collapse>
        <Title level={5} style={{ marginTop: 8 }}>Body</Title>
        {formatBody(req.body, typeof ct === 'string' ? ct : undefined)}
      </>
    );
  };

  const renderResponseView = (res?: HttpResponse) => {
    if (!res) return <Text type="secondary">No response</Text>;
    const ct = res.headers['content-type'] || res.headers['Content-Type'];
    return (
      <>
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="Status">
            <Tag color={res.statusCode < 400 ? 'green' : 'red'}>
              {res.statusCode} {res.statusMessage}
            </Tag>
          </Descriptions.Item>
        </Descriptions>
        <Collapse defaultActiveKey={[]} style={{ marginTop: 8 }}>
          <Panel header="Headers" key="headers">
            <Descriptions column={1} size="small" bordered>
              {Object.entries(res.headers).map(([key, value]) => (
                <Descriptions.Item key={key} label={key}>
                  {value}
                </Descriptions.Item>
              ))}
            </Descriptions>
          </Panel>
        </Collapse>
        <Title level={5} style={{ marginTop: 8 }}>Body</Title>
        {formatBody(res.body, typeof ct === 'string' ? ct : undefined)}
      </>
    );
  };

  return (
    <Modal
      title={`Debug Flow: ${flow.name}`}
      open={open}
      onCancel={onClose}
      width={900}
      footer={
        <Button type="primary" onClick={onRun}>Run Debug</Button>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <Card size="small" title="Select Sample Request">
          <Select
            style={{ width: '100%' }}
            placeholder="Select a request"
            value={selectedRequestId || undefined}
            onChange={onChangeRequest}
            showSearch
            optionFilterProp="children"
          >
            {requests.slice(0, 100).map(r => (
              <Select.Option key={r.id} value={r.id}>
                {r.request.method} {r.request.url}
              </Select.Option>
            ))}
          </Select>
        </Card>

        {result && (
          <Card
            size="small"
            title={
              <Space>
                Result
                <Tag color={result.success ? 'green' : 'red'}>
                  {result.success ? 'Success' : 'Failed'}
                </Tag>
              </Space>
            }
          >
            {result.errorMessage && <Text type="danger">{result.errorMessage}</Text>}
            {result.logs.length > 0 && (
              <div>
                <Text strong>Logs:</Text>
                <pre className="code-block">{result.logs.join('\n')}</pre>
              </div>
            )}
            <Tabs
              items={[
                { key: 'before-req', label: 'Before - Request', children: renderRequestView(result.before.request) },
                { key: 'before-res', label: 'Before - Response', children: renderResponseView(result.before.response) },
                { key: 'after-req', label: 'After - Request', children: renderRequestView(result.after.request) },
                { key: 'after-res', label: 'After - Response', children: renderResponseView(result.after.response) },
              ]}
            />
          </Card>
        )}
      </Space>
    </Modal>
  );
};

export default Flows;
