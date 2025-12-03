import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Typography, Space, Button, Alert } from 'antd';
import { 
  SwapOutlined, 
  ApartmentOutlined, 
  AppstoreOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined 
} from '@ant-design/icons';
import { ProxyStatus, FlowDefinition, ComponentDefinition } from '../../shared/models';

const { Title, Paragraph } = Typography;

const Dashboard: React.FC = () => {
  const [status, setStatus] = useState<ProxyStatus>({
    running: false,
    port: 8888,
    requestCount: 0,
  });
  const [flows, setFlows] = useState<FlowDefinition[]>([]);
  const [components, setComponents] = useState<ComponentDefinition[]>([]);

  useEffect(() => {
    loadData();

    // 周期性刷新，确保状态和请求总数与后端保持一致
    const interval = setInterval(loadData, 3000);

    // 监听新请求事件，尽量做到实时更新 Total Requests
    const unsubscribe = window.electronAPI.onNewRequest(() => {
      setStatus(prev => ({ ...prev, requestCount: prev.requestCount + 1 }));
    });

    return () => {
      clearInterval(interval);
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const loadData = async () => {
    try {
      const [s, f, c] = await Promise.all([
        window.electronAPI.proxyStatus(),
        window.electronAPI.getFlows(),
        window.electronAPI.getComponents(),
      ]);
      setStatus(s);
      setFlows(f);
      setComponents(c);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  };

  const enabledFlows = flows.filter(f => f.enabled).length;

  return (
    <div style={{ padding: '8px' }}>
      <Title level={4} style={{ marginBottom: '24px' }}>Dashboard</Title>
      
      <Alert
        message="Quick Start"
        description={
          <Space direction="vertical">
            <Paragraph style={{ margin: 0 }}>
              1. Click "Start" in the header to start the proxy server
            </Paragraph>
            <Paragraph style={{ margin: 0 }}>
              2. Configure your system or browser to use HTTP proxy at <strong>127.0.0.1:{status.port}</strong>
            </Paragraph>
            <Paragraph style={{ margin: 0 }}>
              3. Browse the web and watch requests appear in the "Requests" tab
            </Paragraph>
          </Space>
        }
        type="info"
        showIcon
        style={{ marginBottom: '24px' }}
      />

      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Proxy Status"
              value={status.running ? 'Running' : 'Stopped'}
              prefix={status.running ? 
                <CheckCircleOutlined style={{ color: '#52c41a' }} /> : 
                <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
              }
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Requests"
              value={status.requestCount}
              prefix={<SwapOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Active Flows"
              value={enabledFlows}
              suffix={`/ ${flows.length}`}
              prefix={<ApartmentOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Components"
              value={components.length}
              prefix={<AppstoreOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Proxy Configuration" style={{ marginTop: '24px' }}>
        <Row gutter={[16, 16]}>
          <Col span={12}>
            <Statistic title="Proxy Address" value={`127.0.0.1:${status.port}`} />
          </Col>
          <Col span={12}>
            <Statistic title="Protocol" value="HTTP / HTTPS (Tunnel)" />
          </Col>
        </Row>
      </Card>
    </div>
  );
};

export default Dashboard;
