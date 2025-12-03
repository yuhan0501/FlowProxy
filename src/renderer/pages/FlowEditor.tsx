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
  Input, Select, Switch, Divider, Tag 
} from 'antd';
import { SaveOutlined, ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons';
import { FlowDefinition, FlowNode, ComponentDefinition } from '../../shared/models';
import { v4 as uuidv4 } from 'uuid';

const { Title, Text } = Typography;
const { Option } = Select;

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
  const [flow, setFlow] = useState<FlowDefinition | null>(null);
  const [components, setComponents] = useState<ComponentDefinition[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [form] = Form.useForm();

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
    setEdges((eds) => addEdge({
      ...connection,
      id: uuidv4(),
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: '#555' },
    }, eds));
  }, []);

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
      message.success('Flow saved');
    } catch (error) {
      message.error('Failed to save flow');
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
    message.success('Node updated');
  };

  const deleteSelectedNode = () => {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setDrawerVisible(false);
    setSelectedNode(null);
  };

  if (!flow) {
    return <div>Loading...</div>;
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
              Back
            </Button>
            <Title level={5} style={{ margin: 0 }}>{flow.name}</Title>
            <Tag color={flow.enabled ? 'green' : 'default'}>
              {flow.enabled ? 'Enabled' : 'Disabled'}
            </Tag>
          </Space>
          <Space>
            <Select 
              placeholder="Add Node" 
              style={{ width: 150 }}
              onChange={(v) => { if (v) addNode(v); }}
              value={undefined as string | undefined}
            >
              <Option value="component">Component</Option>
              <Option value="condition">Condition</Option>
              <Option value="terminator">Terminator</Option>
            </Select>
            <Button type="primary" icon={<SaveOutlined />} onClick={saveFlow}>
              Save
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
          nodeTypes={nodeTypes}
          fitView
        >
          <Controls />
          <Background color="#333" gap={16} />
        </ReactFlow>
      </div>

      <Drawer
        title="Edit Node"
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        width={400}
        extra={
          <Space>
            <Button danger onClick={deleteSelectedNode}>Delete</Button>
            <Button type="primary" onClick={updateNode}>Save</Button>
          </Space>
        }
      >
        {selectedNode && (
          <Form form={form} layout="vertical">
            <Form.Item name="name" label="Name">
              <Input />
            </Form.Item>

            {selectedNode.type === 'entry' && (
              <>
                <Form.Item name={['match', 'methods']} label="Methods">
                  <Select mode="multiple">
                    {['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'].map(m => (
                      <Option key={m} value={m}>{m}</Option>
                    ))}
                  </Select>
                </Form.Item>
                <Form.Item name={['match', 'hostPatterns']} label="Host Patterns">
                  <Select mode="tags" placeholder="e.g., *.example.com" />
                </Form.Item>
                <Form.Item name={['match', 'pathPatterns']} label="Path Patterns">
                  <Select mode="tags" placeholder="e.g., /api/*" />
                </Form.Item>
              </>
            )}

            {selectedNode.type === 'component' && (
              <>
                <Form.Item name="componentId" label="Component">
                  <Select>
                    {components.map(c => (
                      <Option key={c.id} value={c.id}>{c.name}</Option>
                    ))}
                  </Select>
                </Form.Item>
                <Form.Item name={['config']} label="Config (JSON)">
                  <Input.TextArea rows={6} placeholder='{"key": "value"}' />
                </Form.Item>
              </>
            )}

            {selectedNode.type === 'condition' && (
              <Form.Item name="expression" label="Expression">
                <Input.TextArea 
                  rows={3} 
                  placeholder='ctx.request.method === "POST"' 
                />
              </Form.Item>
            )}

            {selectedNode.type === 'terminator' && (
              <Form.Item name="mode" label="Mode">
                <Select>
                  <Option value="pass_through">Pass Through</Option>
                  <Option value="end_with_response">End with Response</Option>
                </Select>
              </Form.Item>
            )}
          </Form>
        )}
      </Drawer>
    </div>
  );
};

export default FlowEditor;
