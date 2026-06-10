# Ledger Local MCP Server (CAR-352)

A standalone, **read-only** [Model Context Protocol](https://modelcontextprotocol.io)
server over the Ledger disk store. It lets MCP-aware tools (Claude Desktop,
Cursor, custom agents) query your financial data **locally** — nothing leaves
your machine and the server can never modify the store.

## How it works

The Electron app persists its state to `<userData>/ledger-state.json`
(plaintext). This server reads that file and answers queries. It speaks MCP's
JSON-RPC 2.0 over **stdio** (newline-delimited messages), implementing
`initialize`, `tools/list`, and `tools/call`. No SDK dependency.

`<userData>` resolves per-platform. NOTE: a **packaged** install uses the
Electron `productName` (`LEDGER`); a dev run uses the package name
(`ledger-finance`). The server tries both and uses whichever holds a store.

| OS | Path (packaged / dev) |
|----|------|
| macOS | `~/Library/Application Support/{LEDGER,ledger-finance}/` |
| Windows | `%APPDATA%\{LEDGER,ledger-finance}\` |
| Linux | `~/.config/{LEDGER,ledger-finance}/` |

### Encrypted stores

If you've enabled security (the store is `ledger-encrypted.json`, no plaintext),
the server **cannot decrypt** without your passphrase. Every tool then returns a
`locked` error instead of data. Disable security or unlock the app to query.
(Passing `--state` at an explicit file bypasses this check — don't point it at a
stale plaintext left over from before you enabled security.)

## Running

```bash
npm run mcp                      # auto-detect <userData>/ledger-state.json
node src/mcp/server.mjs --state /path/to/ledger-state.json   # explicit file
node src/mcp/server.mjs --userData /path/to/userDataDir       # explicit dir
```

The server reads JSON-RPC requests on stdin and writes responses on stdout, so
it's normally launched by an MCP client rather than run by hand.

### Example: Claude Desktop / Cursor config

```json
{
  "mcpServers": {
    "ledger": {
      "command": "node",
      "args": ["/absolute/path/to/ledger-finance/src/mcp/server.mjs"]
    }
  }
}
```

## Tools

All tools are read-only and return a JSON text payload (amounts are in the
store's configured currency; no FX conversion is applied).

| Tool | Arguments | Returns |
|------|-----------|---------|
| `list_transactions` | `from`, `to`, `category`, `merchant`, `type` (expense/income/all), `minAmount`, `maxAmount`, `limit` | matching transactions + count + total |
| `account_balances` | — | per-account balance (`openingBal` + transactions), with `total` over accounts included in totals (archived + `includeInTotals:false` excluded) |
| `spending_by_category` | `from`, `to`, `limit` | expense totals grouped by top-level category |
| `budget_status` | `from`, `to` | each budget's limit vs actual spend, over-budget flags |
| `goals` | — | savings goals with progress toward target |
| `net_worth` | — | account-balance total (matches the app's headline figure; investment holdings are tracked as INV accounts, so the `ledger:investments` tracker value is reported separately as `holdingsTrackerValue`, not added) |
| `portfolio` | — | per-holding gain, allocation by asset class, cost-basis returns |

## Design notes

- **Read-only by construction** — there are no mutating tools, and the server
  opens the state file for reading only.
- **Pure query engine** — all logic lives in `queryEngine.mjs` (no I/O), so every
  query is unit-tested without spawning a process. `server.mjs` is the thin
  stdio/JSON-RPC shell.
- **Self-contained** — the portfolio query computes its own average-cost basis,
  so the MCP layer has no dependency on the renderer bundle.
