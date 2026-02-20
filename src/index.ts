import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { MeitreAPI } from './lib/meitre.ts';
import { handleMcpRequest, type McpHttpRequest } from './mcp/server.ts';

type Bindings = Env & {
  ENCRYPTION_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// CORS for MCP clients
app.use('/mcp', cors());

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// MCP endpoint
app.post('/mcp', async (c) => {
  const username = c.req.header('username');
  const password = c.req.header('password');
  const restaurant = c.req.header('restaurant');

  if (!username || !password) {
    return c.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32001,
          message: 'Missing required headers: username, password',
        },
      },
      401
    );
  }

  let request: McpHttpRequest;
  try {
    request = await c.req.json();
  } catch {
    return c.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      },
      400
    );
  }

  const api = new MeitreAPI({ username, password, restaurant: restaurant || undefined }, c.env.DB, c.env.ENCRYPTION_KEY);
  const response = await handleMcpRequest(request, { api, hasHeaderRestaurant: !!restaurant });

  return c.json(response);
});

// Catch-all for /mcp non-POST
app.all('/mcp', (c) => {
  return c.json(
    {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32601, message: 'Method not allowed. Use POST.' },
    },
    405
  );
});

export default app;
