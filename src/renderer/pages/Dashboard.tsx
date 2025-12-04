import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Typography, Space, Alert, Switch, Tag } from 'antd';
import { 
  SwapOutlined, 
  ApartmentOutlined, 
  AppstoreOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined 
} from '@ant-design/icons';
import { ProxyStatus, FlowDefinition, ComponentDefinition, AppConfig, SystemProxyStatus } from '../../shared/models';

const { Title, Paragraph } = Typography;

const Dashboard: React.FC = () => {
  const [status, setStatus] = useState<ProxyStatus>({
    running: false,
    port: 8888,
    requestCount: 0,
  });
  const [flows, setFlows] = useState<FlowDefinition[]>([]);
  const [components, setComponents] = useState<ComponentDefinition[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [systemProxyStatus, setSystemProxyStatus] = useState<SystemProxyStatus | null>(null);

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
      const [s, f, c, cfg, sp] = await Promise.all([
        window.electronAPI.proxyStatus(),
        window.electronAPI.getFlows(),
        window.electronAPI.getComponents(),
        window.electronAPI.getConfig(),
        window.electronAPI.systemProxyStatus(),
      ]);
      setStatus(s);
      setFlows(f);
      setComponents(c);
      setConfig(cfg);
      if (sp) setSystemProxyStatus(sp);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  };

  const enabledFlows = flows.filter(f => f.enabled).length;

  const toggleHttpsMitm = async (checked: boolean) => {
    try {
      await window.electronAPI.saveConfig({ httpsMitmEnabled: checked });
      setConfig(prev => prev ? { ...prev, httpsMitmEnabled: checked } : prev);
    } catch (error) {
      console.error('Failed to toggle HTTPS decryption:', error);
    }
  };

  const toggleSystemProxy = async (checked: boolean) => {
    try {
      await window.electronAPI.saveConfig({ systemProxyEnabled: checked });
      const sp = await window.electronAPI.systemProxyStatus();
      if (sp) setSystemProxyStatus(sp);
      setConfig(prev => prev ? { ...prev, systemProxyEnabled: checked } : prev);
    } catch (error) {
      console.error('Failed to toggle system proxy:', error);
    }
  };

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

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card title="HTTPS Decryption">
            <Space direction="vertical">
              <Space align="center">
                <Switch
                  checked={!!config?.httpsMitmEnabled}
                  onChange={toggleHttpsMitm}
                />
                <Paragraph style={{ margin: 0 }}>
                  {config?.httpsMitmEnabled ? 'Enabled' : 'Disabled'}
                </Paragraph>
              </Space>
              <Paragraph type="secondary" style={{ margin: 0 }}>
                Requires trusted Root CA. Manage certificates in Settings → HTTPS Certificate.
              </Paragraph>
            </Space>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="System Proxy">
            <Space direction="vertical">
              <Space align="center">
                <Switch
                  checked={!!config?.systemProxyEnabled}
                  onChange={toggleSystemProxy}
                />
                <Paragraph style={{ margin: 0 }}>
                  {config?.systemProxyEnabled ? 'Enabled' : 'Disabled'}
                </Paragraph>
                {systemProxyStatus && (
                  systemProxyStatus.matchesConfig ? (
                    <Tag color="green">OK</Tag>
                  ) : systemProxyStatus.enabled ? (
                    <Tag color="orange">Mismatch</Tag>
                  ) : (
                    <Tag color="default">Off</Tag>
                  )
                )}
              </Space>
              {systemProxyStatus && (
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  {systemProxyStatus.enabled
                    ? `Effective: ${systemProxyStatus.effectiveHost || 'unknown'}:${systemProxyStatus.effectivePort || ''}`
                    : 'No system HTTP/HTTPS proxy configured'}
                </Paragraph>
              )}
            </Space>
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
