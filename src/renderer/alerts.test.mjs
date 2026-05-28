import { test, expect } from 'vitest';

import { buildAlertRows } from './alerts.mjs';

// CAR-77: the two pre-existing tests below pass `isAppEmpty: true` to
// suppress the new backup reminder alert. They're testing other alert
// categories (bills, budgets, accounts, goals, investments) and assert
// exact alert ID arrays via deepEqual, so without this opt-out the
// reminder would leak in via the default `isAppEmpty: false` and break
// those assertions. Don't remove these lines without updating the
// expected ID arrays accordingly.

test('buildAlertRows ranks overdue bills and overspent budgets first', () => {
  const alerts = buildAlertRows({
    isAppEmpty: true,
    billRows: [
      { key: 'rent|2026-05-01', name: 'RENT', amt: 2400, status: 'overdue', dueDate: '2026-05-01', type: 'expense' },
      { key: 'payroll|2026-05-16', name: 'PAYROLL', amt: 3800, status: 'upcoming', dueDate: '2026-05-16', type: 'income' },
    ],
    budgetRows: [
      { cat: 'food', label: 'GROCERIES', spent: 360, available: 300, left: -60 },
      { cat: 'subs', label: 'SUBSCRIPTIONS', spent: 92, available: 100, left: 8 },
    ],
    goals: [],
    accountsWithBalance: [],
    investments: [],
  }, '2026-05-15');

  expect(alerts.map(a => a.id)).toEqual([
    'bill:rent|2026-05-01',
    'budget:food:over',
    'budget:subs:near',
  ]);
  expect(alerts[0].severity).toBe('critical');
  expect(alerts[0].kind).toBe('bill');
  expect(alerts[1].metric).toBe('120%');
});

test('buildAlertRows supports due bills, low cash, goal gaps, investment drops, and dismissals', () => {
  const alerts = buildAlertRows({
    isAppEmpty: true,
    billRows: [
      { key: 'electric|2026-05-15', name: 'ELECTRIC', amt: 112, status: 'due', dueDate: '2026-05-15', type: 'expense' },
    ],
    budgetRows: [],
    goals: [
      { id: 'g1', name: 'EMERGENCY', target: 1000, current: 200 },
    ],
    accountsWithBalance: [
      { id: 'chk', name: 'CHECKING', type: 'CHK', balance: -25, ccy: 'USD' },
      { id: 'amex', name: 'AMEX', type: 'CC', balance: -80, ccy: 'USD' },
    ],
    investments: [
      { ticker: 'VTI', name: 'VANGUARD TOTAL MKT', chg: -3.2, shares: 4, price: 100 },
    ],
    dismissedAlertIds: ['goal:g1:behind'],
  }, '2026-05-15');

  expect(alerts.map(a => a.id)).toEqual([
    'account:chk:negative',
    'bill:electric|2026-05-15',
    'investment:VTI:drop',
  ]);
  expect(alerts.find(a => a.id === 'bill:electric|2026-05-15').severity).toBe('high');
  expect(alerts.some(a => a.id === 'goal:g1:behind')).toBe(false);
});

test('buildAlertRows emits backup reminder when last backup is older than the interval', () => {
  const alerts = buildAlertRows({
    isAppEmpty: false,
    lastBackupAt: '2026-04-01',
    backupReminderInterval: 30,
    backupReminderSnoozedUntil: null,
  }, '2026-05-15'); // 44 days later
  const reminder = alerts.find(a => a.id === 'backup:reminder');
  expect(reminder).toBeTruthy();
  expect(reminder.kind).toBe('backup');
  expect(reminder.severity).toBe('low');
  expect(reminder.action).toBe('BACKUP');
  expect(reminder.route).toBe('settings');
});

test('buildAlertRows emits backup reminder when no backup has ever been taken', () => {
  const alerts = buildAlertRows({
    isAppEmpty: false,
    lastBackupAt: null,
    backupReminderInterval: 30,
    backupReminderSnoozedUntil: null,
  }, '2026-05-15');
  expect(alerts.find(a => a.id === 'backup:reminder')).toBeTruthy();
});

