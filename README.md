# Meitre MCP Server

MCP server for Meitre restaurant reservation API.

## Architecture

```
MCP Client                    MCP Server                     Meitre API
(Claude)                      (Cloudflare Workers)           (api.meitre.com)
    │                              │                              │
    │── username/password/restaurant ▶│                              │
    │                              │── Bearer token ──────────────▶│
    │                              │◀─────── response ─────────────│
    │◀────── tool result ──────────│                              │
```

## Design principles

- **Stateless credentials** - Client sends user/pass on every request (plain headers)
- **Cached tokens only** - Server caches bearer token, not credentials
- **All tools exposed** - Tool selection is client's responsibility
- **Simple first** - No rate limiting, no API keys, no OAuth dance

## Authentication flow

1. MCP client sends `username`, `password`, `restaurant` headers
2. Server extracts credentials, hashes them for cache key
3. Check D1 for cached bearer token (keyed by `hash(user+restaurant)`)
4. If missing → call Meitre login, cache token
5. Use bearer token for Meitre API
6. On 401 → refresh token and retry

## Token caching (D1)

```sql
CREATE TABLE meitre_tokens (
  cache_key TEXT PRIMARY KEY,  -- hash(user+restaurant)
  token TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

No expiry tracking - just retry on 401 (lazy refresh).

## MCP client config

```json
{
  "mcpServers": {
    "meitre": {
      "url": "https://meitre.mcp.example.com/mcp",
      "headers": {
        "username": "user@example.com",
        "password": "secret",
        "restaurant": "restaurant-id"
      }
    }
  }
}
```

## Reference files

- `meitre.ts` - Original tool implementation from gori/supabase
- `toolsUtils.ts` - Tool utilities

## Differences from google-mcp

| Aspect | google-mcp | meitre-mcp |
|--------|------------|------------|
| Auth | OAuth flow → API key | Plain headers on every request |
| Credential storage | Encrypted in D1 | None (only cached tokens) |
| Setup | Web UI flow | Just configure headers |
| Complexity | Higher | Lower |
