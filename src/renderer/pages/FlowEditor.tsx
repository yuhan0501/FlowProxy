import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  MarkerType,
  NodeTypes,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { 
  Card, Button, Space, Typography, message, Drawer, Form, 
  Input, Select, Switch, Divider, Tag, Modal, Collapse, Descriptions, Tabs 
} from 'antd';
import { SaveOutlined, ArrowLeftOutlined, PlusOutlined, BugOutlined } from '@ant-design/icons';
import { FlowDefinition, FlowNode, ComponentDefinition, RequestRecord, FlowDebugResult, HttpRequest, HttpResponse } from '../../shared/models';
import { v4 as uuidv4 } from 'uuid';
import { useI18n } from '../i18n';

const { Title, Text } = Typography;
const { Option } = Select;
const { Panel } = Collapse;

// Custom Node Components
const EntryNodeComponent: React.FC<{ data: any }> = ({ data }) => (
  <div style={{ 
    padding: '10px 20px', 
    background: '#1890ff', 
    borderRadius: '8px',
    color: '#fff',
    minWidth: '120px',
    textAlign: 'center'
  }}>
    <div style={{ fontWeight: 'bold' }}>{data.label}</div>
    <div style={{ fontSize: '10px', opacity: 0.8 }}>
      {data.match?.methods?.join(', ') || 'All methods'}
    </div>
    <Handle type="source" position={Position.Right} />
  </div>
);

const ComponentNodeComponent: React.FC<{ data: any }> = ({ data }) => (
  <div style={{ 
    padding: '10px 20px', 
    background: '#52c41a', 
    borderRadius: '8px',
    color: '#fff',
    minWidth: '120px',
    textAlign: 'center'
  }}>
    <Handle type="target" position={Position.Left} />
    <div style={{ fontWeight: 'bold' }}>{data.label}</div>
    <div style={{ fontSize: '10px', opacity: 0.8 }}>{data.componentName}</div>
    <Handle type="source" position={Position.Right} />
  </div>
);

const ConditionNodeComponent: React.FC<{ data: any }> = ({ data }) => (
  <div style={{ 
    padding: '10px 20px', 
    background: '#faad14', 
    borderRadius: '8px',
    color: '#fff',
    minWidth: '120px',
    textAlign: 'center'
  }}>
    <Handle type="target" position={Position.Left} />
    <div style={{ fontWeight: 'bold' }}>{data.label}</div>
    <div style={{ fontSize: '10px', opacity: 0.8 }}>Condition</div>
    <Handle type="source" position={Position.Right} id="true" style={{ top: '30%' }} />
    <Handle type="source" position={Position.Right} id="false" style={{ top: '70%' }} />
  </div>
);

const TerminatorNodeComponent: React.FC<{ data: any }> = ({ data }) => (
  <div style={{ 
    padding: '10px 20px', 
    background: data.mode === 'pass_through' ? '#722ed1' : '#f5222d', 
    borderRadius: '8px',
    color: '#fff',
    minWidth: '120px',
    textAlign: 'center'
  }}>
    <Handle type="target" position={Position.Left} />
    <div style={{ fontWeight: 'bold' }}>{data.label}</div>
    <div style={{ fontSize: '10px', opacity: 0.8 }}>
      {data.mode === 'pass_through' ? 'Pass Through' : 'End Response'}
    </div>
  </div>
);

const nodeTypes: NodeTypes = {
  entry: EntryNodeComponent,
  component: ComponentNodeComponent,
  condition: ConditionNodeComponent,
  terminator: TerminatorNodeComponent,
};

const FlowEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [flow, setFlow] = useState<FlowDefinition | null>(null);
  const [components, setComponents] = useState<ComponentDefinition[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [form] = Form.useForm();
  const watchedComponentId = Form.useWatch('componentId', form);

  // Flow 调试相关状态
  const [debugModalVisible, setDebugModalVisible] = useState(false);
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string>('');
  const [debugResult, setDebugResult] = useState<FlowDebugResult | null>(null);

  useEffect(() => {
    loadFlow();
    loadComponents();
  }, [id]);

  const loadFlow = async () => {
    try {
      const flows = await window.electronAPI.getFlows();
      const found = flows.find((f: FlowDefinition) => f.id === id);
      if (found) {
        setFlow(found);
        convertFlowToReactFlow(found);
      }
    } catch (error) {
      console.error('Failed to load flow:', error);
    }
  };

  const loadComponents = async () => {
    try {
      const data = await window.electronAPI.getComponents();
      setComponents(data);
    } catch (error) {
      console.error('Failed to load components:', error);
    }
  };

  const convertFlowToReactFlow = (flowDef: FlowDefinition) => {
    const rfNodes: Node[] = flowDef.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: {
        label: node.name,
        ...node,
        componentName: node.type === 'component' 
          ? components.find(c => c.id === (node as any).componentId)?.name 
          : undefined,
      },
    }));

    const rfEdges: Edge[] = flowDef.edges.map((edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      label: edge.conditionLabel,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: '#555' },
    }));

    setNodes(rfNodes);
    setEdges(rfEdges);
  };

  const onConnect = useCallback((connection: Connection) => {
    const sourceNode = nodes.find((n) => n.id === connection.source);
    const targetNode = nodes.find((n) => n.id === connection.target);

    if (!sourceNode || !targetNode) {
      return;
    }

    const outgoingFromSource = edges.filter((e) => e.source === sourceNode.id);
    const incomingToTarget = edges.filter((e) => e.target === targetNode.id);

    // 规则：Entry 只能有一个下游
    if (sourceNode.type === 'entry' && outgoingFromSource.length >= 1) {
      message.warning(t('flowEditor.connect.entry.oneChild'));
      return;
    }

    // 规则：Component 只能有一个上游和一个下游
    if (sourceNode.type === 'component' && outgoingFromSource.length >= 1) {
      message.warning(t('flowEditor.connect.component.singleDownstream'));
      return;
    }
    if (targetNode.type === 'component' && incomingToTarget.length >= 1) {
      message.warning(t('flowEditor.connect.component.singleUpstream'));
      return;
    }

    // 规则：Terminator 不允许作为 source（没有下游）
    if (sourceNode.type === 'terminator') {
      message.warning(t('flowEditor.connect.terminator.noDownstream'));
      return;
    }

    // Condition 节点下游可以有多个，这里不限制 outgoing

    setEdges((eds) => addEdge({
      ...connection,
      id: uuidv4(),
      label:
        connection.sourceHandle === 'true' || connection.sourceHandle === 'false'
          ? connection.sourceHandle
          : undefined,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: '#555' },
    }, eds));
  }, [nodes, edges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    form.setFieldsValue({
      name: node.data.label,
      ...node.data,
    });
    setDrawerVisible(true);
  }, [form]);

  const saveFlow = async () => {
    if (!flow) return;

    const updatedNodes: FlowNode[] = nodes.map((node) => {
      const baseNode = {
        id: node.id,
        type: node.type as any,
        name: node.data.label,
        position: node.position,
      };

      switch (node.type) {
        case 'entry':
          return { ...baseNode, type: 'entry' as const, match: node.data.match || {} };
        case 'component':
          return { 
            ...baseNode, 
            type: 'component' as const,
            componentId: node.data.componentId,
            config: node.data.config || {},
          };
        case 'condition':
          return { 
            ...baseNode, 
            type: 'condition' as const,
            expression: node.data.expression || '',
          };
        case 'terminator':
          return { 
            ...baseNode, 
            type: 'terminator' as const,
            mode: node.data.mode || 'pass_through',
          };
        default:
          return baseNode as FlowNode;
      }
    });

    const updatedEdges = edges.map((edge) => ({
      id: edge.id,
      from: edge.source,
      to: edge.target,
      conditionLabel: edge.label as string | undefined,
    }));

    const updatedFlow: FlowDefinition = {
      ...flow,
      nodes: updatedNodes,
      edges: updatedEdges,
      updatedAt: Date.now(),
    };

    try {
      await window.electronAPI.saveFlow(updatedFlow);
      message.success(t('flowEditor.save.success'));
    } catch (error) {
      message.error(t('flowEditor.save.failed'));
    }
  };

  const addNode = (type: string) => {
    const newNode: Node = {
      id: uuidv4(),
      type,
      position: { x: 250, y: 250 },
      data: {
        label: type === 'entry' ? 'Entry' : 
               type === 'component' ? 'Component' :
               type === 'condition' ? 'Condition' : 'Terminator',
        match: type === 'entry' ? { methods: ['GET', 'POST'], hostPatterns: ['*'] } : undefined,
        mode: type === 'terminator' ? 'pass_through' : undefined,
      },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const updateNode = () => {
    if (!selectedNode) return;
    const values = form.getFieldsValue();
    
    setNodes((nds) => nds.map((node) => {
      if (node.id === selectedNode.id) {
        return {
          ...node,
          data: {
            ...node.data,
            label: values.name,
            match: values.match,
            componentId: values.componentId,
            config: values.config,
            expression: values.expression,
            mode: values.mode,
          },
        };
      }
      return node;
    }));
    
    setDrawerVisible(false);
    message.success(t('flowEditor.nodeUpdated'));
  };

  const deleteSelectedNode = () => {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setDrawerVisible(false);
    setSelectedNode(null);
  };

  // 调试 Flow：加载请求列表
  const loadRequestsForDebug = async () => {
    try {
      const data = await window.electronAPI.getRequests();
      setRequests(data);
    } catch (error) {
      console.error('Failed to load requests for flow debug:', error);
    }
  };

  const openDebugModal = async () => {
    if (!flow) return;
    // 先保存当前 Flow，确保调试使用最新配置
    await saveFlow();
    setDebugResult(null);
    setSelectedRequestId('');
    await loadRequestsForDebug();
    setDebugModalVisible(true);
  };

  const runFlowDebug = async () => {
    if (!flow || !selectedRequestId) {
      message.warning('Please select a request');
      return;
    }
    try {
      const result = await window.electronAPI.debugFlow({
        flowId: flow.id,
        requestRecordId: selectedRequestId,
      });
      setDebugResult(result);
    } catch (error) {
      console.error('Flow debug failed:', error);
      message.error('Flow debug failed');
    }
  };

  if (!flow) {
    return <div>{t('flowEditor.load.loading')}</div>;
  }

  return (
    <div style={{ height: 'calc(100vh - 112px)', display: 'flex', flexDirection: 'column' }}>
      <Card 
        size="small"
        style={{ marginBottom: '8px' }}
        bodyStyle={{ padding: '8px 16px' }}
      >
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/flows')}>
              {t('flowEditor.back')}
            </Button>
            <Title level={5} style={{ margin: 0 }}>{flow.name}</Title>
            <Tag color={flow.enabled ? 'green' : 'default'}>
              {flow.enabled ? t('flowEditor.enabled') : t('flowEditor.disabled')}
            </Tag>
          </Space>
          <Space>
            <Select 
              placeholder={t('flowEditor.addNode.placeholder')} 
              style={{ width: 150 }}
              onChange={(v) => { if (v) addNode(v); }}
              value={undefined as string | undefined}
            >
              <Option value="component">{t('flowEditor.addNode.component')}</Option>
              <Option value="condition">{t('flowEditor.addNode.condition')}</Option>
              <Option value="terminator">{t('flowEditor.addNode.terminator')}</Option>
            </Select>
            <Button icon={<BugOutlined />} onClick={openDebugModal}>
              {t('flowEditor.btn.debug')}
            </Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={saveFlow}>
              {t('flowEditor.btn.save')}
            </Button>
          </Space>
        </Space>
      </Card>

      <div style={{ flex: 1, background: '#1a1a1a', borderRadius: '8px' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onEdgeClick={(_, edge) => {
            Modal.confirm({
              title: t('flowEditor.edge.delete.confirm.title'),
              content: t('flowEditor.edge.delete.confirm.content'),
              okText: t('flowEditor.edge.delete.confirm.ok'),
              okButtonProps: { danger: true },
              onOk: () => setEdges((eds) => eds.filter((e) => e.id !== edge.id)),
            });
          }}
          nodeTypes={nodeTypes}
          fitView
        >
          <Controls />
          <Background color="#333" gap={16} />
        </ReactFlow>
      </div>

      <Drawer
        title={t('flowEditor.drawer.title')}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        width={400}
        extra={
          <Space>
            <Button danger onClick={deleteSelectedNode}>
              {t('flowEditor.drawer.btn.delete')}
            </Button>
            <Button type="primary" onClick={updateNode}>
              {t('flowEditor.drawer.btn.save')}
            </Button>
          </Space>
        }
      >
        {selectedNode && (
          <Form form={form} layout="vertical">
            <Form.Item name="name" label={t('flowEditor.drawer.field.name')}>
              <Input />
            </Form.Item>

            {selectedNode.type === 'entry' && (
              <>
                <Form.Item name={['match', 'methods']} label={t('flowEditor.drawer.entry.methods')}>
                  <Select mode="multiple">
                    {['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'].map(m => (
                      <Option key={m} value={m}>{m}</Option>
                    ))}
                  </Select>
                </Form.Item>
                <Form.Item name={['match', 'hostPatterns']} label={t('flowEditor.drawer.entry.hostPatterns')}>
                  <Select mode="tags" placeholder="e.g., *.example.com" />
                </Form.Item>
                <Form.Item name={['match', 'pathPatterns']} label={t('flowEditor.drawer.entry.pathPatterns')}>
                  <Select mode="tags" placeholder="e.g., /api/*" />
                </Form.Item>
              </>
            )}

            {selectedNode.type === 'component' && (
              <>
                <Form.Item name="componentId" label={t('flowEditor.drawer.component')}>
                  <Select>
                    {components.map(c => (
                      <Option key={c.id} value={c.id}>{c.name}</Option>
                    ))}
                  </Select>
                </Form.Item>
                {(() => {
                  const currentComponentId = watchedComponentId || selectedNode.data.componentId;
                  const compDef = components.find(c => c.id === currentComponentId);
                  if (compDef && compDef.params && compDef.params.length > 0) {
                    return (
                      <>
                        {compDef.params.map((p) => (
                          <Form.Item
                            key={p.name}
                            name={['config', p.name]}
                            label={p.label || p.name}
                            rules={p.required ? [{ required: true, message: `${p.label || p.name} is required` }] : []}
                          >
                            {p.type === 'boolean' ? (
                              <Switch />
                            ) : (
                              <Input placeholder={p.description} />
                            )}
                          </Form.Item>
                        ))}
                      </>
                    );
                  }
                  // 默认回退到 JSON 配置
                  return (
                    <Form.Item name={['config']} label={t('flowEditor.drawer.component.configJson')}>
                      <Input.TextArea rows={6} placeholder='{"key": "value"}' />
                    </Form.Item>
                  );
                })()}
              </>
            )}

            {selectedNode.type === 'condition' && (
              <Form.Item
                name="expression"
                label={t('flowEditor.drawer.condition.expression')}
              >
                <Input.TextArea 
                  rows={3} 
                  placeholder='ctx.request.method === "POST"' 
                />
              </Form.Item>
            )}

            {selectedNode.type === 'terminator' && (
              <Form.Item name="mode" label={t('flowEditor.drawer.terminator.mode')}>
                <Select>
                  <Option value="pass_through">
                    {t('flowEditor.drawer.terminator.passThrough')}
                  </Option>
                  <Option value="end_with_response">
                    {t('flowEditor.drawer.terminator.endWithResponse')}
                  </Option>
                </Select>
              </Form.Item>
            )}
          </Form>
        )}
      </Drawer>

      <FlowDebugModal
        open={debugModalVisible}
        onClose={() => setDebugModalVisible(false)}
        flow={flow}
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

export default FlowEditor;
