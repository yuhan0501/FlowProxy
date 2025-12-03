import React, { useState, useEffect } from 'react';
import { Layout, Button, Space, Tag, Typography } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined } from '@ant-design/icons';
import { ProxyStatus } from '../../shared/models';

const { Header: AntHeader } = Layout;
const { Text } = Typography;

const Header: React.FC = () => {
  const [status, setStatus] = useState<ProxyStatus>({
    running: false,
    port: 8888,
    requestCount: 0,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  const loadStatus = async () => {
    try {
      const s = await window.electronAPI.proxyStatus();
      setStatus(s);
    } catch (error) {
      console.error('Failed to get proxy status:', error);
    }
  };

  const toggleProxy = async () => {
    setLoading(true);
    try {
      if (status.running) {
        await window.electronAPI.proxyStop();
      } else {
        await window.electronAPI.proxyStart();
      }
      await loadStatus();
    } catch (error) {
      console.error('Failed to toggle proxy:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AntHeader 
      className="drag-region"
      style={{ 
        background: '#1f1f1f', 
        padding: '0 16px',
        paddingLeft: '80px', // Space for traffic lights on macOS
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #303030',
        height: '48px',
        lineHeight: '48px',
      }}
    >
      <Space className="no-drag">
        <Text strong style={{ fontSize: '16px', color: '#fff' }}>FlowProxy</Text>
      </Space>
      
      <Space className="no-drag">
        <Tag color={status.running ? 'green' : 'default'}>
          {status.running ? 'Running' : 'Stopped'}
        </Tag>
        <Text type="secondary">Port: {status.port}</Text>
        <Text type="secondary">Requests: {status.requestCount}</Text>
        <Button
          type={status.running ? 'default' : 'primary'}
          icon={status.running ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
          onClick={toggleProxy}
          loading={loading}
        >
          {status.running ? 'Stop' : 'Start'}
        </Button>
      </Space>
    </AntHeader>
  );
};

export default Header;
