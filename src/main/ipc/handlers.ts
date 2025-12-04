import { IpcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS, HttpRequest, ComponentContext, ComponentDebugRequest, ComponentDebugResult, CertImportRequest, CertInstallResult, SystemProxyStatus, FlowDebugRequest, FlowDebugResult } from '../../shared/models';
import { ProxyEngine } from '../proxy/proxyEngine';
import { RequestStore } from '../store/requestStore';
import { FlowStore } from '../store/flowStore';
import { ComponentStore } from '../store/componentStore';
import { ConfigStore } from '../store/configStore';
import { executeBuiltinComponent } from '../components/builtins';
import { debugScriptComponent } from '../components/scriptRunner';
import { getCertManager } from '../proxy/certManager';
import { FlowEngine } from '../flow/flowEngine';
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

// 根据配置启用或关闭系统级 HTTP/HTTPS 代理
async function applySystemProxySetting(enabled: boolean, ctx: HandlerContext): Promise<void> {
  const config = ctx.configStore.getConfig();
  const port = config.proxyPort;

  if (process.platform === 'darwin') {
    try {
      const { stdout } = await execFileAsync('networksetup', ['-listallnetworkservices']);
      const services = stdout
        .split('\n')
        .map((l) => l.trim())
        // 过滤掉说明性文字和被禁用服务行
        .filter((l) => l && !l.startsWith('*') && !l.startsWith('An asterisk'));

      for (const service of services) {
        if (enabled) {
          await execFileAsync('networksetup', ['-setwebproxy', service, '127.0.0.1', String(port)]);
          await execFileAsync('networksetup', ['-setsecurewebproxy', service, '127.0.0.1', String(port)]);
          await execFileAsync('networksetup', ['-setwebproxystate', service, 'on']);
          await execFileAsync('networksetup', ['-setsecurewebproxystate', service, 'on']);
        } else {
          await execFileAsync('networksetup', ['-setwebproxystate', service, 'off']);
          await execFileAsync('networksetup', ['-setsecurewebproxystate', service, 'off']);
        }
      }
    } catch (error) {
      console.error('Failed to apply macOS system proxy:', error);
    }
    return;
  }

  if (process.platform === 'win32') {
    try {
      if (enabled) {
        await execFileAsync('netsh', ['winhttp', 'set', 'proxy', `127.0.0.1:${port}`]);
      } else {
        await execFileAsync('netsh', ['winhttp', 'reset', 'proxy']);
      }
    } catch (error) {
      console.error('Failed to apply Windows system proxy:', error);
    }
    return;
  }

  // 其他平台暂时不做系统代理配置
  console.warn('System proxy auto-configuration is not supported on this platform.');
}

