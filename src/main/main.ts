import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { ProxyEngine } from './proxy/proxyEngine';
import { RequestStore } from './store/requestStore';
import { FlowStore } from './store/flowStore';
import { ComponentStore } from './store/componentStore';
import { ConfigStore } from './store/configStore';
import { setupIpcHandlers } from './ipc/handlers';

let mainWindow: BrowserWindow | null = null;
let proxyEngine: ProxyEngine | null = null;

// 存储实例
const requestStore = new RequestStore();
const flowStore = new FlowStore();
const componentStore = new ComponentStore();
const configStore = new ConfigStore();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
  });

  // 开发环境加载 webpack dev server
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function initProxyEngine() {
  const config = configStore.getConfig();
  proxyEngine = new ProxyEngine({
    port: config.proxyPort,
    httpsMitmEnabled: config.httpsMitmEnabled ?? false,
    requestStore,
    flowStore,
    componentStore,
    onRequest: (record) => {
      // 通知渲染进程有新请求
      if (mainWindow) {
        mainWindow.webContents.send('requests:new', record);
      }
    },
  });
}

app.whenReady().then(() => {
  createWindow();
  initProxyEngine();
  
  // 设置 IPC 处理器
  setupIpcHandlers(ipcMain, {
    proxyEngine: proxyEngine!,
    requestStore,
    flowStore,
    componentStore,
    configStore,
    getMainWindow: () => mainWindow,
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (proxyEngine) {
    proxyEngine.stop();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (proxyEngine) {
    proxyEngine.stop();
  }
});
