import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Typography, Modal, Form, Input, message, Popconfirm, Tag, Tabs, Select, Collapse, Descriptions } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, BugOutlined } from '@ant-design/icons';
import AceEditor from 'react-ace';
import ace from 'ace-builds/src-noconflict/ace';
import 'ace-builds/src-noconflict/mode-javascript';
import 'ace-builds/src-noconflict/theme-twilight';
import 'ace-builds/src-noconflict/ext-language_tools';
import { ComponentDefinition, RequestRecord, ComponentDebugResult, HttpRequest, HttpResponse } from '../../shared/models';
import { v4 as uuidv4 } from 'uuid';
import { useI18n } from '../i18n';

const { Title, Text } = Typography;
const { Panel } = Collapse;

// 用于根据当前组件 params 动态生成 config.<param> 补全
let currentParamNames: string[] = [];

// 注册简单的自动补全：config.* 和 ctx.* 常用字段 + 动态参数
const langTools = (ace as any).require('ace/ext/language_tools');
langTools.addCompleter({
  getCompletions: function (_editor: any, _session: any, _pos: any, _prefix: string, callback: any) {
    const base = [
      { caption: 'config', value: 'config', meta: 'FlowProxy config' },
      { caption: 'ctx', value: 'ctx', meta: 'FlowProxy context' },
      { caption: 'ctx.request', value: 'ctx.request', meta: 'HTTP request' },
      { caption: 'ctx.response', value: 'ctx.response', meta: 'HTTP response' },
      { caption: 'ctx.vars', value: 'ctx.vars', meta: 'Flow variables' },
      { caption: 'ctx.log', value: 'ctx.log', meta: 'Logger' },
    ];

    const paramCompletions = currentParamNames.map((name) => ({
      caption: `config.${name}`,
      value: `config.${name}`,
      meta: 'component param',
    }));

    const all = base.concat(paramCompletions);

    callback(null, all.map((c) => ({
      caption: c.caption,
      value: c.value,
      meta: c.meta,
    })));
  },
});

