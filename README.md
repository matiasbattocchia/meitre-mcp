# Meitre MCP Server

A hosted [MCP](https://modelcontextprotocol.io) server that connects AI assistants to [Meitre](https://meitre.com), a restaurant reservation platform. It lets you check availability, search reservations, book, reschedule, and cancel — all through natural language.

## Setup

Add this to your MCP client config (Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "meitre": {
      "url": "https://meitre.mcp.openbsp.dev/mcp",
      "headers": {
        "username": "your-meitre-email",
        "password": "your-meitre-password"
      }
    }
  }
}
```

That's it. If your account has a single restaurant, it's detected automatically. For multi-restaurant accounts, add the `restaurant` header — use the `list_restaurants` tool to find the identifier.

## Tools

| Tool | Description |
|------|-------------|
| `list_restaurants` | List restaurants accessible to your account |
| `fetch_options` | Get areas, service types, and menus |
| `fetch_dates` | Available dates for the next 15 days |
| `fetch_timeslots` | Available times for a specific date |
| `search_reservations` | Find reservations by phone number |
| `book_reservation` | Book a new reservation |
| `reschedule_reservation` | Reschedule an existing reservation |
| `cancel_reservation` | Cancel a reservation |

## Development

```bash
npm install
npm run dev          # http://localhost:8787
npm run typecheck    # Type check
npm run deploy       # Deploy to Cloudflare
```
