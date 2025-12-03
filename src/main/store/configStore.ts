import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { AppConfig } from '../../shared/models';

const DEFAULT_CONFIG: AppConfig = {
  proxyPort: 8888,
  maxRequestRecords: 2000,
  logLevel: 'info',
  httpsMitmEnabled: false,
};

export class ConfigStore {
  private configPath: string;
  private config: AppConfig;

  constructor() {
    const userDataPath = app?.getPath('userData') || path.join(process.env.HOME || '', '.flowproxy');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    this.configPath = path.join(userDataPath, 'config.json');
    this.config = this.loadConfig();
  }

  private loadConfig(): AppConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }
    return { ...DEFAULT_CONFIG };
  }

  getConfig(): AppConfig {
    return { ...this.config };
  }

  saveConfig(config: Partial<AppConfig>): void {
    this.config = { ...this.config, ...config };
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
  }
}
