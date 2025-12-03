import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Card, Table, Button, Space, Switch, Typography, Modal, 
  Form, Input, message, Popconfirm, Tag 
} from 'antd';
import { 
  PlusOutlined, EditOutlined, DeleteOutlined, CopyOutlined 
} from '@ant-design/icons';
import { FlowDefinition } from '../../shared/models';
import { v4 as uuidv4 } from 'uuid';

const { Title, Text } = Typography;

const Flows: React.FC = () => {
  const navigate = useNavigate();
  const [flows, setFlows] = useState<FlowDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();

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
      width: 150,
      render: (_: any, record: FlowDefinition) => (
        <Space>
          <Button 
            icon={<EditOutlined />} 
            size="small"
            onClick={() => navigate(`/flows/${record.id}`)}
          />
          <Button 
            icon={<CopyOutlined />} 
            size="small"
            onClick={() => duplicateFlow(record)}
          />
          <Popconfirm
            title="Delete this flow?"
            onConfirm={() => deleteFlow(record.id)}
          >
            <Button icon={<DeleteOutlined />} size="small" danger />
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
    </div>
  );
};

export default Flows;