const Components: React.FC = () => {
  const { t } = useI18n();
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
  const watchedParams = Form.useWatch('params', form);

  const formatBody = (body?: string, contentType?: string) => {
    if (!body) return <Text type="secondary">No body</Text>;

    if (contentType?.includes('application/json')) {
      try {
        const parsed = JSON.parse(body);
        return (
          <pre className="code-block json-body">
            {JSON.stringify(parsed, null, 2)}
          </pre>
        );
      } catch {
        // fall through
      }
    }

    if (contentType?.includes('xml')) {
      return (
        <pre className="code-block xml-body">
          {body}
        </pre>
      );
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

  useEffect(() => { loadComponents(); }, []);

  // 根据表单里的 params 动态更新当前组件的参数名，用于编辑器补全
  useEffect(() => {
    const paramsArray = (watchedParams || []) as any[];
    currentParamNames = paramsArray
      .map((p) => p && p.name)
      .filter((name: any) => typeof name === 'string' && name.length > 0);
  }, [watchedParams]);

  const loadComponents = async () => {
    setLoading(true);
    try { setComponents(await window.electronAPI.getComponents()); }
    catch (error) {
      console.error('Failed to load components:', error);
      message.error(t('components.load.failed'));
    }
    finally { setLoading(false); }
  };

  const loadRequests = async () => {
    try { setRequests(await window.electronAPI.getRequests()); }
    catch (error) { console.error('Failed to load requests:', error); }
  };

  const openEditModal = (component?: ComponentDefinition) => {
    if (component) {
      setEditingComponent(component);
      form.setFieldsValue({
        name: component.name,
        description: component.description,
        scriptCode: component.scriptCode,
        params: component.params || [],
      });
    } else {
      setEditingComponent(null);
      form.resetFields();
      form.setFieldsValue({
        scriptCode:
          `// Component script\n// Access parameters via config.<paramName>\n// Access request via ctx.request\n// Return modified request/response\n\nfunction run(config, ctx) {\n  ctx.log('Component executed with foo=' + config.foo);\n  return { request: ctx.request };\n}`,
        params: [
          { name: 'foo', label: 'Foo', type: 'string', defaultValue: '' },
        ],
      });
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
        params: (values.params || []).filter((p: any) => p && p.name),
      };
      await window.electronAPI.saveComponent(component);
      message.success(t('components.save.success'));
      setEditModalVisible(false);
      loadComponents();
      setEditingComponent(component);
    } catch (error) {
      console.error('Failed to save component:', error);
      message.error(t('components.save.failed'));
    }
  };

  // 在编辑弹窗中直接调试当前脚本（自动保存后打开 Debug）
  const debugFromEditor = async () => {
    try {
      const values = await form.validateFields();
      const component: ComponentDefinition = {
        id: editingComponent?.id || uuidv4(),
        name: values.name,
        type: 'script',
        description: values.description,
        scriptCode: values.scriptCode,
        params: (values.params || []).filter((p: any) => p && p.name),
      };
      await window.electronAPI.saveComponent(component);
      // 不关闭编辑弹窗，只刷新列表并打开 Debug
      loadComponents();
      setEditingComponent(component);
      message.success('Component saved for debug');
      openDebugModal(component);
    } catch (error) {
      console.error('Failed to save component for debug:', error);
      message.error(t('components.saveForDebug.failed'));
    }
  };

  const deleteComponent = async (id: string) => {
    try {
      await window.electronAPI.deleteComponent(id);
      message.success(t('components.delete.success'));
      loadComponents();
    } catch (error) { message.error(t('components.delete.failedBuiltin')); }
  };

  const openDebugModal = (component: ComponentDefinition) => {
    setDebugComponent(component);
    setDebugResult(null);
    // 根据参数定义生成一个默认配置对象，便于调试
    const defaults: any = {};
    if (component.params) {
      component.params.forEach((p: any) => {
        if (p.defaultValue !== undefined) {
          defaults[p.name] = p.defaultValue;
        }
      });
    }
    setDebugConfig(JSON.stringify(defaults, null, 2));
    loadRequests();
    setDebugModalVisible(true);
  };

  const runDebug = async () => {
    if (!debugComponent || !selectedRequestId) { message.warning(t('components.debug.run.needRequest')); return; }
    try {
      let config = {};
      try { config = JSON.parse(debugConfig); } catch {}
      const result = await window.electronAPI.debugComponent({
        componentId: debugComponent.id,
        componentConfig: config,
        requestRecordId: selectedRequestId,
      });
      setDebugResult(result);
    } catch (error) { message.error(t('components.debug.run.failed')); }
  };

  const columns = [
    { title: t('components.table.name'), dataIndex: 'name', render: (name: string, record: ComponentDefinition) => (
      <Space>
        <Text>{name}</Text>
        {record.type === 'builtin' && <Tag color="blue">{t('components.type.builtin')}</Tag>}
      </Space>
    )},
    { title: t('components.table.type'), dataIndex: 'type', width: 100, render: (type: string) => <Tag>{type}</Tag> },
    { title: t('components.table.description'), dataIndex: 'description', ellipsis: true },
    { title: t('components.table.actions'), width: 140, render: (_: any, record: ComponentDefinition) => (
      <Space size={4}>
        <Button
          type="text"
          size="small"
          icon={<BugOutlined />}
          onClick={() => openDebugModal(record)}
        />
        {record.type === 'script' && (
          <>
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEditModal(record)}
            />
            <Popconfirm title={t('components.delete.confirm')} onConfirm={() => deleteComponent(record.id)}>
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                danger
              />
            </Popconfirm>
          </>
        )}
      </Space>
    )},
  ];

  return (
    <div style={{ padding: '8px' }}>
      <Card
        title={<Title level={4} style={{ margin: 0 }}>{t('components.title')}</Title>}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditModal()}>
            {t('components.btn.new')}
          </Button>
        }>
        <Table dataSource={components} columns={columns} rowKey="id" loading={loading} pagination={false} />
      </Card>

      <Modal
        title={editingComponent ? t('components.modal.edit.title') : t('components.modal.new.title')}
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        width={800}
        footer={[
          <Button key="cancel" onClick={() => setEditModalVisible(false)}>
            {t('components.modal.btn.cancel')}
          </Button>,
          <Button key="debug" onClick={debugFromEditor}>
            {t('components.modal.btn.debug')}
          </Button>,
          <Button key="save" type="primary" onClick={saveComponent}>
            {t('components.modal.btn.save')}
          </Button>,
        ]}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t('components.form.name')} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label={t('components.form.description')}><Input.TextArea rows={2} /></Form.Item>
          <Form.Item
            name="scriptCode"
            label={t('components.form.scriptCode')}
            rules={[{ required: true }]}
            tooltip={t('components.form.scriptCode.tooltip')}
          >
            <AceEditor
              mode="javascript"
              theme="twilight"
              width="100%"
              height="260px"
              name="component-script-editor"
              value={form.getFieldValue('scriptCode')}
              onChange={(val) => form.setFieldsValue({ scriptCode: val })}
              setOptions={{
                useWorker: false,
                enableBasicAutocompletion: true,
                enableLiveAutocompletion: true,
                tabSize: 2,
                showPrintMargin: false,
              }}
              editorProps={{ $blockScrolling: true }}
            />
          </Form.Item>

          <Form.Item label={t('components.form.params.title')}>
            <Text type="secondary">
              {t('components.form.params.help')}
            </Text>
          </Form.Item>
          <Form.List name="params">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <div
                    key={field.key}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '140px 1fr 120px 1fr 40px',
                      columnGap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <Form.Item
                      {...field}
                      name={[field.name, 'name']}
                      fieldKey={[field.fieldKey!, 'name']}
                      rules={[{ required: true, message: 'Name is required' }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Input placeholder={t('components.form.params.name')} />
                    </Form.Item>
                    <Form.Item
                      {...field}
                      name={[field.name, 'label']}
                      fieldKey={[field.fieldKey!, 'label']}
                      style={{ marginBottom: 0 }}
                    >
                      <Input placeholder={t('components.form.params.label')} />
                    </Form.Item>
                    <Form.Item
                      {...field}
                      name={[field.name, 'type']}
                      fieldKey={[field.fieldKey!, 'type']}
                      initialValue="string"
                      style={{ marginBottom: 0 }}
                    >
                      <Select>
                        <Select.Option value="string">String</Select.Option>
                        <Select.Option value="number">Number</Select.Option>
                        <Select.Option value="boolean">Boolean</Select.Option>
                        <Select.Option value="json">JSON</Select.Option>
                      </Select>
                    </Form.Item>
                    <Form.Item
                      {...field}
                      name={[field.name, 'defaultValue']}
                      fieldKey={[field.fieldKey!, 'defaultValue']}
                      style={{ marginBottom: 0 }}
                    >
                      <Input placeholder={t('components.form.params.default')} />
                    </Form.Item>
                    <Button
                      type="text"
                      size="small"
                      danger
                      onClick={() => remove(field.name)}
                      style={{ padding: 0 }}
                    >
                      <DeleteOutlined />
                    </Button>
                  </div>
                ))}
                <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                  {t('components.form.params.btn.add')}
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>

      <Modal title={`${t('components.debug.titlePrefix')}${debugComponent?.name}`} open={debugModalVisible} onCancel={() => setDebugModalVisible(false)}
        width={900} footer={<Button type="primary" onClick={runDebug}>{t('components.debug.btn.run')}</Button>}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Card size="small" title={t('components.debug.sampleRequest')}>
            <Select style={{ width: '100%' }} placeholder="Select a request" value={selectedRequestId || undefined}
              onChange={setSelectedRequestId} showSearch optionFilterProp="children">
              {requests.slice(0, 100).map(r => (
                <Select.Option key={r.id} value={r.id}>{r.request.method} {r.request.url}</Select.Option>
              ))}
            </Select>
          </Card>
          <Card size="small" title={t('components.debug.config')}>
            <Input.TextArea rows={3} value={debugConfig} onChange={e => setDebugConfig(e.target.value)} />
          </Card>
          {debugResult && (
            <Card size="small" title={<Space>{t('components.debug.result')} <Tag color={debugResult.success ? 'green' : 'red'}>{debugResult.success ? t('components.debug.status.success') : t('components.debug.status.failed')}</Tag></Space>}>
              {debugResult.errorMessage && <Text type="danger">{debugResult.errorMessage}</Text>}
              {debugResult.logs.length > 0 && (
                <div><Text strong>{t('components.debug.logs')}</Text><pre className="code-block">{debugResult.logs.join('\n')}</pre></div>
              )}
              <Tabs
                items={[
                  {
                    key: 'before-req',
                    label: 'Before - Request',
                    children: renderRequestView(debugResult.before.request),
                  },
                  {
                    key: 'before-res',
                    label: 'Before - Response',
                    children: renderResponseView(debugResult.before.response),
                  },
                  {
                    key: 'after-req',
                    label: 'After - Request',
                    children: renderRequestView(debugResult.after.request),
                  },
                  {
                    key: 'after-res',
                    label: 'After - Response',
                    children: renderResponseView(debugResult.after.response),
                  },
                ]}
              />
            </Card>
          )}
        </Space>
      </Modal>
    </div>
  );
};

export default Components;