// 检测当前系统代理状态
async function getSystemProxyStatus(ctx: HandlerContext): Promise<SystemProxyStatus> {
  const config = ctx.configStore.getConfig();
  const expectedHost = '127.0.0.1';
  const expectedPort = config.proxyPort;

  if (process.platform === 'darwin') {
    try {
      const { stdout } = await execFileAsync('scutil', ['--proxy']);
      const lines = stdout.split('\n');
      const map: Record<string, string> = {};
      for (const line of lines) {
        const parts = line.split(':');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const value = parts.slice(1).join(':').trim();
          if (key) map[key] = value;
        }
      }

      const httpEnable = map['HTTPEnable'] === '1';
      const httpsEnable = map['HTTPSEnable'] === '1';
      const host = map['HTTPProxy'] || map['HTTPSProxy'];
      const portStr = map['HTTPPort'] || map['HTTPSPort'];
      const port = portStr ? parseInt(portStr, 10) : undefined;

      const enabled = !!(httpEnable || httpsEnable);
      const matchesConfig = !!(
        enabled &&
        host === expectedHost &&
        port === expectedPort
      );

      return {
        enabled,
        matchesConfig,
        effectiveHost: host,
        effectivePort: port,
        source: 'scutil --proxy',
        rawText: stdout,
      };
    } catch (error: any) {
      console.error('Failed to detect macOS system proxy:', error);
      return {
        enabled: false,
        matchesConfig: false,
        source: 'scutil --proxy',
        rawText: String(error?.message || error),
      };
    }
  }

  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync('netsh', ['winhttp', 'show', 'proxy']);
      const direct = stdout.includes('Direct access (no proxy server).');
      if (direct) {
        return {
          enabled: false,
          matchesConfig: !config.systemProxyEnabled,
          source: 'netsh winhttp show proxy',
          rawText: stdout,
        };
      }

      // 简单解析 http 代理行
      let host: string | undefined;
      let port: number | undefined;
      const lines = stdout.split('\n');
      for (const line of lines) {
        const lower = line.toLowerCase();
        if (lower.includes('proxy server')) {
          const match = lower.match(/http=([^:;\s]+):(\d+)/);
          if (match) {
            host = match[1];
            port = parseInt(match[2], 10);
            break;
          }
        }
      }

      const enabled = !!host && !!port;
      const matchesConfig = !!(
        enabled &&
        host === expectedHost &&
        port === expectedPort
      );

      return {
        enabled,
        matchesConfig,
        effectiveHost: host,
        effectivePort: port,
        source: 'netsh winhttp show proxy',
        rawText: stdout,
      };
    } catch (error: any) {
      console.error('Failed to detect Windows system proxy:', error);
      return {
        enabled: false,
        matchesConfig: false,
        source: 'netsh winhttp show proxy',
        rawText: String(error?.message || error),
      };
    }
  }

  return {
    enabled: false,
    matchesConfig: !config.systemProxyEnabled,
    source: 'unsupported',
  };
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
      if (!ctx.proxyEngine.isRunning()) {
        await ctx.proxyEngine.start();
      }
      return true;
    } catch (error) {
      console.error('Failed to start proxy:', error);
      return false;
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROXY_STOP, async () => {
    try {
      await ctx.proxyEngine.stop();

      // 停止代理时自动关闭系统代理，并更新配置
      const currentConfig = ctx.configStore.getConfig();
      if (currentConfig.systemProxyEnabled) {
        try {
          await applySystemProxySetting(false, ctx);
        } catch (e) {
          console.error('Failed to disable system proxy on stop:', e);
        }
        ctx.configStore.saveConfig({ systemProxyEnabled: false });
      }

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

  // Flow 调试
  ipcMain.handle(IPC_CHANNELS.FLOW_DEBUG, async (_event, debugReq: FlowDebugRequest): Promise<FlowDebugResult> => {
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

      const flow = ctx.flowStore.getById(debugReq.flowId);
      if (!flow) {
        return {
          success: false,
          errorMessage: 'Flow not found',
          logs: [],
          before: { request },
          after: { request },
        };
      }

      const engine = new FlowEngine(ctx.flowStore, ctx.componentStore);
      const { result, logs } = await engine.debugFlow(flow, request);

      return {
        success: true,
        logs,
        before: { request },
        after: {
          request: result.request,
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

  // 配置
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, () => {
    return ctx.configStore.getConfig();
  });

  // 保存配置，并根据配置动态调整运行时行为（HTTPS MITM / System Proxy）
  ipcMain.handle(IPC_CHANNELS.CONFIG_SAVE, async (_event, config) => {
    ctx.configStore.saveConfig(config);

    const fullConfig = ctx.configStore.getConfig();

    // 运行时同步 HTTPS MITM 开关到 ProxyEngine（无需重启）
    if (typeof config?.httpsMitmEnabled === 'boolean') {
      ctx.proxyEngine.setHttpsMitmEnabled(config.httpsMitmEnabled);
    }

    // 根据配置启用/关闭系统代理
    if (typeof config?.systemProxyEnabled === 'boolean') {
      try {
        if (config.systemProxyEnabled) {
          // 开启系统代理前，确保代理已启动
          if (!ctx.proxyEngine.isRunning()) {
            await ctx.proxyEngine.start();
          }
          await applySystemProxySetting(true, ctx);
        } else {
          await applySystemProxySetting(false, ctx);
        }
      } catch (error) {
        console.error('Failed to apply system proxy setting:', error);
      }
    }
  });

  // 系统代理状态
  ipcMain.handle(IPC_CHANNELS.SYSTEM_PROXY_STATUS, async () => {
    return getSystemProxyStatus(ctx);
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
