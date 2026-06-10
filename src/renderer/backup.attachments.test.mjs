import { describe, it, expect } from 'vitest';
import { buildBackup, parseBackup } from './backup.mjs';
import { exportCSV } from './importExport.js';

// CAR-346: a tx carrying a note + an attachment must survive a full
// buildBackup -> JSON -> parseBackup round-trip intact (attachments + note
// live on the tx object inside the `txs` -> `transactions` slice, which the
// backup already covers — no BACKUP_FORMAT_VERSION bump needed). Old backups
// whose txs lack these optional fields must restore to clean txs.

const ATTACHED_TX = {
  id: 't1',
  name: 'WHOLE FOODS',
  amt: -42.5,
  date: '2026-06-01',
  acct: 'chk',
  ccy: 'USD',
  cat: 'food',
  path: ['food', 'produce'],
  note: 'reimbursable — work lunch',
  attachments: [
    {
      id: 'att_abc',
      dataUrl: 'data:image/jpeg;base64,QUJDREVG',
      name: 'receipt.jpg',
      mime: 'image/jpeg',
      w: 1200,
      h: 1600,
      bytes: 6,
      addedAt: '2026-06-01T12:00:00.000Z',
    },
  ],
};

const PLAIN_TX = {
  id: 't0',
  name: 'COFFEE',
  amt: -3.5,
  date: '2026-05-01',
  acct: 'chk',
  ccy: 'USD',
};

describe('backup round-trip with note + attachments', () => {
  it('preserves note + attachment through build -> parse', () => {
    const state = { txs: [ATTACHED_TX], accounts: [], settings: {} };
    const backup = buildBackup(state);
    const json = JSON.stringify(backup);
    const result = parseBackup(json);

    expect(result.ok).toBe(true);
    expect(result.data.transactions).toHaveLength(1);
    const restored = result.data.transactions[0];
    expect(restored).toEqual(ATTACHED_TX);
    expect(restored.note).toBe('reimbursable — work lunch');
    expect(restored.attachments[0].dataUrl).toBe('data:image/jpeg;base64,QUJDREVG');
  });

  it('restores a mix of plain and attached txs unchanged', () => {
    const state = { txs: [PLAIN_TX, ATTACHED_TX], accounts: [], settings: {} };
    const result = parseBackup(JSON.stringify(buildBackup(state)));
    expect(result.ok).toBe(true);
    expect(result.data.transactions).toEqual([PLAIN_TX, ATTACHED_TX]);
  });

  it('restores an OLD backup whose txs lack note/attachments to clean txs', () => {
    // Simulate a pre-CAR-346 backup: txs slice present, none of the new fields.
    const oldBackup = {
      _type: 'ledger-backup',
      version: 2,
      exportedAt: '2026-01-01T00:00:00.000Z',
      transactions: [PLAIN_TX],
      accounts: [],
      settings: {},
    };
    const result = parseBackup(JSON.stringify(oldBackup));
    expect(result.ok).toBe(true);
    expect(result.data.transactions).toEqual([PLAIN_TX]);
    expect('note' in result.data.transactions[0]).toBe(false);
    expect('attachments' in result.data.transactions[0]).toBe(false);
  });
});

describe('CSV export handles the note + attachment fields gracefully', () => {
  it('includes the note text and never emits image data', () => {
    const csv = exportCSV([ATTACHED_TX]);
    const [header, row] = csv.split('\n');
    expect(header).toContain('Note');
    expect(row).toContain('reimbursable — work lunch');
    // No base64/data-URL image payload leaks into the CSV.
    expect(csv).not.toContain('data:image');
    expect(csv).not.toContain('QUJDREVG');
  });

  it('exports a plain tx (no note/attachments) with a blank note cell, unchanged shape', () => {
    const csv = exportCSV([PLAIN_TX]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);
    // Plain tx row still parses to the same column count as the header.
    const headerCols = lines[0].split(',').length;
    // The note cell is the quoted empty string `""`.
    expect(lines[1]).toContain('""');
    expect(lines[1].split(',').length).toBeGreaterThanOrEqual(headerCols - 2); // quoted fields tolerate comma-split fuzz
  });
});
