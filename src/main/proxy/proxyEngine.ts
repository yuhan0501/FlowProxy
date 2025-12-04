import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import { AddressInfo } from 'net';
import { URL } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { HttpRequest, HttpResponse, RequestRecord } from '../../shared/models';
import { RequestStore } from '../store/requestStore';
import { FlowStore } from '../store/flowStore';
import { ComponentStore } from '../store/componentStore';
import { FlowEngine } from '../flow/flowEngine';
import { getCertManager } from './certManager';

interface ProxyEngineOptions {
  port: number;
  requestStore: RequestStore;
  flowStore: FlowStore;
  componentStore: ComponentStore;
  onRequest?: (record: RequestRecord) => void;
  // 是否启用 HTTPS MITM 解密
  httpsMitmEnabled?: boolean;
}

export class ProxyEngine {
  private server: http.Server | null = null;
  private port: number;
  private requestStore: RequestStore;
  private flowStore: FlowStore;
  private componentStore: ComponentStore;
  private flowEngine: FlowEngine;
  private onRequest?: (record: RequestRecord) => void;
  private running: boolean = false;
  private httpsMitmEnabled: boolean;
  private certManager = getCertManager();
  private httpsMitmServers: Map<string, { server: https.Server; port: number }> = new Map();
  private connections: Set<net.Socket> = new Set();

  constructor(options: ProxyEngineOptions) {
    this.port = options.port;
    this.requestStore = options.requestStore;
    this.flowStore = options.flowStore;
    this.componentStore = options.componentStore;
    this.onRequest = options.onRequest;
    this.flowEngine = new FlowEngine(this.flowStore, this.componentStore);
    this.httpsMitmEnabled = !!options.httpsMitmEnabled;
    console.log('[ProxyEngine] init, port=%d, httpsMitmEnabled=%s', this.port, this.httpsMitmEnabled);
  }

  setHttpsMitmEnabled(enabled: boolean): void {
    this.httpsMitmEnabled = enabled;
    console.log('[ProxyEngine] httpsMitmEnabled set to', enabled);
  }

