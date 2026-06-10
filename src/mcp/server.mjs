/**
 * @file Ledger local MCP server (CAR-352).
 *
 * A standalone, read-only Model Context Protocol server over the Ledger disk
 * store. Speaks MCP's JSON-RPC 2.0 over stdio (newline-delimited messages on
 * stdin/stdout), implementing `initialize`, `tools/list`, and `tools/call`.
 * No SDK dependency — the wire format is small and stable.
 *
 * Data source: the Electron app persists state to
 * `<userData>/ledger-state.json` (plaintext). This server reads that file and
 * answers queries via the pure queryEngine. When the store is ENCRYPTED
 * (security enabled — `ledger-encrypted.json` present), the server cannot
 * decrypt without the passphrase and every tool reports a `locked` error
 * instead of data.
 *
 * Usage:
 *   node src/mcp/server.mjs                  # auto-detect <userData>/ledger-state.json
 *   node src/mcp/server.mjs --state PATH     # explicit state file (testing / custom)
 *
 * Read-only by design: there are no mutating tools.
 */

import { readFile, access } from 'fs/promises';
import path from 'path';
import os from 'os';
import process from 'process';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { QUERY_DESCRIPTORS, getCurrency } from './queryEngine.mjs';

const SERVER_NAME = 'ledger-local';
const SERVER_VERSION = '1.0.0';
const PROTOCOL_VERSION = '2024-11-05';

/**
 * Resolve the Electron `userData` directory for an app name per-platform.
 * userData is `<appData>/<appName>`. NOTE: Electron derives the app name from
 * `app.getName()`, which in a PACKAGED build is the `productName` ("LEDGER"),
 * but in dev is the package `name` ("ledger-finance"). loadState() tries both.
 */
export function defaultUserDataDir(appName = 'LEDGER', platform = process.platform, home = os.homedir()) {
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', appName);
  if (platform === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), appName);
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), appName);
}

// App-name candidates in priority order: packaged productName first, then the
// dev package name. Whichever directory actually holds a store wins.
const APP_NAME_CANDIDATES = ['LEDGER', 'ledger-finance'];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--state') out.state = argv[++i];
    else if (argv[i] === '--userData') out.userData = argv[++i];
  }
  return out;
}

/**
 * Load the store state. Returns { state } on success, or { locked:true } when
 * the store is encrypted, or { state:{} } when nothing exists yet.
 *
 * @param {{statePath?:string, userDataDir?:string}} opts
 */
export async function loadState({ statePath, userDataDir } = {}) {
  // Explicit plaintext file: read it directly. NOTE: this bypasses the
  // encrypted-store check, so pointing --state at a stale plaintext left over
  // from before security was enabled will serve outdated data with no "locked"
  // signal. Documented in README; explicit-flag escape hatch for power users.
  if (statePath) {
    return readPlainOrEmpty(statePath);
  }

  // Candidate userData dirs: an explicit --userData, else the per-platform dirs
  // for both the packaged productName ("LEDGER") and the dev name
  // ("ledger-finance"). Pick the first that holds a store.
  const dirs = userDataDir
    ? [userDataDir]
    : APP_NAME_CANDIDATES.map(name => defaultUserDataDir(name));

  for (const dir of dirs) {
    const plain = path.join(dir, 'ledger-state.json');
    const encrypted = path.join(dir, 'ledger-encrypted.json');
    const hasPlain = await exists(plain);
    const hasEnc = await exists(encrypted);
    if (hasEnc && !hasPlain) return { locked: true };
    if (hasPlain) return readPlainOrEmpty(plain);
    // neither in this dir → try the next candidate
  }
  return { state: {} };
}

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function readPlainOrEmpty(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return { state: parsed && typeof parsed === 'object' ? parsed : {} };
  } catch (err) {
    if (err && err.code === 'ENOENT') return { state: {} };
    throw err;
  }
}

/**
 * Build the MCP tool definitions from the query descriptors. Each query becomes
 * a tool; list_transactions/spending_by_category/budget_status take filter args.
 */
export function buildToolList() {
  const dateRange = {
    from: { type: 'string', description: 'Inclusive start date (YYYY-MM-DD).' },
    to: { type: 'string', description: 'Inclusive end date (YYYY-MM-DD).' },
  };
  const schemas = {
    list_transactions: {
      type: 'object',
      properties: {
        ...dateRange,
        category: { type: 'string' },
        merchant: { type: 'string' },
        type: { type: 'string', enum: ['expense', 'income', 'all'] },
        minAmount: { type: 'number' },
        maxAmount: { type: 'number' },
        limit: { type: 'number' },
      },
    },
    spending_by_category: { type: 'object', properties: { ...dateRange, limit: { type: 'number' } } },
    budget_status: { type: 'object', properties: { ...dateRange } },
  };
  return QUERY_DESCRIPTORS.map(d => ({
    name: d.name,
    description: d.description,
    inputSchema: schemas[d.name] || { type: 'object', properties: {} },
  }));
}

const DESCRIPTOR_BY_NAME = new Map(QUERY_DESCRIPTORS.map(d => [d.name, d]));

/**
 * Dispatch a tools/call. Returns the MCP `content` result object.
 *
 * @param {string} name
 * @param {Object} args
 * @param {{statePath?:string, userDataDir?:string}} loadOpts
 */
export async function callTool(name, args = {}, loadOpts = {}) {
  const descriptor = DESCRIPTOR_BY_NAME.get(name);
  if (!descriptor) {
    return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
  }
  const loaded = await loadState(loadOpts);
  if (loaded.locked) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Ledger store is encrypted/locked. Unlock the app or disable security to query it.' }],
    };
  }
  const result = descriptor.fn(loaded.state, args);
  const payload = { currency: getCurrency(loaded.state), ...result };
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

/**
 * Handle a single JSON-RPC request object, returning a response object (or null
 * for notifications that need no reply).
 */
export async function handleRpc(msg, loadOpts = {}) {
  const { id, method, params } = msg || {};
  const reply = (result) => ({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

  switch (method) {
    case 'initialize':
      return reply({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });
    case 'notifications/initialized':
      return null; // notification — no reply
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: buildToolList() });
    case 'tools/call': {
      const name = params?.name;
      const args = params?.arguments || {};
      try {
        return reply(await callTool(name, args, loadOpts));
      } catch (err) {
        // Per MCP, tool-execution failures surface as an isError content block
        // (a successful JSON-RPC result), not a protocol-level error.
        return reply({ isError: true, content: [{ type: 'text', text: `Tool execution failed: ${err?.message || err}` }] });
      }
    }
    default:
      if (id === undefined) return null; // unknown notification
      return fail(-32601, `Method not found: ${method}`);
  }
}

/** Start the stdio server loop. */
export function startServer(loadOpts = {}) {
  const rl = createInterface({ input: process.stdin, terminal: false });
  const send = (obj) => { if (obj) process.stdout.write(JSON.stringify(obj) + '\n'); };
  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }
    try {
      send(await handleRpc(msg, loadOpts));
    } catch (err) {
      send({ jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32603, message: String(err?.message || err) } });
    }
  });
}

// Only auto-start when run directly (not when imported by tests).
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
const selfPath = fileURLToPath(import.meta.url);
if (invoked && invoked === selfPath) {
  const args = parseArgs(process.argv.slice(2));
  startServer({ statePath: args.state, userDataDir: args.userData });
}
