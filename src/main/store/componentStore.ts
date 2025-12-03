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
