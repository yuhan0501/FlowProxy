import { contextBridge, ipcRenderer } from 'electron';

// 在 preload 中内联 IPC 通道常量，避免对 shared 模块的依赖导致加载失败
const IPC_CHANNELS = {
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
  
  // 配置
  CONFIG_GET: 'config:get',
  CONFIG_SAVE: 'config:save',
} as const;

// 暴露安全的 API 到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 代理控制
  proxyStart: () => ipcRenderer.invoke(IPC_CHANNELS.PROXY_START),
  proxyStop: () => ipcRenderer.invoke(IPC_CHANNELS.PROXY_STOP),
  proxyStatus: () => ipcRenderer.invoke(IPC_CHANNELS.PROXY_STATUS),
  
  // 请求记录
  getRequests: (filter?: any) => ipcRenderer.invoke(IPC_CHANNELS.REQUESTS_GET, filter),
  clearRequests: () => ipcRenderer.invoke(IPC_CHANNELS.REQUESTS_CLEAR),
  getRequestById: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.REQUEST_GET_BY_ID, id),
  onNewRequest: (callback: (record: any) => void) => {
    const listener = (_event: any, record: any) => callback(record);
    ipcRenderer.on(IPC_CHANNELS.REQUESTS_NEW, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.REQUESTS_NEW, listener);
  },
  
  // 流程管理
  getFlows: () => ipcRenderer.invoke(IPC_CHANNELS.FLOWS_GET),
  saveFlow: (flow: any) => ipcRenderer.invoke(IPC_CHANNELS.FLOW_SAVE, flow),
  deleteFlow: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.FLOW_DELETE, id),
  toggleFlow: (id: string, enabled: boolean) => ipcRenderer.invoke(IPC_CHANNELS.FLOW_TOGGLE, id, enabled),
  
  // 组件管理
  getComponents: () => ipcRenderer.invoke(IPC_CHANNELS.COMPONENTS_GET),
  saveComponent: (component: any) => ipcRenderer.invoke(IPC_CHANNELS.COMPONENT_SAVE, component),
  deleteComponent: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.COMPONENT_DELETE, id),
  debugComponent: (request: any) => ipcRenderer.invoke(IPC_CHANNELS.COMPONENT_DEBUG, request),
  
  // 证书 / HTTPS
  getCertStatus: () => ipcRenderer.invoke(IPC_CHANNELS.CERT_STATUS),
  generateCA: () => ipcRenderer.invoke(IPC_CHANNELS.CERT_GENERATE),
  importCA: (payload: { caKeyPem: string; caCertPem: string }) => ipcRenderer.invoke(IPC_CHANNELS.CERT_IMPORT, payload),
  installCA: () => ipcRenderer.invoke(IPC_CHANNELS.CERT_INSTALL),

  // 配置
  getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET),
  saveConfig: (config: any) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SAVE, config),
});

// TypeScript 类型声明
declare global {
  interface Window {
    electronAPI: {
      proxyStart: () => Promise<boolean>;
      proxyStop: () => Promise<boolean>;
      proxyStatus: () => Promise<any>;
      getRequests: (filter?: any) => Promise<any[]>;
      clearRequests: () => Promise<void>;
      getRequestById: (id: string) => Promise<any>;
      onNewRequest: (callback: (record: any) => void) => () => void;
      getFlows: () => Promise<any[]>;
      saveFlow: (flow: any) => Promise<void>;
      deleteFlow: (id: string) => Promise<void>;
      toggleFlow: (id: string, enabled: boolean) => Promise<void>;
      getComponents: () => Promise<any[]>;
      saveComponent: (component: any) => Promise<void>;
      deleteComponent: (id: string) => Promise<void>;
      debugComponent: (request: any) => Promise<any>;
      // 证书 / HTTPS
      getCertStatus: () => Promise<any>;
      generateCA: () => Promise<any>;
      importCA: (payload: { caKeyPem: string; caCertPem: string }) => Promise<any>;
      // 配置
      getConfig: () => Promise<any>;
      saveConfig: (config: any) => Promise<void>;
    };
  }
}
