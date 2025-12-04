import { ComponentContext, ComponentResult, HttpResponse } from '../../shared/models';
import * as fs from 'fs';

type BuiltinHandler = (
  config: any,
  ctx: ComponentContext
) => Promise<ComponentResult>;

const builtinHandlers: Record<string, BuiltinHandler> = {
  headerRewrite: async (config, ctx) => {
    const request = { ...ctx.request, headers: { ...ctx.request.headers } };

    // 新的参数化配置：addHeaderName / addHeaderValue / removeHeaderNames
    if (config.addHeaderName && config.addHeaderValue !== undefined) {
      request.headers[String(config.addHeaderName).toLowerCase()] = String(config.addHeaderValue);
    }

    if (config.removeHeaderNames) {
      const names = String(config.removeHeaderNames)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const name of names) {
        delete request.headers[name.toLowerCase()];
      }
    }

    // 兼容旧的 JSON 配置 setHeaders / removeHeaders
    if (config.setHeaders && typeof config.setHeaders === 'object') {
      for (const [key, value] of Object.entries(config.setHeaders)) {
        request.headers[key.toLowerCase()] = String(value);
      }
    }

    if (config.removeHeaders && Array.isArray(config.removeHeaders)) {
      for (const key of config.removeHeaders) {
        delete request.headers[String(key).toLowerCase()];
      }
    }

    ctx.log(`Header rewrite applied`);
    return { request };
  },

  mockResponse: async (config, ctx) => {
    let headers: Record<string, string> = {};

    // 兼容旧的 headers 对象
    if (config.headers && typeof config.headers === 'object') {
      headers = { ...config.headers };
    }

    // 支持 headersJson 字段（字符串形式的 JSON）
    if (config.headersJson) {
      try {
        const parsed = JSON.parse(String(config.headersJson));
        if (parsed && typeof parsed === 'object') {
          headers = { ...headers, ...parsed };
        }
      } catch {
        ctx.log('[mockResponse] Failed to parse headersJson');
      }
    }

    const response: HttpResponse = {
      statusCode: config.statusCode || 200,
      statusMessage: config.statusMessage || 'OK',
      headers: {
        'content-type': config.contentType || 'application/json',
        ...headers,
      },
      body: config.body || '',
    };

    ctx.log(`Mock response: ${response.statusCode}`);
    return { response, terminate: true };
  },

  delay: async (config, ctx) => {
    const ms = typeof config.ms === 'number' ? config.ms : parseInt(String(config.ms || '1000'), 10) || 1000;
    ctx.log(`Delaying for ${ms}ms`);
    await new Promise((resolve) => setTimeout(resolve, ms));
    return {};
  },

  // 1. URL Host Rewrite
  urlHostRewrite: async (config, ctx) => {
    const urlStr = ctx.request.url;
    try {
      if (!/^https?:\/\//.test(urlStr)) {
        ctx.log('[urlHostRewrite] Request URL is not absolute, skip');
        return {};
      }
      const url = new URL(urlStr);
      const targetHost = String(config.targetHost || '').trim();
      if (!targetHost) return {};
      const targetScheme = (String(config.targetScheme || 'https').toLowerCase() === 'http' ? 'http' : 'https');

      const [hostName, hostPort] = targetHost.split(':');
      url.hostname = hostName;
      if (hostPort) {
        url.port = hostPort;
      } else {
        url.port = '';
      }
      url.protocol = `${targetScheme}:`;

      const request = { ...ctx.request, url: url.toString(), headers: { ...ctx.request.headers } };
      if (!config.preserveHostHeader) {
        request.headers['host'] = hostPort ? `${hostName}:${hostPort}` : hostName;
      }
      ctx.log(`[urlHostRewrite] -> ${request.url}`);
      return { request };
    } catch (e) {
      ctx.log('[urlHostRewrite] Failed to parse URL');
      return {};
    }
  },

  // 2. URL Query Params
  urlQueryParams: async (config, ctx) => {
    const urlStr = ctx.request.url;
    try {
      if (!/^https?:\/\//.test(urlStr)) {
        ctx.log('[urlQueryParams] Request URL is not absolute, skip');
        return {};
      }
      const url = new URL(urlStr);

      if (config.addParamsJson) {
        try {
          const obj = typeof config.addParamsJson === 'string'
            ? JSON.parse(config.addParamsJson)
            : config.addParamsJson;
          if (obj && typeof obj === 'object') {
            for (const [k, v] of Object.entries(obj)) {
              url.searchParams.set(k, String(v));
            }
          }
        } catch {
          ctx.log('[urlQueryParams] Failed to parse addParamsJson');
        }
      }

      if (config.removeParamNames) {
        const names = String(config.removeParamNames)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        for (const name of names) {
          url.searchParams.delete(name);
        }
      }

      const request = { ...ctx.request, url: url.toString() };
      ctx.log(`[urlQueryParams] -> ${request.url}`);
      return { request };
    } catch {
      ctx.log('[urlQueryParams] Failed to parse URL');
      return {};
    }
  },

  // 3. Upstream Host Override（本质也是 URL host 重写，默认 http）
  upstreamHost: async (config, ctx) => {
    const urlStr = ctx.request.url;
    try {
      if (!/^https?:\/\//.test(urlStr)) {
        ctx.log('[upstreamHost] Request URL is not absolute, skip');
        return {};
      }
      const url = new URL(urlStr);
      const targetHost = String(config.targetHost || '').trim();
      if (!targetHost) return {};
      const targetScheme = (String(config.targetScheme || 'http').toLowerCase() === 'https' ? 'https' : 'http');

      const [hostName, hostPort] = targetHost.split(':');
      url.hostname = hostName;
      if (hostPort) {
        url.port = hostPort;
      } else {
        url.port = '';
      }
      url.protocol = `${targetScheme}:`;

      const request = { ...ctx.request, url: url.toString(), headers: { ...ctx.request.headers } };
      // 覆盖 Host 头，指向新 upstream
      request.headers['host'] = hostPort ? `${hostName}:${hostPort}` : hostName;
      ctx.log(`[upstreamHost] -> ${request.url}`);
      return { request };
    } catch {
      ctx.log('[upstreamHost] Failed to parse URL');
      return {};
    }
  },

  // 4. JSON Body Modify
  jsonBodyModify: async (config, ctx) => {
    const ct = ctx.request.headers['content-type'] || ctx.request.headers['Content-Type'] || '';
    if (!ctx.request.body || !String(ct).includes('application/json')) {
      ctx.log('[jsonBodyModify] Not a JSON request, skip');
      return {};
    }

    const pathStr = String(config.jsonPath || '').trim();
    if (!pathStr) return {};

    let root: any;
    try {
      root = JSON.parse(ctx.request.body);
    } catch {
      ctx.log('[jsonBodyModify] Failed to parse request JSON body');
      return {};
    }

    const op = (config.operation || 'set').toString();
    let value: any = undefined;
    if (op === 'set' || op === 'append') {
      if (config.valueJson !== undefined) {
        try {
          value = typeof config.valueJson === 'string' ? JSON.parse(config.valueJson) : config.valueJson;
        } catch {
          // 当作字符串使用
          value = config.valueJson;
        }
      }
    }

    const applyPath = (obj: any, path: string, fn: (parent: any, key: string | number) => void) => {
      const segments: (string | number)[] = [];
      path.split('.').forEach((part) => {
        const m = part.match(/^(\w+)(\[(\d+)\])?$/);
        if (m) {
          const key = m[1];
          segments.push(key);
          if (m[3] !== undefined) {
            segments.push(Number(m[3]));
          }
        }
      });
      if (!segments.length) return;
      let parent = obj;
      for (let i = 0; i < segments.length - 1; i++) {
        const seg = segments[i];
        if (typeof seg === 'number') {
          if (!Array.isArray(parent)) return;
          if (!parent[seg]) parent[seg] = {};
          parent = parent[seg];
        } else {
          if (parent[seg] === undefined || parent[seg] === null) {
            parent[seg] = {};
          }
          parent = parent[seg];
        }
      }
      fn(parent, segments[segments.length - 1]);
    };

    if (op === 'set') {
      applyPath(root, pathStr, (parent, key) => {
        (parent as any)[key as any] = value;
      });
    } else if (op === 'remove') {
      applyPath(root, pathStr, (parent, key) => {
        if (Array.isArray(parent) && typeof key === 'number') {
          parent.splice(key, 1);
        } else {
          delete (parent as any)[key as any];
        }
      });
    } else if (op === 'append') {
      applyPath(root, pathStr, (parent, key) => {
        const current = (parent as any)[key as any];
        if (Array.isArray(current)) {
          current.push(value);
        } else if (current === undefined) {
          (parent as any)[key as any] = [value];
        } else {
          (parent as any)[key as any] = [current, value];
        }
      });
    }

    const newBody = JSON.stringify(root);
    const headers = { ...ctx.request.headers };
    const len = Buffer.byteLength(newBody).toString();
    headers['content-length'] = len;
    headers['Content-Length'] = len;

    ctx.log('[jsonBodyModify] Applied');
    return {
      request: {
        ...ctx.request,
        body: newBody,
        headers,
      },
    };
  },

  // 5. Response Override
  responseOverride: async (config, ctx) => {
    const response: HttpResponse = {
      statusCode: config.statusCode || 200,
      statusMessage: config.statusMessage || 'OK',
      headers: {
        'content-type': config.contentType || 'text/plain',
      },
      body: config.body || '',
    };
    ctx.log(`[responseOverride] ${response.statusCode}`);
    return { response, terminate: true };
  },

  // 6. Header Copy
  headerCopy: async (config, ctx) => {
    const source = String(config.sourceHeader || '').toLowerCase();
    const target = String(config.targetHeader || '').toLowerCase();
    if (!source || !target) return {};

    const headers = { ...ctx.request.headers };
    const val = headers[source];
    if (val !== undefined) {
      headers[target] = val;
      ctx.log(`[headerCopy] ${source} -> ${target}`);
      return { request: { ...ctx.request, headers } };
    }
    return {};
  },

  // 7. Cookie Inject（request 侧）
  cookieInject: async (config, ctx) => {
    const name = String(config.cookieName || '').trim();
    const value = String(config.cookieValue ?? '').trim();
    if (!name) return {};

    const headers = { ...ctx.request.headers };
    const raw = headers['cookie'] || headers['Cookie'] || '';
    const jar: Record<string, string> = {};
    raw.split(';').forEach((pair) => {
      const [k, v] = pair.split('=');
      if (!k) return;
      jar[k.trim()] = (v || '').trim();
    });
    jar[name] = value;
    const newCookie = Object.entries(jar)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    headers['cookie'] = newCookie;

    ctx.log(`[cookieInject] ${name}`);
    return { request: { ...ctx.request, headers } };
  },

  // 8. Auth Inject
  authInject: async (config, ctx) => {
    const token = String(config.token || '').trim();
    if (!token) return {};
    const schemeRaw = (config.scheme || 'Bearer').toString();
    const scheme = schemeRaw.trim();
    const override = config.overrideExisting !== false;

    const headers = { ...ctx.request.headers };
    if (!override && (headers['authorization'] || headers['Authorization'])) {
      return {};
    }
    headers['authorization'] = `${scheme} ${token}`;
    ctx.log('[authInject] Authorization injected');
    return { request: { ...ctx.request, headers } };
  },

  // 9. Bandwidth Throttle（简单：额外延时）
  bandwidthThrottle: async (config, ctx) => {
    const delayMs = typeof config.delayMs === 'number'
      ? config.delayMs
      : parseInt(String(config.delayMs || '0'), 10) || 0;
    if (delayMs > 0) {
      ctx.log(`[bandwidthThrottle] Extra delay ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return {};
  },

  // 10. Random Failure
  randomFailure: async (config, ctx) => {
    const rate = typeof config.errorRate === 'number' ? config.errorRate : Number(config.errorRate || 0.1);
    const p = isNaN(rate) ? 0.1 : Math.min(Math.max(rate, 0), 1);
    if (Math.random() >= p) {
      return {};
    }
    const status = config.statusCode || 500;
    const body = config.body || 'Injected failure by FlowProxy';
    ctx.log(`[randomFailure] Injected failure with rate=${p}`);
    return {
      response: {
        statusCode: status,
        statusMessage: 'Injected Failure',
        headers: { 'content-type': 'text/plain' },
        body,
      },
      terminate: true,
    };
  },

  // 11. Retry Hint（目前仅写入 ctx.vars，后续可在 ProxyEngine 中接入真实重试）
  retryHint: async (config, ctx) => {
    const maxRetries = typeof config.maxRetries === 'number' ? config.maxRetries : Number(config.maxRetries || 3);
    const retryDelayMs = typeof config.retryDelayMs === 'number' ? config.retryDelayMs : Number(config.retryDelayMs || 1000);
    const codes = String(config.retryOnStatusCodes || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number(s))
      .filter((n) => !isNaN(n));

    ctx.vars.retry = {
      maxRetries: maxRetries || 0,
      retryDelayMs: retryDelayMs || 0,
      retryOnStatusCodes: codes,
    };
    ctx.log('[retryHint] Attached retry metadata to ctx.vars.retry');
    return {};
  },

  // 12. CORS Allow All（主要用于 OPTIONS 预检请求）
  corsAllowAll: async (config, ctx) => {
    if (ctx.request.method !== 'OPTIONS') {
      return {};
    }
    const allowOrigin = config.allowOrigins || '*';
    const allowMethods = config.allowMethods || 'GET,POST,PUT,DELETE,OPTIONS';
    const allowHeaders = config.allowHeaders || '*';

    const response: HttpResponse = {
      statusCode: 204,
      statusMessage: 'No Content',
      headers: {
        'access-control-allow-origin': allowOrigin,
        'access-control-allow-methods': allowMethods,
        'access-control-allow-headers': allowHeaders,
        'access-control-max-age': '600',
      },
      body: '',
    };
    ctx.log('[corsAllowAll] Handled OPTIONS preflight');
    return { response, terminate: true };
  },

  // 13. Static Local File（文本类）
  staticLocalFile: async (config, ctx) => {
    const filePath = String(config.filePath || '').trim();
    if (!filePath) return {};
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const ct = config.contentType || 'text/plain; charset=utf-8';
      const response: HttpResponse = {
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': ct },
        body: content,
      };
      ctx.log(`[staticLocalFile] Served ${filePath}`);
      return { response, terminate: true };
    } catch (e: any) {
      ctx.log(`[staticLocalFile] Failed to read file: ${e?.message || e}`);
      return {
        response: {
          statusCode: 500,
          statusMessage: 'Static File Error',
          headers: { 'content-type': 'text/plain' },
          body: 'Failed to read local file',
        },
        terminate: true,
      };
    }
  },

  // 14. Log Message
  logMessage: async (config, ctx) => {
    const msg = String(config.message || '').trim();
    if (msg) {
      ctx.log(`[logMessage] ${msg}`);
    }
    return {};
  },

  // 15. Tag Request
  tagRequest: async (config, ctx) => {
    const key = String(config.tagKey || '').trim();
    const value = String(config.tagValue || '').trim();
    if (!key) return {};
    ctx.vars.tags = ctx.vars.tags || {};
    ctx.vars.tags[key] = value;
    ctx.log(`[tagRequest] ${key}=${value}`);
    return {};
  },
};

export async function executeBuiltinComponent(
  internalName: string,
  config: any,
  ctx: ComponentContext
): Promise<ComponentResult> {
  const handler = builtinHandlers[internalName];
  if (!handler) {
    throw new Error(`Unknown builtin component: ${internalName}`);
  }
  return handler(config, ctx);
}
