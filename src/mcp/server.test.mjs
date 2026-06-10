import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, mkdtemp, rm } from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import {
  defaultUserDataDir,
  loadState,
  buildToolList,
  callTool,
  handleRpc,
} from './server.mjs';

const SERVER = fileURLToPath(new URL('./server.mjs', import.meta.url));

const STATE = {
  'ledger:currency': 'USD',
  'ledger:accounts': [{ id: 'chk', name: 'Checking', type: 'CHK', balance: 1000 }],
  'ledger:tx': [
    { id: 't1', name: 'Rent', amt: -2400, date: '2026-06-01', cat: 'housing', path: ['housing'], acct: 'chk' },
    { id: 't2', name: 'Salary', amt: 5000, date: '2026-06-05', cat: 'income', path: ['income'], acct: 'chk' },
  ],
  'ledger:budgets': [{ cat: 'housing', limit: 2000 }],
  'ledger:goals': [],
  'ledger:investments': [],
  'ledger:trades': [],
};

let dir, statePath, lockedDir;

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'ledger-mcp-'));
  statePath = path.join(dir, 'ledger-state.json');
  await writeFile(statePath, JSON.stringify(STATE));
  // a "locked" userData dir: encrypted store present, no plaintext
  lockedDir = await mkdtemp(path.join(os.tmpdir(), 'ledger-mcp-locked-'));
  await writeFile(path.join(lockedDir, 'ledger-encrypted.json'), JSON.stringify({ v: 1, ct: 'xxx' }));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  await rm(lockedDir, { recursive: true, force: true });
});

describe('defaultUserDataDir', () => {
  it('resolves per-platform app data paths', () => {
    // path.join uses the host OS separator, so assert on segments not literal slashes.
    const mac = defaultUserDataDir('ledger-finance', 'darwin', '/Users/x');
    expect(mac).toContain('Library');
    expect(mac).toContain('Application Support');
    expect(mac.endsWith(path.join('Application Support', 'ledger-finance'))).toBe(true);
    expect(defaultUserDataDir('ledger-finance', 'linux', '/home/x')).toMatch(/ledger-finance$/);
  });
});

describe('loadState', () => {
  it('loads plaintext state from an explicit path', async () => {
    const r = await loadState({ statePath });
    expect(r.state['ledger:currency']).toBe('USD');
  });

  it('returns empty state when the file is missing', async () => {
    const r = await loadState({ statePath: path.join(dir, 'nope.json') });
    expect(r.state).toEqual({});
  });

  it('reports locked when an encrypted store exists with no plaintext', async () => {
    const r = await loadState({ userDataDir: lockedDir });
    expect(r.locked).toBe(true);
  });
});

describe('buildToolList', () => {
  it('exposes a tool per query with an input schema', () => {
    const tools = buildToolList();
    expect(tools.length).toBeGreaterThanOrEqual(7);
    const names = tools.map(t => t.name);
    expect(names).toContain('list_transactions');
    expect(names).toContain('net_worth');
    const lt = tools.find(t => t.name === 'list_transactions');
    expect(lt.inputSchema.properties.category).toBeTruthy();
  });
});

describe('callTool', () => {
  it('answers a query against the state file', async () => {
    const res = await callTool('net_worth', {}, { statePath });
    const payload = JSON.parse(res.content[0].text);
    expect(payload.currency).toBe('USD');
    // accounts total: 1000 + (-2400 + 5000) = 3600; no investments
    expect(payload.netWorth).toBe(3600);
  });

  it('passes args through to filtering queries', async () => {
    const res = await callTool('list_transactions', { type: 'expense' }, { statePath });
    const payload = JSON.parse(res.content[0].text);
    expect(payload.count).toBe(1);
  });

  it('errors on an unknown tool', async () => {
    const res = await callTool('bogus', {}, { statePath });
    expect(res.isError).toBe(true);
  });

  it('reports locked for an encrypted store', async () => {
    const res = await callTool('net_worth', {}, { userDataDir: lockedDir });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/locked/i);
  });
});

describe('handleRpc', () => {
  it('responds to initialize with server info + protocol version', async () => {
    const r = await handleRpc({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    expect(r.result.serverInfo.name).toBe('ledger-local');
    expect(r.result.protocolVersion).toBeTruthy();
    expect(r.result.capabilities.tools).toBeTruthy();
  });

  it('lists tools', async () => {
    const r = await handleRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(r.result.tools.length).toBeGreaterThanOrEqual(7);
  });

  it('returns null for the initialized notification', async () => {
    const r = await handleRpc({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(r).toBeNull();
  });

  it('errors on an unknown method', async () => {
    const r = await handleRpc({ jsonrpc: '2.0', id: 3, method: 'nope/nope' });
    expect(r.error.code).toBe(-32601);
  });

  it('executes tools/call', async () => {
    const r = await handleRpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'account_balances' } }, { statePath });
    const payload = JSON.parse(r.result.content[0].text);
    expect(payload.total).toBe(3600);
  });
});

describe('stdio integration (spawned process)', () => {
  it('initializes, lists tools, and answers a query over real stdio', async () => {
    const responses = await new Promise((resolve, reject) => {
      const proc = spawn(process.execPath, [SERVER, '--state', statePath], { stdio: ['pipe', 'pipe', 'inherit'] });
      let buf = '';
      const out = [];
      const timer = setTimeout(() => { proc.kill(); reject(new Error('timeout')); }, 10000);
      proc.stdout.on('data', d => {
        buf += d.toString();
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line) out.push(JSON.parse(line));
          if (out.length === 3) { clearTimeout(timer); proc.kill(); resolve(out); }
        }
      });
      proc.on('error', reject);
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) + '\n');
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'net_worth' } }) + '\n');
    });
    expect(responses[0].result.serverInfo.name).toBe('ledger-local');
    expect(responses[1].result.tools.length).toBeGreaterThanOrEqual(7);
    const payload = JSON.parse(responses[2].result.content[0].text);
    expect(payload.netWorth).toBe(3600);
  });
});
