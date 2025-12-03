import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Typography, Modal, Form, Input, message, Popconfirm, Tag, Tabs, Select } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, BugOutlined } from '@ant-design/icons';
import { ComponentDefinition, RequestRecord, ComponentDebugResult } from '../../shared/models';
import { v4 as uuidv4 } from 'uuid';

const { Title, Text } = Typography;

const Components: React.FC = () => {
  const [components, setComponents] = useState<ComponentDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [debugModalVisible, setDebugModalVisible] = useState(false);
  const [editingComponent, setEditingComponent] = useState<ComponentDefinition | null>(null);
  const [debugComponent, setDebugComponent] = useState<ComponentDefinition | null>(null);
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string>('');
  const [debugResult, setDebugResult] = useState<ComponentDebugResult | null>(null);
  const [debugConfig, setDebugConfig] = useState('{}');
  const [form] = Form.useForm();

  useEffect(() => { loadComponents(); }, []);

  const loadComponents = async () => {
    setLoading(true);
    try { setComponents(await window.electronAPI.getComponents()); }
    catch (error) { console.error('Failed to load components:', error); }
    finally { setLoading(false); }
  };

  const loadRequests = async () => {
    try { setRequests(await window.electronAPI.getRequests()); }
    catch (error) { console.error('Failed to load requests:', error); }
  };

  const openEditModal = (component?: ComponentDefinition) => {
    if (component) {
      setEditingComponent(component);
      form.setFieldsValue({ name: component.name, description: component.description, scriptCode: component.scriptCode });
    } else {
      setEditingComponent(null);
      form.resetFields();
      form.setFieldsValue({ scriptCode: `// Component script\n// Access request via ctx.request\n// Return modified request/response\n\nfunction run(config, ctx) {\n  ctx.log('Component executed');\n  return { request: ctx.request };\n}` });
    }
    setEditModalVisible(true);
  };

  const saveComponent = async () => {
    try {
      const values = await form.validateFields();
      const component: ComponentDefinition = {
        id: editingComponent?.id || uuidv4(),
        name: values.name,
        type: 'script',
        description: values.description,
        scriptCode: values.scriptCode,
      };
      await window.electronAPI.saveComponent(component);
      message.success('Component saved');
      setEditModalVisible(false);
      loadComponents();
    } catch (error) { console.error('Failed to save component:', error); }
  };

  const deleteComponent = async (id: string) => {
    try {
      await window.electronAPI.deleteComponent(id);
      message.success('Component deleted');
      loadComponents();
    } catch (error) { message.error('Cannot delete builtin component'); }
  };

  const openDebugModal = (component: ComponentDefinition) => {
    setDebugComponent(component);
    setDebugResult(null);
    setDebugConfig(JSON.stringify(component.schema?.default || {}, null, 2));
    loadRequests();
    setDebugModalVisible(true);
  };

  const runDebug = async () => {
    if (!debugComponent || !selectedRequestId) { message.warning('Please select a request'); return; }
    try {
      let config = {};
      try { config = JSON.parse(debugConfig); } catch {}
      const result = await window.electronAPI.debugComponent({
        componentId: debugComponent.id,
        componentConfig: config,
        requestRecordId: selectedRequestId,
      });
      setDebugResult(result);
    } catch (error) { message.error('Debug failed'); }
  };

  const columns = [
    { title: 'Name', dataIndex: 'name', render: (name: string, record: ComponentDefinition) => (
      <Space><Text>{name}</Text>{record.type === 'builtin' && <Tag color="blue">Builtin</Tag>}</Space>
    )},
    { title: 'Type', dataIndex: 'type', width: 100, render: (type: string) => <Tag>{type}</Tag> },
    { title: 'Description', dataIndex: 'description', ellipsis: true },
    { title: 'Actions', width: 150, render: (_: any, record: ComponentDefinition) => (
      <Space>
        <Button icon={<BugOutlined />} size="small" onClick={() => openDebugModal(record)}>Debug</Button>
        {record.type === 'script' && (
          <>
            <Button icon={<EditOutlined />} size="small" onClick={() => openEditModal(record)} />
            <Popconfirm title="Delete?" onConfirm={() => deleteComponent(record.id)}>
              <Button icon={<DeleteOutlined />} size="small" danger />
            </Popconfirm>
          </>
        )}
      </Space>
    )},
  ];

  return (
    <div style={{ padding: '8px' }}>
      <Card title={<Title level={4} style={{ margin: 0 }}>Components</Title>}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openEditModal()}>New Component</Button>}>
        <Table dataSource={components} columns={columns} rowKey="id" loading={loading} pagination={false} />
      </Card>

      <Modal title={editingComponent ? 'Edit Component' : 'New Component'} open={editModalVisible} onOk={saveComponent}
        onCancel={() => setEditModalVisible(false)} width={800}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="scriptCode" label="Script Code" rules={[{ required: true }]}>
            <Input.TextArea
              rows={12}
              value={form.getFieldValue('scriptCode')}
              onChange={(e) => form.setFieldsValue({ scriptCode: e.target.value })}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={`Debug: ${debugComponent?.name}`} open={debugModalVisible} onCancel={() => setDebugModalVisible(false)}
        width={900} footer={<Button type="primary" onClick={runDebug}>Run Debug</Button>}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Card size="small" title="Select Sample Request">
            <Select style={{ width: '100%' }} placeholder="Select a request" value={selectedRequestId || undefined}
              onChange={setSelectedRequestId} showSearch optionFilterProp="children">
              {requests.slice(0, 100).map(r => (
                <Select.Option key={r.id} value={r.id}>{r.request.method} {r.request.url}</Select.Option>
              ))}
            </Select>
          </Card>
          <Card size="small" title="Component Config">
            <Input.TextArea rows={3} value={debugConfig} onChange={e => setDebugConfig(e.target.value)} />
          </Card>
          {debugResult && (
            <Card size="small" title={<Space>Result <Tag color={debugResult.success ? 'green' : 'red'}>{debugResult.success ? 'Success' : 'Failed'}</Tag></Space>}>
              {debugResult.errorMessage && <Text type="danger">{debugResult.errorMessage}</Text>}
              {debugResult.logs.length > 0 && (
                <div><Text strong>Logs:</Text><pre className="code-block">{debugResult.logs.join('\n')}</pre></div>
              )}
              <Tabs items={[
                { key: 'before', label: 'Before', children: <pre className="code-block">{JSON.stringify(debugResult.before, null, 2)}</pre> },
                { key: 'after', label: 'After', children: <pre className="code-block">{JSON.stringify(debugResult.after, null, 2)}</pre> },
              ]} />
            </Card>
          )}
        </Space>
      </Modal>
    </div>
  );
};

export default Components;
