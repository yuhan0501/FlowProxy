import {
  HttpRequest,
  HttpResponse,
  FlowDefinition,
  FlowNode,
  EntryNode,
  ComponentNode,
  ConditionNode,
  TerminatorNode,
  ComponentContext,
  ComponentResult,
} from '../../shared/models';
import { FlowStore } from '../store/flowStore';
import { ComponentStore } from '../store/componentStore';
import { executeBuiltinComponent } from '../components/builtins';
import { executeScriptComponent } from '../components/scriptRunner';

interface FlowProcessResult {
  request: HttpRequest;
  response?: HttpResponse;
  matchedFlowId?: string;
}

export class FlowEngine {
  private flowStore: FlowStore;
  private componentStore: ComponentStore;

  constructor(flowStore: FlowStore, componentStore: ComponentStore) {
    this.flowStore = flowStore;
    this.componentStore = componentStore;
  }

  async processRequest(request: HttpRequest): Promise<FlowProcessResult> {
    const flows = this.flowStore.getEnabled();
    const matchedFlow = this.findMatchingFlow(flows, request);

    if (!matchedFlow) {
      return { request };
    }

    return this.runFlow(matchedFlow, request, (msg) => {
      console.log(`[flow:${matchedFlow.id}] ${msg}`);
    });
  }

  // 调试单个 Flow，收集日志
  async debugFlow(flow: FlowDefinition, request: HttpRequest): Promise<{ result: FlowProcessResult; logs: string[] }> {
    const logs: string[] = [];
    const result = await this.runFlow(flow, request, (msg) => logs.push(msg));
    return { result, logs };
  }

  private async runFlow(
    flow: FlowDefinition,
    request: HttpRequest,
    logger?: (msg: string) => void,
  ): Promise<FlowProcessResult> {
    const ctx: ComponentContext = {
      request: { ...request },
      response: undefined,
      vars: {},
      log: (msg) => logger && logger(msg),
    };

    const entryNode = this.findEntryNode(flow);
    if (!entryNode) {
      return { request, matchedFlowId: flow.id };
    }

    let currentNodeId: string | null = entryNode.id;

    while (currentNodeId) {
      const node = this.getNode(flow, currentNodeId);
      if (!node) break;

      switch (node.type) {
        case 'entry':
          currentNodeId = this.getNextNodeId(flow, node.id);
          break;

        case 'component': {
          const componentNode = node as ComponentNode;
          const result = await this.executeComponentNode(componentNode, ctx);

          if (result.request) {
            ctx.request = result.request;
          }
          if (result.response) {
            ctx.response = result.response;
          }
          if (result.vars) {
            ctx.vars = { ...ctx.vars, ...result.vars };
          }
          if (result.terminate) {
            return {
              request: ctx.request,
              response: ctx.response,
              matchedFlowId: flow.id,
            };
          }
          currentNodeId = this.getNextNodeId(flow, node.id);
          break;
        }

        case 'condition': {
          const conditionNode = node as ConditionNode;
          const result = this.evalCondition(conditionNode.expression, ctx);
          currentNodeId = this.getNextNodeIdByLabel(
            flow,
            node.id,
            result ? 'true' : 'false'
          );
          break;
        }

        case 'terminator': {
          const terminatorNode = node as TerminatorNode;
          if (terminatorNode.mode === 'end_with_response' && ctx.response) {
            return {
              request: ctx.request,
              response: ctx.response,
              matchedFlowId: flow.id,
            };
          }
          return {
            request: ctx.request,
            matchedFlowId: flow.id,
          };
        }
      }
    }

    return {
      request: ctx.request,
      response: ctx.response,
      matchedFlowId: flow.id,
    };
  }

  private findMatchingFlow(
    flows: FlowDefinition[],
    request: HttpRequest
  ): FlowDefinition | null {
    for (const flow of flows) {
      const entryNode = this.findEntryNode(flow);
      if (entryNode && this.matchesRule(request, entryNode.match)) {
        return flow;
      }
    }
    return null;
  }

  private matchesRule(
    request: HttpRequest,
    rule: EntryNode['match']
  ): boolean {
    // Check method
    if (rule.methods && rule.methods.length > 0) {
      if (!rule.methods.includes(request.method)) {
        return false;
      }
    }

    // Check host pattern
    if (rule.hostPatterns && rule.hostPatterns.length > 0) {
      try {
        const url = new URL(request.url);
        const hostMatched = rule.hostPatterns.some((pattern) =>
          this.matchWildcard(url.hostname, pattern)
        );
        if (!hostMatched) {
          return false;
        }
      } catch {
        return false;
      }
    }

    // Check path pattern
    if (rule.pathPatterns && rule.pathPatterns.length > 0) {
      try {
        const url = new URL(request.url);
        const pathMatched = rule.pathPatterns.some((pattern) =>
          this.matchWildcard(url.pathname, pattern)
        );
        if (!pathMatched) {
          return false;
        }
      } catch {
        return false;
      }
    }

    return true;
  }

  private matchWildcard(str: string, pattern: string): boolean {
    if (pattern === '*') return true;
    
    // Convert wildcard pattern to regex
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(str);
  }

  private findEntryNode(flow: FlowDefinition): EntryNode | null {
    const node = flow.nodes.find((n) => n.type === 'entry');
    return node as EntryNode | null;
  }

  private getNode(flow: FlowDefinition, nodeId: string): FlowNode | null {
    return flow.nodes.find((n) => n.id === nodeId) || null;
  }

  private getNextNodeId(flow: FlowDefinition, fromNodeId: string): string | null {
    const edge = flow.edges.find((e) => e.from === fromNodeId);
    return edge?.to || null;
  }

  private getNextNodeIdByLabel(
    flow: FlowDefinition,
    fromNodeId: string,
    label: string
  ): string | null {
    const edge = flow.edges.find(
      (e) => e.from === fromNodeId && e.conditionLabel === label
    );
    return edge?.to || null;
  }

  private async executeComponentNode(
    node: ComponentNode,
    ctx: ComponentContext
  ): Promise<ComponentResult> {
    const componentDef = this.componentStore.getById(node.componentId);
    if (!componentDef) {
      console.error(`Component not found: ${node.componentId}`);
      return {};
    }

    try {
      if (componentDef.type === 'builtin') {
        return await executeBuiltinComponent(
          componentDef.internalName!,
          node.config,
          ctx
        );
      } else {
        return await executeScriptComponent(
          componentDef.scriptCode!,
          node.config,
          ctx
        );
      }
    } catch (error) {
      console.error(`Component execution error:`, error);
      return {};
    }
  }

  private evalCondition(expression: string, ctx: ComponentContext): boolean {
    try {
      // 简单的条件评估（生产环境应该使用沙盒）
      const fn = new Function('ctx', `return ${expression}`);
      return Boolean(fn(ctx));
    } catch (error) {
      console.error('Condition evaluation error:', error);
      return false;
    }
  }
}
