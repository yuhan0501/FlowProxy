import { RequestRecord, FlowDefinition, ComponentDefinition, AppConfig, ProxyStatus, ComponentDebugRequest, ComponentDebugResult } from '../../shared/models';

declare global {
  interface Window {
    electronAPI: {
      // Proxy control
      proxyStart: () => Promise<boolean>;
      proxyStop: () => Promise<boolean>;
      proxyStatus: () => Promise<ProxyStatus>;
      
      // Request records
      getRequests: (filter?: any) => Promise<RequestRecord[]>;
      clearRequests: () => Promise<void>;
      getRequestById: (id: string) => Promise<RequestRecord | undefined>;
      onNewRequest: (callback: (record: RequestRecord) => void) => () => void;
      
      // Flow management
      getFlows: () => Promise<FlowDefinition[]>;
      saveFlow: (flow: FlowDefinition) => Promise<void>;
      deleteFlow: (id: string) => Promise<void>;
      toggleFlow: (id: string, enabled: boolean) => Promise<void>;
      
      // Component management
      getComponents: () => Promise<ComponentDefinition[]>;
      saveComponent: (component: ComponentDefinition) => Promise<void>;
      deleteComponent: (id: string) => Promise<void>;
      debugComponent: (request: ComponentDebugRequest) => Promise<ComponentDebugResult>;

      // Certificates / HTTPS
      getCertStatus: () => Promise<CertStatus>;
      generateCA: () => Promise<CertStatus>;
      importCA: (payload: { caKeyPem: string; caCertPem: string }) => Promise<CertStatus>;
      installCA: () => Promise<CertInstallResult>;
      
      // Config
      getConfig: () => Promise<AppConfig>;
      saveConfig: (config: Partial<AppConfig>) => Promise<void>;
    };
  }
}

export {};
