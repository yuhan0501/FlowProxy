import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { ComponentDefinition } from '../../shared/models';

// 内置组件定义
const BUILTIN_COMPONENTS: ComponentDefinition[] = [
  {
    id: 'header-rewrite',
    name: 'Header Rewrite',
    type: 'builtin',
    internalName: 'headerRewrite',
    description: 'Add, modify, or remove HTTP headers',
    params: [
      {
        name: 'addHeaderName',
        label: 'Header Name to Add/Modify',
        type: 'string',
        description: 'e.g. X-Debug',
      },
      {
        name: 'addHeaderValue',
        label: 'Header Value',
        type: 'string',
        description: 'e.g. 1',
      },
      {
        name: 'removeHeaderNames',
        label: 'Headers to Remove (comma separated)',
        type: 'string',
        description: 'e.g. X-Old-Header, X-Debug',
      },
    ],
    // 保留旧的 schema，兼容已有 JSON 配置
    schema: {
      type: 'object',
      properties: {
        setHeaders: {
          type: 'object',
          title: 'Set Headers',
          description: 'Headers to add or modify',
        },
        removeHeaders: {
          type: 'array',
          title: 'Remove Headers',
          items: { type: 'string' },
          description: 'Header names to remove',
        },
      },
    },
  },
  {
    id: 'mock-response',
    name: 'Mock Response',
    type: 'builtin',
    internalName: 'mockResponse',
    description: 'Return a mock response instead of forwarding the request',
    params: [
      {
        name: 'statusCode',
        label: 'Status Code',
        type: 'number',
        defaultValue: 200,
      },
      {
        name: 'statusMessage',
        label: 'Status Message',
        type: 'string',
        defaultValue: 'OK',
      },
      {
        name: 'contentType',
        label: 'Content Type',
        type: 'string',
        defaultValue: 'application/json',
      },
      {
        name: 'body',
        label: 'Response Body',
        type: 'string',
        description: 'Raw body text or JSON string',
      },
      {
        name: 'headersJson',
        label: 'Headers (JSON)',
        type: 'json',
        description: 'Optional extra headers, e.g. {"X-Debug":"1"}',
      },
    ],
    schema: {
      type: 'object',
      properties: {
        statusCode: {
          type: 'number',
          title: 'Status Code',
          default: 200,
        },
        headers: {
          type: 'object',
          title: 'Response Headers',
        },
        body: {
          type: 'string',
          title: 'Response Body',
        },
        contentType: {
          type: 'string',
          title: 'Content Type',
          default: 'application/json',
        },
      },
    },
  },
  {
    id: 'delay',
    name: 'Delay',
    type: 'builtin',
    internalName: 'delay',
    description: 'Add a delay before continuing the flow',
    params: [
      {
        name: 'ms',
        label: 'Delay (ms)',
        type: 'number',
        defaultValue: 1000,
      },
    ],
    schema: {
      type: 'object',
      properties: {
        ms: {
          type: 'number',
          title: 'Delay (ms)',
          default: 1000,
        },
      },
    },
  },
  // 1. URL Host Rewrite
  {
    id: 'url-host-rewrite',
    name: 'URL Host Rewrite',
    type: 'builtin',
    internalName: 'urlHostRewrite',
    description: 'Rewrite request URL host/scheme (e.g. route to another environment)',
    params: [
      {
        name: 'targetHost',
        label: 'Target Host (optional port)',
        type: 'string',
        description: 'e.g. dev.example.com or dev.example.com:8080',
        required: true,
      },
      {
        name: 'targetScheme',
        label: 'Target Scheme',
        type: 'string',
        defaultValue: 'https',
        description: 'http or https',
      },
      {
        name: 'preserveHostHeader',
        label: 'Preserve Original Host Header',
        type: 'boolean',
        defaultValue: false,
      },
    ],
  },
  // 2. URL Query Params
  {
    id: 'url-query-params',
    name: 'URL Query Params',
    type: 'builtin',
    internalName: 'urlQueryParams',
    description: 'Add or remove query parameters on the URL',
    params: [
      {
        name: 'addParamsJson',
        label: 'Params to Add (JSON)',
        type: 'json',
        description: 'e.g. {"debug":"1","foo":"bar"}',
      },
      {
        name: 'removeParamNames',
        label: 'Params to Remove (comma separated)',
        type: 'string',
        description: 'e.g. utm_source,utm_campaign',
      },
    ],
  },
  // 3. Upstream Host Override
  {
    id: 'upstream-host',
    name: 'Upstream Host Override',
    type: 'builtin',
    internalName: 'upstreamHost',
    description: 'Route request to another upstream host (e.g. local dev server)',
    params: [
      {
        name: 'targetHost',
        label: 'Upstream Host (optional port)',
        type: 'string',
        required: true,
      },
      {
        name: 'targetScheme',
        label: 'Scheme',
        type: 'string',
        defaultValue: 'http',
      },
    ],
  },
  // 4. JSON Body Modify
  {
    id: 'json-body-modify',
    name: 'JSON Body Modify',
    type: 'builtin',
    internalName: 'jsonBodyModify',
    description: 'Modify JSON request body fields by simple path',
    params: [
      {
        name: 'jsonPath',
        label: 'JSON Path',
        type: 'string',
        required: true,
        description: 'e.g. user.name or items[0].price',
      },
      {
        name: 'operation',
        label: 'Operation',
        type: 'string',
        defaultValue: 'set',
        description: 'set | remove | append',
      },
      {
        name: 'valueJson',
        label: 'Value (JSON)',
        type: 'json',
        description: 'Value for set/append, e.g. "Alice" or 123 or {"enabled":true}',
      },
    ],
  },
  // 5. Response Override (lightweight mock)
  {
    id: 'response-override',
    name: 'Response Override',
    type: 'builtin',
    internalName: 'responseOverride',
    description: 'Return a simple custom response and stop the flow',
    params: [
      { name: 'statusCode', label: 'Status Code', type: 'number', defaultValue: 200 },
      { name: 'statusMessage', label: 'Status Message', type: 'string', defaultValue: 'OK' },
      { name: 'contentType', label: 'Content Type', type: 'string', defaultValue: 'text/plain' },
      { name: 'body', label: 'Body', type: 'string' },
    ],
  },
  // 6. Header Copy
  {
    id: 'header-copy',
    name: 'Header Copy',
    type: 'builtin',
    internalName: 'headerCopy',
    description: 'Copy a header value to another header on the request',
    params: [
      { name: 'sourceHeader', label: 'Source Header', type: 'string', required: true },
      { name: 'targetHeader', label: 'Target Header', type: 'string', required: true },
    ],
  },
  // 7. Cookie Inject
  {
    id: 'cookie-inject',
    name: 'Cookie Inject',
    type: 'builtin',
    internalName: 'cookieInject',
    description: 'Inject or override a cookie on the request',
    params: [
      { name: 'cookieName', label: 'Cookie Name', type: 'string', required: true },
      { name: 'cookieValue', label: 'Cookie Value', type: 'string', required: true },
    ],
  },
  // 8. Auth Inject
  {
    id: 'auth-inject',
    name: 'Auth Inject',
    type: 'builtin',
    internalName: 'authInject',
    description: 'Inject Authorization header for the request',
    params: [
      { name: 'scheme', label: 'Scheme', type: 'string', defaultValue: 'Bearer' },
      { name: 'token', label: 'Token', type: 'string', required: true },
      { name: 'overrideExisting', label: 'Override Existing', type: 'boolean', defaultValue: true },
    ],
  },
  // 9. Bandwidth Throttle (simple delay-based)
  {
    id: 'bandwidth-throttle',
    name: 'Bandwidth Throttle',
    type: 'builtin',
    internalName: 'bandwidthThrottle',
    description: 'Simulate slow network with additional delay (simple)',
    params: [
      { name: 'delayMs', label: 'Extra Delay (ms)', type: 'number', defaultValue: 0 },
    ],
  },
  // 10. Random Failure Injection
  {
    id: 'random-failure',
    name: 'Random Failure',
    type: 'builtin',
    internalName: 'randomFailure',
    description: 'Randomly fail a portion of requests with an error response',
    params: [
      { name: 'errorRate', label: 'Error Rate (0-1)', type: 'number', defaultValue: 0.1 },
      { name: 'statusCode', label: 'Status Code', type: 'number', defaultValue: 500 },
      { name: 'body', label: 'Error Body', type: 'string', defaultValue: 'Injected failure by FlowProxy' },
    ],
  },
  // 11. Retry Hint (metadata only, 目前只写入 ctx.vars)
  {
    id: 'retry-hint',
    name: 'Retry Hint',
    type: 'builtin',
    internalName: 'retryHint',
    description: 'Attach retry metadata (for future engine support)',
    params: [
      { name: 'maxRetries', label: 'Max Retries', type: 'number', defaultValue: 3 },
      { name: 'retryDelayMs', label: 'Retry Delay (ms)', type: 'number', defaultValue: 1000 },
      { name: 'retryOnStatusCodes', label: 'Retry On Status Codes', type: 'string', description: 'e.g. 500,502,503' },
    ],
  },
  // 12. CORS Allow All (Preflight)
  {
    id: 'cors-allow-all',
    name: 'CORS Allow All',
    type: 'builtin',
    internalName: 'corsAllowAll',
    description: 'Handle OPTIONS preflight with permissive CORS headers',
    params: [
      { name: 'allowOrigins', label: 'Allow-Origin', type: 'string', defaultValue: '*' },
      { name: 'allowMethods', label: 'Allow-Methods', type: 'string', defaultValue: 'GET,POST,PUT,DELETE,OPTIONS' },
      { name: 'allowHeaders', label: 'Allow-Headers', type: 'string', defaultValue: '*' },
    ],
  },
  // 13. Static Local File (text only)
  {
    id: 'static-local-file',
    name: 'Static Local File',
    type: 'builtin',
    internalName: 'staticLocalFile',
    description: 'Serve a local text file as response (JS/CSS/JSON)',
    params: [
      { name: 'filePath', label: 'Local File Path', type: 'string', required: true },
      { name: 'contentType', label: 'Content-Type', type: 'string', defaultValue: 'text/plain; charset=utf-8' },
    ],
  },
  // 14. Log Message
  {
    id: 'log-message',
    name: 'Log Message',
    type: 'builtin',
    internalName: 'logMessage',
    description: 'Log a custom message to debug output',
    params: [
      { name: 'message', label: 'Message', type: 'string', required: true },
    ],
  },
  // 15. Tag Request (vars)
  {
    id: 'tag-request',
    name: 'Tag Request',
    type: 'builtin',
    internalName: 'tagRequest',
    description: 'Attach custom tags to ctx.vars for this request',
    params: [
      { name: 'tagKey', label: 'Tag Key', type: 'string', required: true },
      { name: 'tagValue', label: 'Tag Value', type: 'string', required: true },
    ],
  },
];

