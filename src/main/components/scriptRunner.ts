import { ComponentContext, ComponentResult } from '../../shared/models';

export async function executeScriptComponent(
  scriptCode: string,
  config: any,
  ctx: ComponentContext
): Promise<ComponentResult> {
  try {
    // 创建一个简单的沙盒环境
    // 注意：生产环境应该使用更安全的沙盒如 vm2 或 isolated-vm
    const sandbox = {
      config,
      ctx: {
        request: JSON.parse(JSON.stringify(ctx.request)),
        response: ctx.response ? JSON.parse(JSON.stringify(ctx.response)) : undefined,
        vars: { ...ctx.vars },
        log: ctx.log,
      },
      console: {
        log: (...args: any[]) => ctx.log(args.map(String).join(' ')),
        error: (...args: any[]) => ctx.log('[ERROR] ' + args.map(String).join(' ')),
      },
      setTimeout: undefined,
      setInterval: undefined,
      fetch: undefined,
      require: undefined,
    };

    // 包装脚本代码
    const wrappedCode = `
      (async function(config, ctx, console) {
        ${scriptCode}
        
        // 如果脚本导出了 run 函数
        if (typeof run === 'function') {
          return await run(config, ctx);
        }
        
        // 否则返回修改后的 ctx
        return {
          request: ctx.request,
          response: ctx.response,
          vars: ctx.vars,
        };
      })
    `;

    const fn = eval(wrappedCode);
    const result = await fn(sandbox.config, sandbox.ctx, sandbox.console);

    return {
      request: result?.request,
      response: result?.response,
      vars: result?.vars,
      terminate: result?.terminate,
    };
  } catch (error) {
    ctx.log(`[Script Error] ${(error as Error).message}`);
    throw error;
  }
}

// 组件调试执行器
export async function debugScriptComponent(
  scriptCode: string,
  config: any,
  ctx: ComponentContext
): Promise<{
  result: ComponentResult;
  logs: string[];
  error?: string;
}> {
  const logs: string[] = [];
  const debugCtx: ComponentContext = {
    ...ctx,
    request: JSON.parse(JSON.stringify(ctx.request)),
    response: ctx.response ? JSON.parse(JSON.stringify(ctx.response)) : undefined,
    vars: { ...ctx.vars },
    log: (msg) => logs.push(msg),
  };

  try {
    const result = await executeScriptComponent(scriptCode, config, debugCtx);
    return { result, logs };
  } catch (error) {
    return {
      result: {},
      logs,
      error: (error as Error).message,
    };
  }
}