  start(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (this.running) {
        resolve(true);
        return;
      }

      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      // 跟踪所有连接，便于优雅关闭时快速销毁
      this.server.on('connection', (socket: net.Socket) => {
        this.connections.add(socket);
        socket.on('close', () => {
          this.connections.delete(socket);
        });
      });

      // Handle CONNECT method for HTTPS
      this.server.on('connect', (req, clientSocket: net.Socket, head) => {
        this.handleConnect(req, clientSocket, head);
      });

      this.server.on('error', (err) => {
        console.error('Proxy server error:', err);
        reject(err);
      });

      this.server.listen(this.port, () => {
        console.log(`Proxy server listening on port ${this.port}`);
        this.running = true;
        resolve(true);
      });
    });
  }

  stop(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.server || !this.running) {
        resolve(true);
        return;
      }

      // 主动销毁所有活动连接，加速 close 完成（尤其是 CONNECT 隧道）
      for (const socket of this.connections) {
        try {
          socket.destroy();
        } catch (e) {
          console.error('Error destroying client socket during stop:', e);
        }
      }
      this.connections.clear();

      this.server.close(() => {
        this.running = false;
        this.server = null;
        console.log('Proxy server stopped');
        // 关闭所有 HTTPS MITM 子服务
        for (const { server } of this.httpsMitmServers.values()) {
          try {
            server.close();
          } catch (e) {
            console.error('Error closing HTTPS MITM server:', e);
          }
        }
        this.httpsMitmServers.clear();
        resolve(true);
      });
    });
  }

  isRunning(): boolean {
    return this.running;
  }

  getPort(): number {
    return this.port;
  }

  private async handleRequest(
    clientReq: http.IncomingMessage,
    clientRes: http.ServerResponse
  ): Promise<void> {
    const startTime = Date.now();
    const requestId = uuidv4();

    try {
      // 构建 HttpRequest
      const httpRequest = await this.buildHttpRequest(requestId, clientReq);
      
      // 创建请求记录
      const record: RequestRecord = {
        id: requestId,
        request: httpRequest,
      };
      
      this.requestStore.add(record);
      this.onRequest?.(record);

      // 执行流程引擎
      const flowResult = await this.flowEngine.processRequest(httpRequest);
      
      if (flowResult.response) {
        // 流程返回了响应（如 mock）
        record.response = flowResult.response;
        record.durationMs = Date.now() - startTime;
        record.matchedFlowId = flowResult.matchedFlowId;
        this.requestStore.add(record);
        this.onRequest?.(record);
        
        this.sendResponse(clientRes, flowResult.response);
        return;
      }

      // 转发请求到目标服务器
      const targetUrl = new URL(flowResult.request.url);
      const { response, rawBody } = await this.forwardRequest(flowResult.request, targetUrl);
 
      record.response = response;
      record.durationMs = Date.now() - startTime;
      record.matchedFlowId = flowResult.matchedFlowId;
      this.requestStore.add(record);
      this.onRequest?.(record);
 
      this.sendResponse(clientRes, response, rawBody);
    } catch (error) {
      console.error('Request handling error:', error);
      clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
      clientRes.end('Proxy Error: ' + (error as Error).message);
    }
  }

  private async buildHttpRequest(
    id: string,
    req: http.IncomingMessage
  ): Promise<HttpRequest> {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) {
        headers[key] = Array.isArray(value) ? value.join(', ') : value;
      }
    }

    const body = await this.readBody(req);

    return {
      id,
      method: req.method || 'GET',
      url: req.url || '/',
      headers,
      body: body || undefined,
      timestamp: Date.now(),
      clientIp: req.socket.remoteAddress,
      clientPort: req.socket.remotePort,
    };
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve(body);
      });
      req.on('error', () => resolve(''));
    });
  }

  private async handleHttpsRequest(
    hostname: string,
    targetPort: number,
    clientReq: http.IncomingMessage,
    clientRes: http.ServerResponse
  ): Promise<void> {
    const startTime = Date.now();
    const requestId = uuidv4();

    try {
      const httpRequest = await this.buildHttpsHttpRequest(requestId, clientReq, hostname, targetPort);

      const record: RequestRecord = {
        id: requestId,
        request: httpRequest,
      };

      this.requestStore.add(record);
      this.onRequest?.(record);

      const flowResult = await this.flowEngine.processRequest(httpRequest);

      if (flowResult.response) {
        record.response = flowResult.response;
        record.durationMs = Date.now() - startTime;
        record.matchedFlowId = flowResult.matchedFlowId;
        this.requestStore.add(record);
        this.onRequest?.(record);

        this.sendResponse(clientRes, flowResult.response);
        return;
      }

      const targetUrl = new URL(flowResult.request.url);
      const { response, rawBody } = await this.forwardRequest(flowResult.request, targetUrl);
      
      record.response = response;
      record.durationMs = Date.now() - startTime;
      record.matchedFlowId = flowResult.matchedFlowId;
      this.requestStore.add(record);
      this.onRequest?.(record);
 
      this.sendResponse(clientRes, response, rawBody);
    } catch (error) {
      console.error('HTTPS MITM request handling error:', error);
      clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
      clientRes.end('HTTPS Proxy Error: ' + (error as Error).message);
    }
  }

  private async buildHttpsHttpRequest(
    id: string,
    req: http.IncomingMessage,
    hostname: string,
    targetPort: number
  ): Promise<HttpRequest> {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) {
        headers[key] = Array.isArray(value) ? value.join(', ') : value;
      }
    }

    const body = await this.readBody(req);
    const rawPath = req.url || '/';
    const pathWithSlash = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
    const portPart = targetPort && targetPort !== 443 ? `:${targetPort}` : '';
    const fullUrl = `https://${hostname}${portPart}${pathWithSlash}`;

    return {
      id,
      method: req.method || 'GET',
      url: fullUrl,
      headers,
      body: body || undefined,
      timestamp: Date.now(),
      clientIp: req.socket.remoteAddress,
      clientPort: req.socket.remotePort,
    };
  }

  private forwardRequest(
    httpRequest: HttpRequest,
    targetUrl: URL
  ): Promise<{ response: HttpResponse; rawBody: Buffer }> {
    return new Promise((resolve, reject) => {
      const isHttps = targetUrl.protocol === 'https:';
      const headers: Record<string, string> = { ...httpRequest.headers };
      // Remove hop-by-hop headers
      delete headers['proxy-connection'];
      delete headers['connection'];

      const options: http.RequestOptions = {
        hostname: targetUrl.hostname,
        port: targetUrl.port || (isHttps ? 443 : 80),
        path: targetUrl.pathname + targetUrl.search,
        method: httpRequest.method,
        headers,
      };

      const requester = isHttps ? https : http;
      const proxyReq = requester.request(options, (proxyRes) => {
        const responseHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(proxyRes.headers)) {
          if (value) {
            responseHeaders[key] = Array.isArray(value) ? value.join(', ') : value;
          }
        }

        const chunks: Buffer[] = [];
        proxyRes.on('data', (chunk) => chunks.push(chunk));
        proxyRes.on('end', () => {
          const buffer = Buffer.concat(chunks);

          // 根据内容类型和编码决定是否提供可读的 body 字符串
          const ct = responseHeaders['content-type'] || responseHeaders['Content-Type'] || '';
          const ce = responseHeaders['content-encoding'] || responseHeaders['Content-Encoding'];

          let body: string | undefined;
          const isTextLike =
            !ce && (
              ct.startsWith('text/') ||
              ct.includes('json') ||
              ct.includes('javascript') ||
              ct.includes('xml') ||
              ct.includes('x-www-form-urlencoded')
            );

          if (isTextLike) {
            body = buffer.toString('utf-8');
          } else {
            // 压缩或二进制内容：不提供 body 文本，仅用原始字节透传
            body = undefined;
          }

          resolve({
            response: {
              statusCode: proxyRes.statusCode || 200,
              statusMessage: proxyRes.statusMessage,
              headers: responseHeaders,
              body,
            },
            rawBody: buffer,
          });
        });
      });

      proxyReq.on('error', reject);

      if (httpRequest.body) {
        proxyReq.write(httpRequest.body);
      }
      proxyReq.end();
    });
  }

  private sendResponse(clientRes: http.ServerResponse, response: HttpResponse, rawBody?: Buffer): void {
    clientRes.writeHead(response.statusCode, response.statusMessage, response.headers);

    if (rawBody) {
      // 优先使用原始字节，保证二进制 / 压缩内容完全一致
      clientRes.write(rawBody);
    } else if (response.body) {
      // 只在明确是文本类且未压缩时才会有 body 字符串
      clientRes.write(response.body);
    }

    clientRes.end();
  }

  private async getOrCreateHttpsMitmPort(hostname: string, targetPort: number): Promise<number> {
    const existing = this.httpsMitmServers.get(hostname);
    if (existing) {
      return existing.port;
    }

    const { key, cert } = await this.certManager.getCertificateForHost(hostname);

    const server = https.createServer({ key, cert }, (req, res) => {
      this.handleHttpsRequest(hostname, targetPort, req, res);
    });

    const port = await new Promise<number>((resolve, reject) => {
      server.listen(0, () => {
        const address = server.address() as AddressInfo | null;
        if (!address || typeof address.port !== 'number') {
          reject(new Error('Failed to get HTTPS MITM server port'));
          return;
        }
        resolve(address.port);
      });
      server.on('error', (err) => {
        console.error('HTTPS MITM server error:', err);
        reject(err);
      });
    });

    this.httpsMitmServers.set(hostname, { server, port });
    return port;
  }

  private handleConnect(
    req: http.IncomingMessage,
    clientSocket: net.Socket,
    head: Buffer
  ): void {
    const [hostname, port] = (req.url || '').split(':');
    const targetPort = parseInt(port, 10) || 443;
    console.log('[ProxyEngine] CONNECT %s, targetPort=%d, httpsMitmEnabled=%s', req.url, targetPort, this.httpsMitmEnabled);

    if (!hostname || !this.httpsMitmEnabled) {
      // 回退到简单隧道模式
      const serverSocket = net.connect(targetPort, hostname, () => {
        clientSocket.write(
          'HTTP/1.1 200 Connection Established\r\n' +
          'Proxy-agent: FlowProxy\r\n' +
          '\r\n'
        );
        if (head && head.length) {
          serverSocket.write(head);
        }
        serverSocket.pipe(clientSocket);
        clientSocket.pipe(serverSocket);
      });

      serverSocket.on('error', (err) => {
        console.error('CONNECT tunnel error:', err);
        clientSocket.end();
      });

      clientSocket.on('error', (err) => {
        console.error('Client socket error:', err);
        serverSocket.end();
      });

      return;
    }

    // HTTPS MITM 模式
    (async () => {
      try {
        const mitmPort = await this.getOrCreateHttpsMitmPort(hostname, targetPort);

        clientSocket.write(
          'HTTP/1.1 200 Connection Established\r\n' +
          'Proxy-agent: FlowProxy\r\n' +
          '\r\n'
        );

        const mitmSocket = net.connect(mitmPort, '127.0.0.1', () => {
          if (head && head.length) {
            mitmSocket.write(head);
          }
          clientSocket.pipe(mitmSocket);
          mitmSocket.pipe(clientSocket);
        });

        mitmSocket.on('error', (err) => {
          console.error('HTTPS MITM socket error:', err);
          clientSocket.end();
        });

        clientSocket.on('error', (err) => {
          console.error('Client socket error (MITM):', err);
          mitmSocket.end();
        });
      } catch (error) {
        console.error('HTTPS MITM setup error:', error);
        try {
          clientSocket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        } catch {}
        clientSocket.end();
      }
    })();
  }
}