export class ComponentStore {
  private componentsDir: string;
  private components: Map<string, ComponentDefinition> = new Map();

  constructor() {
    const userDataPath = app?.getPath('userData') || path.join(process.env.HOME || '', '.flowproxy');
    this.componentsDir = path.join(userDataPath, 'components');
    this.ensureDir();
    this.loadBuiltins();
    this.loadCustomComponents();
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.componentsDir)) {
      fs.mkdirSync(this.componentsDir, { recursive: true });
    }
  }

  private loadBuiltins(): void {
    for (const component of BUILTIN_COMPONENTS) {
      this.components.set(component.id, component);
    }
  }

  private loadCustomComponents(): void {
    try {
      const files = fs.readdirSync(this.componentsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.componentsDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const component = JSON.parse(content) as ComponentDefinition;
          this.components.set(component.id, component);
        }
      }
    } catch (error) {
      console.error('Failed to load custom components:', error);
    }
  }

  getAll(): ComponentDefinition[] {
    return Array.from(this.components.values());
  }

  getBuiltins(): ComponentDefinition[] {
    return BUILTIN_COMPONENTS;
  }

  getById(id: string): ComponentDefinition | undefined {
    return this.components.get(id);
  }

  save(component: ComponentDefinition): void {
    // 不允许覆盖内置组件
    const existing = this.components.get(component.id);
    if (existing?.type === 'builtin' && component.type !== 'builtin') {
      throw new Error('Cannot overwrite builtin component');
    }

    this.components.set(component.id, component);

    // 只保存自定义组件到文件
    if (component.type === 'script') {
      const filePath = path.join(this.componentsDir, `${component.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(component, null, 2));
    }
  }

  delete(id: string): void {
    const component = this.components.get(id);
    if (component?.type === 'builtin') {
      throw new Error('Cannot delete builtin component');
    }

    this.components.delete(id);
    const filePath = path.join(this.componentsDir, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}
