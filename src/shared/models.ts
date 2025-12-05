// HTTP 请求 / 响应的内部表示
export interface HttpHeaders {
  [key: string]: string;
}

export interface HttpRequest {
  id: string;
  method: string;
  url: string;
  headers: HttpHeaders;
  body?: string;  // 原始 body（存储为字符串）
  timestamp: number;
  clientIp?: string;
  clientPort?: number;
}

export interface HttpResponse {
  statusCode: number;
  statusMessage?: string;
  headers: HttpHeaders;
  // 文本类主体（仅用于展示 / 调试）；二进制内容通常为空
  body?: string;
}

// 最近请求记录
export interface RequestRecord {
  id: string;
  request: HttpRequest;
  response?: HttpResponse;
  durationMs?: number;
  matchedFlowId?: string;
}

// 流程节点类型
export type NodeType =
  | "entry"
  | "component"
  | "condition"
  | "terminator";

export interface FlowNodeBase {
  id: string;
  type: NodeType;
  name: string;
  position: { x: number; y: number };
}

export interface FlowMatchRule {
  methods?: string[];       // ["GET", "POST"]
  hostPatterns?: string[];  // 支持通配符，例如 "*.example.com"
  pathPatterns?: string[];  // "/api/*"
}

export interface EntryNode extends FlowNodeBase {
  type: "entry";
  match: FlowMatchRule;
}

export interface ComponentNode extends FlowNodeBase {
  type: "component";
  componentId: string;
  config: any;
}

export interface ConditionNode extends FlowNodeBase {
  type: "condition";
  expression: string;
}

export interface TerminatorNode extends FlowNodeBase {
  type: "terminator";
  mode: "end_with_response" | "pass_through";
}

export type FlowNode = EntryNode | ComponentNode | ConditionNode | TerminatorNode;

export interface FlowEdge {
  id: string;
  from: string;
  to: string;
  conditionLabel?: string;
}

export interface FlowDefinition {
  id: string;
  name: string;
  enabled: boolean;
  nodes: FlowNode[];
  edges: FlowEdge[];
  createdAt: number;
  updatedAt: number;
}

// 组件定义
export type ComponentType = "builtin" | "script";

export type ComponentParamType = 'string' | 'number' | 'boolean' | 'json';

export interface ComponentParamDefinition {
  name: string;          // 参数字段名，脚本中通过 config[name] 访问
  label?: string;        // UI 上展示的名称
  type: ComponentParamType;
  required?: boolean;
  defaultValue?: any;
  description?: string;
}

export interface ComponentDefinition {
  id: string;
  name: string;
  type: ComponentType;
  // 可选的参数定义列表，用于生成更友好的配置表单
  params?: ComponentParamDefinition[];
  // 旧的 schema 字段，主要用于内置组件的复杂配置（暂时保留）
  schema?: any;
  scriptCode?: string;
  internalName?: string;
  description?: string;
}

// 组件执行上下文
export interface ComponentContext {
  request: HttpRequest;
  response?: HttpResponse;
  vars: Record<string, any>;
  log: (msg: string) => void;
}

export interface ComponentResult {
  request?: HttpRequest;
  response?: HttpResponse;
  vars?: Record<string, any>;
  terminate?: boolean;
}

// IPC 通道定义
export const IPC_CHANNELS = {
  // 代理控制
  PROXY_START: 'proxy:start',
  PROXY_STOP: 'proxy:stop',
  PROXY_STATUS: 'proxy:status',
  
  // 请求记录
  REQUESTS_GET: 'requests:get',
  REQUESTS_CLEAR: 'requests:clear',
  REQUESTS_NEW: 'requests:new',
  REQUEST_GET_BY_ID: 'request:getById',
  
  // 流程管理
  FLOWS_GET: 'flows:get',
  FLOW_SAVE: 'flow:save',
  FLOW_DELETE: 'flow:delete',
  FLOW_TOGGLE: 'flow:toggle',
  FLOW_DEBUG: 'flow:debug',
  
  // 组件管理
  COMPONENTS_GET: 'components:get',
  COMPONENT_SAVE: 'component:save',
  COMPONENT_DELETE: 'component:delete',
  COMPONENT_DEBUG: 'component:debug',
  
  // 证书 / HTTPS
  CERT_STATUS: 'cert:status',
  CERT_GENERATE: 'cert:generate',
  CERT_IMPORT: 'cert:import',
  CERT_INSTALL: 'cert:install',
  
  // 系统代理
  SYSTEM_PROXY_STATUS: 'systemProxy:status',
  
  // 配置
  CONFIG_GET: 'config:get',
  CONFIG_SAVE: 'config:save',
} as const;

// 应用配置
export interface AppConfig {
  proxyPort: number;
  maxRequestRecords: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  // 首选界面语言（可选；未设置时由前端根据系统语言自动选择）
  language?: 'en' | 'zh-CN';
  // 是否启用 HTTPS MITM 解密
  httpsMitmEnabled?: boolean;
  // 是否自动将系统 HTTP/HTTPS 代理指向 FlowProxy
  systemProxyEnabled?: boolean;
}

// 证书状态
export interface CertStatus {
  hasCA: boolean;
  subject?: string;
  validFrom?: number;
  validTo?: number;
  caCertPath?: string;
  // 是否已经安装到系统信任存储（最佳努力检测，可能为 undefined 表示未知）
  systemTrusted?: boolean;
  systemTrustCheckMessage?: string;
}

// 系统代理状态
export interface SystemProxyStatus {
  // 当前系统层面是否配置了 HTTP/HTTPS 代理
  enabled: boolean;
  // 是否与 FlowProxy 配置匹配（host=127.0.0.1 && port=proxyPort）
  matchesConfig: boolean;
  effectiveHost?: string;
  effectivePort?: number;
  source?: string; // scutil / netsh / etc
  rawText?: string; // 原始检测输出，便于调试
}

// 导入证书请求（PEM 文本）
export interface CertImportRequest {
  caKeyPem: string;
  caCertPem: string;
}

export interface CertInstallResult {
  success: boolean;
  message?: string;
  error?: string;
}

// 组件调试接口
export interface ComponentDebugRequest {
  componentId: string;
  componentConfig: any;
  rawHttpText?: string;
  requestRecordId?: string;
}

export interface ComponentDebugResult {
  success: boolean;
  errorMessage?: string;
  logs: string[];
  before: {
    request: HttpRequest;
    response?: HttpResponse;
  };
  after: {
    request: HttpRequest;
    response?: HttpResponse;
  };
}

// Flow 调试接口
export interface FlowDebugRequest {
  flowId: string;
  rawHttpText?: string;
  requestRecordId?: string;
}

export interface FlowDebugResult {
  success: boolean;
  errorMessage?: string;
  logs: string[];
  before: {
    request: HttpRequest;
    response?: HttpResponse;
  };
  after: {
    request: HttpRequest;
    response?: HttpResponse;
  };
}

// 代理状态
export interface ProxyStatus {
  running: boolean;
  port: number;
  requestCount: number;
}
