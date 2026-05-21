// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import useKeyboardShortcuts from './useKeyboardShortcuts.js';

afterEach(() => {
  document.body.innerHTML = '';
});

function fireKey(key, target = window) {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'target', { value: target, configurable: true });
  window.dispatchEvent(ev);
  return ev;
}

describe('useKeyboardShortcuts', () => {
  it('fires single-key binding on key match', () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({
      bindings: [{ keys: 'n', handler }],
    }));
    fireKey('n');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not fire when key does not match any binding', () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({
      bindings: [{ keys: 'n', handler }],
    }));
    fireKey('m');
    expect(handler).not.toHaveBeenCalled();
  });

  it('enabled: false suppresses all bindings', () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({
      enabled: false,
      bindings: [{ keys: 'n', handler }],
    }));
    fireKey('n');
    expect(handler).not.toHaveBeenCalled();
  });
});
