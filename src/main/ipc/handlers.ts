import { IpcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS, HttpRequest, ComponentContext, ComponentDebugRequest, ComponentDebugResult, CertImportRequest, CertInstallResult } from '../../shared/models';
import { ProxyEngine } from '../proxy/proxyEngine';
import { RequestStore } from '../store/requestStore';
import { FlowStore } from '../store/flowStore';
import { ComponentStore } from '../store/componentStore';
import { ConfigStore } from '../store/configStore';
import { executeBuiltinComponent } from '../components/builtins';
import { debugScriptComponent } from '../components/scriptRunner';
import { getCertManager } from '../proxy/certManager';
import { v4 as uuidv4 } from 'uuid';
import { execFile } from 'child_process';
import * as util from 'util';

const execFileAsync = util.promisify(execFile);

async function checkSystemCertTrust(subjectCN?: string): Promise<{ trusted?: boolean; message?: string }> {
  const subject = subjectCN || 'FlowProxy Root CA';

  try {
    if (process.platform === 'darwin') {
      // macOS: 使用 security 在默认钥匙串中查找同名证书
      const { stdout } = await execFileAsync('security', [
        'find-certificate',
        '-c',
        subject,
        '-a',
        '-Z',
      ]);
      const found = !!(stdout && stdout.includes('SHA-1 hash'));
      return {
        trusted: found,
        message: found
          ? `Found certificate named "${subject}" in keychains.`
          : `Certificate named "${subject}" not found in system keychains. If HTTPS still shows warnings, ensure the CA is imported and set to \"Always Trust\".`,
      };
    }

    if (process.platform === 'win32') {
      // Windows: 在 ROOT 存储中查找主题名称
      const { stdout } = await execFileAsync('certutil', ['-store', 'ROOT']);
      const found = !!(stdout && stdout.toLowerCase().includes(subject.toLowerCase()));
      return {
        trusted: found,
        message: found
          ? `Found certificate named "${subject}" in Windows ROOT store.`
          : `Certificate named "${subject}" not found in Windows ROOT store.`,
      };
    }

    // 其他平台暂时不做精确检测
    return {
      trusted: undefined,
      message: 'System trust check is not supported on this platform. Please verify manually in your certificate manager.',
    };
  } catch (error: any) {
    return {
      trusted: undefined,
      message: `Could not check system trust automatically: ${String(error?.message || error)}`,
    };
  }
}

interface HandlerContext {
  proxyEngine: ProxyEngine;
  requestStore: RequestStore;
  flowStore: FlowStore;
  componentStore: ComponentStore;
  configStore: ConfigStore;
  getMainWindow: () => BrowserWindow | null;
}

