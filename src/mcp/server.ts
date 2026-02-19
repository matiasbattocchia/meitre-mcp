import { z } from 'zod';
import { tools, type ToolName, type ToolContext } from './tools.ts';

export interface McpHttpRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

export interface McpHttpResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export async function handleMcpRequest(
  request: McpHttpRequest,
  context: ToolContext
): Promise<McpHttpResponse> {
  try {
    if (request.method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'meitre-mcp',
            version: '0.1.0',
          },
          capabilities: {
            tools: {},
          },
        },
      };
    }

    if (request.method === 'tools/list') {
      const toolList = Object.entries(tools).map(([name, tool]) => ({
        name,
        description: tool.description,
        inputSchema: z.toJSONSchema(tool.parameters),
      }));

      return {
        jsonrpc: '2.0',
        id: request.id,
        result: { tools: toolList },
      };
    }

    if (request.method === 'tools/call') {
      const params = request.params as { name: string; arguments?: Record<string, unknown> };
      const toolName = params.name as ToolName;
      const tool = tools[toolName];

      if (!tool) {
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: `Unknown tool: ${toolName}`,
          },
        };
      }

      const args = params.arguments ?? {};

      // Tool arg `restaurant` only applies if the header didn't already set one
      if (!context.hasHeaderRestaurant && typeof args.restaurant === 'string' && args.restaurant) {
        context.api.setRestaurant(args.restaurant);
      }

      const toolParams = tool.parameters.parse(args);
      const result = await tool.execute(context, toolParams as any);

      const structuredContent = Array.isArray(result) ? { items: result } : result;

      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
          structuredContent,
        },
      };
    }

    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32601,
        message: `Method not found: ${request.method}`,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32603,
        message,
      },
    };
  }
}
