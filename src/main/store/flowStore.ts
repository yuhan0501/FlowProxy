import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { FlowDefinition } from '../../shared/models';

export class FlowStore {
  private flowsDir: string;
  private flows: Map<string, FlowDefinition> = new Map();

  constructor() {
    const userDataPath = app?.getPath('userData') || path.join(process.env.HOME || '', '.flowproxy');
    this.flowsDir = path.join(userDataPath, 'flows');
    this.ensureDir();
    this.loadFlows();
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.flowsDir)) {
      fs.mkdirSync(this.flowsDir, { recursive: true });
    }
  }

  private loadFlows(): void {
    try {
      const files = fs.readdirSync(this.flowsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.flowsDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const flow = JSON.parse(content) as FlowDefinition;
          this.flows.set(flow.id, flow);
        }
      }
    } catch (error) {
      console.error('Failed to load flows:', error);
    }

    // 如果没有流程，创建默认流程
    if (this.flows.size === 0) {
      this.createDefaultFlow();
    }
  }

  private createDefaultFlow(): void {
    const defaultFlow: FlowDefinition = {
      id: 'default-flow',
      name: 'Default Flow',
      enabled: false,
      nodes: [
        {
          id: 'entry-1',
          type: 'entry',
          name: 'Entry',
          position: { x: 100, y: 200 },
          match: {
            methods: ['GET', 'POST'],
            hostPatterns: ['*'],
          },
        },
        {
          id: 'term-1',
          type: 'terminator',
          name: 'Pass Through',
          position: { x: 400, y: 200 },
          mode: 'pass_through',
        },
      ],
      edges: [
        { id: 'e1', from: 'entry-1', to: 'term-1' },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.save(defaultFlow);
  }

  getAll(): FlowDefinition[] {
    return Array.from(this.flows.values());
  }

  getById(id: string): FlowDefinition | undefined {
    return this.flows.get(id);
  }

  getEnabled(): FlowDefinition[] {
    return this.getAll().filter(f => f.enabled);
  }

  save(flow: FlowDefinition): void {
    flow.updatedAt = Date.now();
    if (!flow.createdAt) {
      flow.createdAt = Date.now();
    }
    
    this.flows.set(flow.id, flow);
    
    const filePath = path.join(this.flowsDir, `${flow.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(flow, null, 2));
  }

  delete(id: string): void {
    this.flows.delete(id);
    const filePath = path.join(this.flowsDir, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  toggle(id: string, enabled: boolean): void {
    const flow = this.flows.get(id);
    if (flow) {
      flow.enabled = enabled;
      this.save(flow);
    }
  }
}