export function setupIpcHandlers(ipcMain: IpcMain, ctx: HandlerContext): void {
  // 代理控制
  ipcMain.handle(IPC_CHANNELS.PROXY_START, async () => {
    try {
      await ctx.proxyEngine.start();
      return true;
    } catch (error) {
      console.error('Failed to start proxy:', error);
      return false;
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROXY_STOP, async () => {
    try {
      await ctx.proxyEngine.stop();
      return true;
    } catch (error) {
      console.error('Failed to stop proxy:', error);
      return false;
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROXY_STATUS, () => {
    return {
      running: ctx.proxyEngine.isRunning(),
      port: ctx.proxyEngine.getPort(),
      requestCount: ctx.requestStore.getCount(),
    };
  });

  // 请求记录
  ipcMain.handle(IPC_CHANNELS.REQUESTS_GET, (_event, filter) => {
    if (filter) {
      return ctx.requestStore.filter(filter);
    }
    return ctx.requestStore.getAll();
  });

  ipcMain.handle(IPC_CHANNELS.REQUESTS_CLEAR, () => {
    ctx.requestStore.clear();
  });

  ipcMain.handle(IPC_CHANNELS.REQUEST_GET_BY_ID, (_event, id: string) => {
    return ctx.requestStore.getById(id);
  });

  // 流程管理
  ipcMain.handle(IPC_CHANNELS.FLOWS_GET, () => {
    return ctx.flowStore.getAll();
  });

  ipcMain.handle(IPC_CHANNELS.FLOW_SAVE, (_event, flow) => {
    ctx.flowStore.save(flow);
  });

  ipcMain.handle(IPC_CHANNELS.FLOW_DELETE, (_event, id: string) => {
    ctx.flowStore.delete(id);
  });

  ipcMain.handle(IPC_CHANNELS.FLOW_TOGGLE, (_event, id: string, enabled: boolean) => {
    ctx.flowStore.toggle(id, enabled);
  });

  // 组件管理
  ipcMain.handle(IPC_CHANNELS.COMPONENTS_GET, () => {
    return ctx.componentStore.getAll();
  });

  ipcMain.handle(IPC_CHANNELS.COMPONENT_SAVE, (_event, component) => {
    ctx.componentStore.save(component);
  });

  ipcMain.handle(IPC_CHANNELS.COMPONENT_DELETE, (_event, id: string) => {
    ctx.componentStore.delete(id);
  });

  // 组件调试
  ipcMain.handle(IPC_CHANNELS.COMPONENT_DEBUG, async (_event, debugReq: ComponentDebugRequest): Promise<ComponentDebugResult> => {
    try {
      // 获取请求数据
      let request: HttpRequest;
      if (debugReq.requestRecordId) {
        const record = ctx.requestStore.getById(debugReq.requestRecordId);
        if (!record) {
          return {
            success: false,
            errorMessage: 'Request record not found',
            logs: [],
            before: { request: {} as HttpRequest },
            after: { request: {} as HttpRequest },
          };
        }
        request = record.request;
      } else if (debugReq.rawHttpText) {
        request = parseRawHttpRequest(debugReq.rawHttpText);
      } else {
        return {
          success: false,
          errorMessage: 'No request data provided',
          logs: [],
          before: { request: {} as HttpRequest },
          after: { request: {} as HttpRequest },
        };
      }

      const component = ctx.componentStore.getById(debugReq.componentId);
      if (!component) {
        return {
          success: false,
          errorMessage: 'Component not found',
          logs: [],
          before: { request },
          after: { request },
        };
      }

      const logs: string[] = [];
      const componentCtx: ComponentContext = {
        request: JSON.parse(JSON.stringify(request)),
        response: undefined,
        vars: {},
        log: (msg) => logs.push(msg),
      };

      let result;
      if (component.type === 'builtin') {
        result = await executeBuiltinComponent(
          component.internalName!,
          debugReq.componentConfig,
          componentCtx
        );
      } else {
        const debugResult = await debugScriptComponent(
          component.scriptCode!,
          debugReq.componentConfig,
          componentCtx
        );
        result = debugResult.result;
        logs.push(...debugResult.logs);
        if (debugResult.error) {
          return {
            success: false,
            errorMessage: debugResult.error,
            logs,
            before: { request },
            after: { request: result.request || request, response: result.response },
          };
        }
      }

      return {
        success: true,
        logs,
        before: { request },
        after: {
          request: result.request || request,
          response: result.response,
        },
      };
    } catch (error) {
      return {
        success: false,
        errorMessage: (error as Error).message,
        logs: [],
        before: { request: {} as HttpRequest },
        after: { request: {} as HttpRequest },
      };
    }
  });

  // 证书 / HTTPS
  ipcMain.handle(IPC_CHANNELS.CERT_STATUS, async () => {
    const certMgr = getCertManager();
    // 确保已经尝试加载现有 CA（不会重复生成）
    await certMgr.initCA().catch(() => {});
    const status = certMgr.getStatus();

    if (status.hasCA) {
      const trust = await checkSystemCertTrust(status.subject);
      status.systemTrusted = trust.trusted;
      status.systemTrustCheckMessage = trust.message;
    }

    return status;
  });

  ipcMain.handle(IPC_CHANNELS.CERT_GENERATE, async () => {
    const certMgr = getCertManager();
    await certMgr.initCA();
    const status = certMgr.getStatus();
    if (status.hasCA) {
      const trust = await checkSystemCertTrust(status.subject);
      status.systemTrusted = trust.trusted;
      status.systemTrustCheckMessage = trust.message;
    }
    return status;
  });

  ipcMain.handle(IPC_CHANNELS.CERT_IMPORT, async (_event, payload: CertImportRequest) => {
    const certMgr = getCertManager();
    certMgr.importCAFromPem(payload.caKeyPem, payload.caCertPem);
    const status = certMgr.getStatus();
    if (status.hasCA) {
      const trust = await checkSystemCertTrust(status.subject);
      status.systemTrusted = trust.trusted;
      status.systemTrustCheckMessage = trust.message;
    }
    return status;
  });

  ipcMain.handle(IPC_CHANNELS.CERT_INSTALL, async (): Promise<CertInstallResult> => {
    const certMgr = getCertManager();
    await certMgr.initCA();
    const status = certMgr.getStatus();
    if (!status.caCertPath) {
      return { success: false, message: 'CA certificate not found. Generate or import it first.' };
    }

    const certPath = status.caCertPath;

    try {
      if (process.platform === 'darwin') {
        // 在 macOS 上通过 open 打开证书，让用户在钥匙串中信任
        await execFileAsync('open', [certPath]);
        return {
          success: true,
          message: 'Opened CA certificate in Keychain Access. Please set it to "Always Trust".',
        };
      } else if (process.platform === 'win32') {
        // 尝试写入 Windows 受信任根证书（可能需要管理员权限）
        try {
          await execFileAsync('certutil', ['-addstore', '-f', 'ROOT', certPath]);
          return {
            success: true,
            message: 'Installed CA into Windows ROOT store.',
          };
        } catch (err: any) {
          return {
            success: false,
            message: 'Failed to install CA automatically. Please import it manually.',
            error: String(err?.message || err),
          };
        }
      } else {
        // Linux / 其他平台：尽量用 xdg-open 打开
        try {
          await execFileAsync('xdg-open', [certPath]);
          return {
            success: true,
            message: 'Opened CA certificate. Please install it in your system certificate manager.',
          };
        } catch {
          return {
            success: false,
            message: 'Could not open system certificate manager automatically. Please import CA manually.',
          };
        }
      }
    } catch (error: any) {
      return {
        success: false,
        message: 'Failed to install CA to system.',
        error: String(error?.message || error),
      };
    }
  });

  // 配置
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, () => {
    return ctx.configStore.getConfig();
  });

  ipcMain.handle(IPC_CHANNELS.CONFIG_SAVE, (_event, config) => {
    ctx.configStore.saveConfig(config);
    // 运行时同步 HTTPS MITM 开关到 ProxyEngine（无需重启）
    if (typeof config?.httpsMitmEnabled === 'boolean') {
      ctx.proxyEngine.setHttpsMitmEnabled(config.httpsMitmEnabled);
    }
  });
}

// 解析原始 HTTP 请求文本
function parseRawHttpRequest(rawText: string): HttpRequest {
  const lines = rawText.split('\n').map(l => l.replace(/\r$/, ''));
  const [requestLine, ...rest] = lines;
  
  const [method, path] = requestLine.split(' ');
  const headers: Record<string, string> = {};
  let bodyStartIndex = -1;
  
  for (let i = 0; i < rest.length; i++) {
    const line = rest[i];
    if (line === '') {
      bodyStartIndex = i + 1;
      break;
    }
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim().toLowerCase();
      const value = line.substring(colonIndex + 1).trim();
      headers[key] = value;
    }
  }
  
  const body = bodyStartIndex >= 0 ? rest.slice(bodyStartIndex).join('\n') : undefined;
  const host = headers['host'] || 'localhost';
  
  return {
    id: uuidv4(),
    method: method || 'GET',
    url: `http://${host}${path || '/'}`,
    headers,
    body,
    timestamp: Date.now(),
  };
}
