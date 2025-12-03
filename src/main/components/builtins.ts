import { ComponentContext, ComponentResult, HttpResponse } from '../../shared/models';

type BuiltinHandler = (
  config: any,
  ctx: ComponentContext
) => Promise<ComponentResult>;

const builtinHandlers: Record<string, BuiltinHandler> = {
  headerRewrite: async (config, ctx) => {
    const request = { ...ctx.request, headers: { ...ctx.request.headers } };

    // Set headers
    if (config.setHeaders) {
      for (const [key, value] of Object.entries(config.setHeaders)) {
        request.headers[key.toLowerCase()] = String(value);
      }
    }

    // Remove headers
    if (config.removeHeaders && Array.isArray(config.removeHeaders)) {
      for (const key of config.removeHeaders) {
        delete request.headers[key.toLowerCase()];
      }
    }

    ctx.log(`Header rewrite applied`);
    return { request };
  },

  mockResponse: async (config, ctx) => {
    const response: HttpResponse = {
      statusCode: config.statusCode || 200,
      statusMessage: config.statusMessage || 'OK',
      headers: {
        'content-type': config.contentType || 'application/json',
        ...config.headers,
      },
      body: config.body || '',
    };

    ctx.log(`Mock response: ${response.statusCode}`);
    return { response, terminate: true };
  },

  delay: async (config, ctx) => {
    const ms = config.ms || 1000;
    ctx.log(`Delaying for ${ms}ms`);
    await new Promise((resolve) => setTimeout(resolve, ms));
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
