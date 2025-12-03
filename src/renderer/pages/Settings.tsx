import React, { useState, useEffect } from 'react';
import { Card, Form, InputNumber, Select, Button, message, Typography, Divider, Space, Alert, Switch, Input } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { AppConfig, CertStatus } from '../../shared/models';

const { Title, Text, Paragraph } = Typography;

const Settings: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [certStatus, setCertStatus] = useState<CertStatus | null>(null);
  const [importKeyPem, setImportKeyPem] = useState('');
  const [importCertPem, setImportCertPem] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);

  useEffect(() => { 
    loadConfig();
    loadCertStatus();
  }, []);

  const loadConfig = async () => {
    try {
      const config = await window.electronAPI.getConfig();
      form.setFieldsValue(config);
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  };

  const loadCertStatus = async () => {
    try {
      const status = await window.electronAPI.getCertStatus();
      setCertStatus(status);
    } catch (error) {
      console.error('Failed to load certificate status:', error);
    }
  };

  const saveConfig = async () => {
    setLoading(true);
    try {
      const values = await form.validateFields();
      await window.electronAPI.saveConfig(values);
      message.success('Settings saved. Restart proxy to apply changes.');
    } catch (error) {
      console.error('Failed to save config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateCA = async () => {
    setGenerateLoading(true);
    try {
      await window.electronAPI.generateCA();
      message.success('Root CA generated. Please install and trust it in your system.');
      loadCertStatus();
    } catch (error) {
      console.error('Failed to generate CA:', error);
      message.error('Failed to generate CA');
    } finally {
      setGenerateLoading(false);
    }
  };

  const handleImportCA = async () => {
    if (!importKeyPem.trim() || !importCertPem.trim()) {
      message.warning('Please paste both private key PEM and certificate PEM.');
      return;
    }
    setImportLoading(true);
    try {
      await window.electronAPI.importCA({ caKeyPem: importKeyPem, caCertPem: importCertPem });
      message.success('CA imported successfully.');
      setImportKeyPem('');
      setImportCertPem('');
      loadCertStatus();
    } catch (error) {
      console.error('Failed to import CA:', error);
      message.error('Failed to import CA');
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div style={{ padding: '8px', maxWidth: '800px' }}>
      <Title level={4}>Settings</Title>

      <Card title="Proxy Settings" style={{ marginBottom: '16px' }}>
        <Form form={form} layout="vertical">
          <Form.Item name="proxyPort" label="Proxy Port" rules={[{ required: true }]}
            extra="The port number for the HTTP proxy server">
            <InputNumber min={1024} max={65535} style={{ width: '200px' }} />
          </Form.Item>

          <Form.Item name="maxRequestRecords" label="Max Request Records"
            extra="Maximum number of requests to keep in history">
            <InputNumber min={100} max={10000} style={{ width: '200px' }} />
          </Form.Item>

          <Form.Item name="logLevel" label="Log Level">
            <Select style={{ width: '200px' }}>
              <Select.Option value="debug">Debug</Select.Option>
              <Select.Option value="info">Info</Select.Option>
              <Select.Option value="warn">Warning</Select.Option>
              <Select.Option value="error">Error</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="httpsMitmEnabled"
            label="HTTPS Decryption"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Form.Item>
            <Button type="primary" icon={<SaveOutlined />} onClick={saveConfig} loading={loading}>
              Save Settings
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="HTTPS Certificate" style={{ marginBottom: '16px' }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong>Status: </Text>
            {certStatus?.hasCA ? (
              <Text type="success">Installed</Text>
            ) : (
              <Text type="danger">Not generated / imported</Text>
            )}
          </div>
          {certStatus?.hasCA && (
            <>
              <div>
                <Text strong>Subject: </Text>
                <Text>{certStatus.subject || 'N/A'}</Text>
              </div>
              <div>
                <Text strong>Valid: </Text>
                <Text>
                  {certStatus.validFrom && new Date(certStatus.validFrom).toLocaleDateString()} -{' '}
                  {certStatus.validTo && new Date(certStatus.validTo).toLocaleDateString()}
                </Text>
              </div>
              <div>
                <Text strong>System Trust: </Text>
                {certStatus.systemTrusted === true && <Text type="success">Trusted</Text>}
                {certStatus.systemTrusted === false && <Text type="danger">Not Trusted</Text>}
                {certStatus.systemTrusted === undefined && <Text type="secondary">Unknown</Text>}
              </div>
              {certStatus.systemTrustCheckMessage && (
                <div>
                  <Text type="secondary">{certStatus.systemTrustCheckMessage}</Text>
                </div>
              )}
              {certStatus.caCertPath && (
                <div>
                  <Text strong>CA Path: </Text>
                  <Text code>{certStatus.caCertPath}</Text>
                </div>
              )}
            </>
          )}

          <Space>
            <Button onClick={handleGenerateCA} loading={generateLoading}>
              Generate Root CA
            </Button>
            <Button
              onClick={async () => {
                try {
                  const res = await window.electronAPI.installCA();
                  if (res?.success) {
                    message.success(res.message || 'Opened system certificate manager.');
                  } else {
                    message.error(res?.message || 'Failed to install CA');
                  }
                } catch (e) {
                  console.error('Failed to install CA:', e);
                  message.error('Failed to install CA');
                }
              }}
            >
              Install CA to System
            </Button>
            <Button onClick={loadCertStatus}>Refresh</Button>
          </Space>

          <Divider />

          <Alert
            type="info"
            message="Import existing Root CA"
            description="Paste PEM-formatted private key and certificate if you already have a CA you want FlowProxy to use."
          />

          <Form layout="vertical">
            <Form.Item label="CA Private Key (PEM)">
              <Input.TextArea
                rows={4}
                value={importKeyPem}
                onChange={(e) => setImportKeyPem(e.target.value)}
                placeholder="-----BEGIN PRIVATE KEY-----"
              />
            </Form.Item>
            <Form.Item label="CA Certificate (PEM)">
              <Input.TextArea
                rows={4}
                value={importCertPem}
                onChange={(e) => setImportCertPem(e.target.value)}
                placeholder="-----BEGIN CERTIFICATE-----"
              />
            </Form.Item>
            <Form.Item>
              <Button type="primary" onClick={handleImportCA} loading={importLoading}>
                Import CA
              </Button>
            </Form.Item>
          </Form>
        </Space>
      </Card>

      <Card title="Proxy Setup Instructions">
        <Alert type="info" message="How to use FlowProxy" style={{ marginBottom: '16px' }}
          description="Configure your system or application to use FlowProxy as an HTTP proxy." />
        
        <Title level={5}>macOS System Proxy</Title>
        <Paragraph>
          <ol>
            <li>Open System Preferences → Network</li>
            <li>Select your network connection → Advanced → Proxies</li>
            <li>Enable "Web Proxy (HTTP)" and "Secure Web Proxy (HTTPS)"</li>
            <li>Set server to <Text code>127.0.0.1</Text> and port to your configured port</li>
          </ol>
        </Paragraph>

        <Divider />

        <Title level={5}>Browser Proxy (Chrome/Firefox)</Title>
        <Paragraph>
          Use browser extensions like "SwitchyOmega" to configure proxy settings per-browser.
        </Paragraph>

        <Divider />

        <Title level={5}>Command Line</Title>
        <Paragraph>
          <Text code>export http_proxy=http://127.0.0.1:8888</Text>
          <br />
          <Text code>export https_proxy=http://127.0.0.1:8888</Text>
        </Paragraph>
      </Card>
    </div>
  );
};

export default Settings;
