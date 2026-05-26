import { describe, expect, it } from 'vitest';
import { shouldCheckForUpdates } from './auto-updater.mjs';

describe('shouldCheckForUpdates', () => {
  it('returns false when the app is not packaged', () => {
    expect(shouldCheckForUpdates({ isPackaged: false, isOnline: true })).toBe(false);
  });

  it('returns false when offline', () => {
    expect(shouldCheckForUpdates({ isPackaged: true, isOnline: false })).toBe(false);
  });

  it('returns true when packaged and online', () => {
    expect(shouldCheckForUpdates({ isPackaged: true, isOnline: true })).toBe(true);
  });
});
