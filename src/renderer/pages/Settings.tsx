import React, { useState, useEffect } from 'react';
import { Card, Form, InputNumber, Select, Button, message, Typography, Divider, Space, Alert, Switch, Input } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { AppConfig, CertStatus } from '../../shared/models';
import { useI18n, Language } from '../i18n';

const { Title, Text, Paragraph } = Typography;

const Settings: React.FC = () => {
  const [form] = Form.useForm<AppConfig>();
  const [loading, setLoading] = useState(false);
  const [certStatus, setCertStatus] = useState<CertStatus | null>(null);
  const [importKeyPem, setImportKeyPem] = useState('');
  const [importCertPem, setImportCertPem] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);
  const { t, setLanguage } = useI18n();

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
      if (values.language) {
        setLanguage(values.language as Language);
      }
      message.success(t('settings.save.success'));
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
      message.success(t('settings.httpsCert.generate.success'));
      loadCertStatus();
    } catch (error) {
      console.error('Failed to generate CA:', error);
      message.error(t('settings.httpsCert.generate.failed'));
    } finally {
      setGenerateLoading(false);
    }
  };

  const handleImportCA = async () => {
    if (!importKeyPem.trim() || !importCertPem.trim()) {
      message.warning(t('settings.httpsCert.import.missing'));
      return;
    }
    setImportLoading(true);
    try {
      await window.electronAPI.importCA({ caKeyPem: importKeyPem, caCertPem: importCertPem });
      message.success(t('settings.httpsCert.import.success'));
      setImportKeyPem('');
      setImportCertPem('');
      loadCertStatus();
    } catch (error) {
      console.error('Failed to import CA:', error);
      message.error(t('settings.httpsCert.import.failed'));
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div style={{ padding: '8px', maxWidth: '800px' }}>
      <Title level={4}>{t('settings.title')}</Title>

      <Card title={t('settings.proxySettings')} style={{ marginBottom: '16px' }}>
        <Form form={form} layout="vertical">
          <Form.Item
            name="proxyPort"
            label={t('settings.proxyPort')}
            rules={[{ required: true }]}
            extra={t('settings.proxyPort.extra')}
          >
            <InputNumber min={1024} max={65535} style={{ width: '200px' }} />
          </Form.Item>

          <Form.Item
            name="maxRequestRecords"
            label={t('settings.maxRequestRecords')}
            extra={t('settings.maxRequestRecords.extra')}
          >
            <InputNumber min={100} max={10000} style={{ width: '200px' }} />
          </Form.Item>

          <Form.Item name="logLevel" label={t('settings.logLevel')}>
            <Select style={{ width: '200px' }}>
              <Select.Option value="debug">Debug</Select.Option>
              <Select.Option value="info">Info</Select.Option>
              <Select.Option value="warn">Warning</Select.Option>
              <Select.Option value="error">Error</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="httpsMitmEnabled"
            label={t('settings.httpsMitmEnabled')}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Form.Item
            name="systemProxyEnabled"
            label={t('settings.systemProxyEnabled')}
            valuePropName="checked"
            extra={t('settings.systemProxyEnabled.extra')}
          >
            <Switch />
          </Form.Item>

          <Form.Item name="language" label={t('settings.language')}>
            <Select style={{ width: '200px' }}>
              <Select.Option value="en">{t('settings.language.english')}</Select.Option>
              <Select.Option value="zh-CN">{t('settings.language.chineseSimplified')}</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={saveConfig}
              loading={loading}
            >
              {t('settings.save')}
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title={t('settings.httpsCert')} style={{ marginBottom: '16px' }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong>{t('settings.httpsCert.status')} </Text>
            {certStatus?.hasCA ? (
              <Text type="success">{t('settings.httpsCert.status.installed')}</Text>
            ) : (
              <Text type="danger">{t('settings.httpsCert.status.notInstalled')}</Text>
            )}
          </div>
          {certStatus?.hasCA && (
            <>
              <div>
                <Text strong>{t('settings.httpsCert.subject')} </Text>
                <Text>{certStatus.subject || 'N/A'}</Text>
              </div>
              <div>
                <Text strong>{t('settings.httpsCert.valid')} </Text>
                <Text>
                  {certStatus.validFrom &&
                    new Date(certStatus.validFrom).toLocaleDateString()}{' '}
                  -{' '}
                  {certStatus.validTo &&
                    new Date(certStatus.validTo).toLocaleDateString()}
                </Text>
              </div>
              <div>
                <Text strong>{t('settings.httpsCert.systemTrust')} </Text>
                {certStatus.systemTrusted === true && (
                  <Text type="success">
                    {t('settings.httpsCert.systemTrust.trusted')}
                  </Text>
                )}
                {certStatus.systemTrusted === false && (
                  <Text type="danger">
                    {t('settings.httpsCert.systemTrust.notTrusted')}
                  </Text>
                )}
                {certStatus.systemTrusted === undefined && (
                  <Text type="secondary">
                    {t('settings.httpsCert.systemTrust.unknown')}
                  </Text>
                )}
              </div>
              {certStatus.systemTrustCheckMessage && (
                <div>
                  <Text type="secondary">
                    {certStatus.systemTrustCheckMessage}
                  </Text>
                </div>
              )}
              {certStatus.caCertPath && (
                <div>
                  <Text strong>{t('settings.httpsCert.caPath')} </Text>
                  <Text code>{certStatus.caCertPath}</Text>
                </div>
              )}
            </>
          )}

          <Space>
            <Button onClick={handleGenerateCA} loading={generateLoading}>
              {t('settings.httpsCert.generate')}
            </Button>
            <Button
              onClick={async () => {
                try {
                  const res = await window.electronAPI.installCA();
                  if (res?.success) {
                    message.success(
                      res.message || t('settings.httpsCert.install.opened')
                    );
                  } else {
                    message.error(
                      res?.message || t('settings.httpsCert.install.failed')
                    );
                  }
                } catch (e) {
                  console.error('Failed to install CA:', e);
                  message.error(t('settings.httpsCert.install.failed'));
                }
              }}
            >
              {t('settings.httpsCert.install')}
            </Button>
            <Button onClick={loadCertStatus}>{t('settings.httpsCert.refresh')}</Button>
          </Space>

          <Divider />

          <Alert
            type="info"
            message={t('settings.httpsCert.import.title')}
            description={t('settings.httpsCert.import.desc')}
          />

          <Form layout="vertical">
            <Form.Item label={t('settings.httpsCert.import.key')}>
              <Input.TextArea
                rows={4}
                value={importKeyPem}
                onChange={(e) => setImportKeyPem(e.target.value)}
                placeholder="-----BEGIN PRIVATE KEY-----"
              />
            </Form.Item>
            <Form.Item label={t('settings.httpsCert.import.cert')}>
              <Input.TextArea
                rows={4}
                value={importCertPem}
                onChange={(e) => setImportCertPem(e.target.value)}
                placeholder="-----BEGIN CERTIFICATE-----"
              />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                onClick={handleImportCA}
                loading={importLoading}
              >
                {t('settings.httpsCert.import.button')}
              </Button>
            </Form.Item>
          </Form>
        </Space>
      </Card>

      <Card title={t('settings.proxySetup')}>
        <Alert
          type="info"
          message={t('settings.proxySetup.howToUse')}
          style={{ marginBottom: '16px' }}
          description={t('settings.proxySetup.hint')}
        />
        
        <Title level={5}>{t('settings.proxySetup.macosTitle')}</Title>
        <Paragraph>
          <ol>
            <li>Open System Preferences → Network</li>
            <li>Select your network connection → Advanced → Proxies</li>
            <li>Enable "Web Proxy (HTTP)" and "Secure Web Proxy (HTTPS)"</li>
            <li>
              Set server to <Text code>127.0.0.1</Text> and port to your configured
              port
            </li>
          </ol>
        </Paragraph>

        <Divider />

        <Title level={5}>{t('settings.proxySetup.browserTitle')}</Title>
        <Paragraph>{t('settings.proxySetup.browserHint')}</Paragraph>

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