test('buildAlertRows skips backup reminder when isAppEmpty is true', () => {
  const alerts = buildAlertRows({
    isAppEmpty: true,
    lastBackupAt: null,
    backupReminderInterval: 30,
    backupReminderSnoozedUntil: null,
  }, '2026-05-15');
  expect(alerts.find(a => a.id === 'backup:reminder')).toBeUndefined();
});

test('buildAlertRows skips backup reminder when interval is 0 (Off)', () => {
  const alerts = buildAlertRows({
    isAppEmpty: false,
    lastBackupAt: null,
    backupReminderInterval: 0,
    backupReminderSnoozedUntil: null,
  }, '2026-05-15');
  expect(alerts.find(a => a.id === 'backup:reminder')).toBeUndefined();
});

test('buildAlertRows skips backup reminder while snoozed', () => {
  const alerts = buildAlertRows({
    isAppEmpty: false,
    lastBackupAt: null,
    backupReminderInterval: 30,
    backupReminderSnoozedUntil: '2026-06-01', // future
  }, '2026-05-15');
  expect(alerts.find(a => a.id === 'backup:reminder')).toBeUndefined();
});

test('buildAlertRows re-emits backup reminder once snooze date passes', () => {
  const alerts = buildAlertRows({
    isAppEmpty: false,
    lastBackupAt: null,
    backupReminderInterval: 30,
    backupReminderSnoozedUntil: '2026-05-01', // past
  }, '2026-05-15');
  expect(alerts.find(a => a.id === 'backup:reminder')).toBeTruthy();
});

test('buildAlertRows skips backup reminder when last backup is fresh', () => {
  const alerts = buildAlertRows({
    isAppEmpty: false,
    lastBackupAt: '2026-05-10',
    backupReminderInterval: 30,
    backupReminderSnoozedUntil: null,
  }, '2026-05-15'); // 5 days later
  expect(alerts.find(a => a.id === 'backup:reminder')).toBeUndefined();
});

// CAR-77 boundary tests added during code review (see commit body).

test('buildAlertRows suppresses backup reminder on the snooze date itself (>= semantics)', () => {
  const alerts = buildAlertRows({
    isAppEmpty: false,
    lastBackupAt: null,
    backupReminderInterval: 30,
    backupReminderSnoozedUntil: '2026-05-15', // === todayIso
  }, '2026-05-15');
  expect(alerts.find(a => a.id === 'backup:reminder')).toBeUndefined();
});

test('buildAlertRows emits backup reminder exactly at the interval boundary (days === interval)', () => {
  const alerts = buildAlertRows({
    isAppEmpty: false,
    lastBackupAt: '2026-04-15',
    backupReminderInterval: 30,
    backupReminderSnoozedUntil: null,
  }, '2026-05-15'); // exactly 30 days
  const reminder = alerts.find(a => a.id === 'backup:reminder');
  expect(reminder).toBeTruthy();
  expect(reminder.detail).toBe('LAST BACKUP 30 DAYS AGO');
});

test('buildAlertRows treats malformed lastBackupAt as no-record (no NaN leakage)', () => {
  const alerts = buildAlertRows({
    isAppEmpty: false,
    lastBackupAt: 'not a date',
    backupReminderInterval: 30,
    backupReminderSnoozedUntil: null,
  }, '2026-05-15');
  const reminder = alerts.find(a => a.id === 'backup:reminder');
  expect(reminder).toBeTruthy();
  expect(reminder.detail).toBe('NO BACKUP ON RECORD');
  expect(String(reminder.detail)).not.toContain('NaN');
});

test('buildAlertRows treats future lastBackupAt as no-record (clock skew safety)', () => {
  const alerts = buildAlertRows({
    isAppEmpty: false,
    lastBackupAt: '2027-01-01',
    backupReminderInterval: 30,
    backupReminderSnoozedUntil: null,
  }, '2026-05-15');
  const reminder = alerts.find(a => a.id === 'backup:reminder');
  expect(reminder).toBeTruthy();
  expect(reminder.detail).toBe('NO BACKUP ON RECORD');
});
