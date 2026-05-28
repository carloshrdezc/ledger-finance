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

  it('does NOT fire single-key binding when target is <input>', () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({
      bindings: [{ keys: 'n', handler }],
    }));
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireKey('n', input);
    expect(handler).not.toHaveBeenCalled();
  });

  it('does NOT fire single-key binding when target is <textarea>', () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({
      bindings: [{ keys: 'n', handler }],
    }));
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    fireKey('n', ta);
    expect(handler).not.toHaveBeenCalled();
  });

  it('does NOT fire when target has contenteditable', () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({
      bindings: [{ keys: 'n', handler }],
    }));
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    Object.defineProperty(div, 'isContentEditable', { value: true });
    document.body.appendChild(div);
    fireKey('n', div);
    expect(handler).not.toHaveBeenCalled();
  });

  it('fires binding with allowInInput: true even inside <input>', () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({
      bindings: [{ keys: 'Escape', handler, allowInInput: true }],
    }));
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireKey('Escape', input);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('fires two-key binding when prefix and key are pressed in order', () => {
    vi.useFakeTimers();
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({
      bindings: [{ keys: 'g d', handler }],
    }));
    fireKey('g');
    fireKey('d');
    expect(handler).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('clears prefix after 1500ms timeout (no fire)', () => {
    vi.useFakeTimers();
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({
      bindings: [{ keys: 'g d', handler }],
    }));
    fireKey('g');
    vi.advanceTimersByTime(1600);
    fireKey('d');
    expect(handler).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('non-matching second key clears prefix and is processed fresh', () => {
    vi.useFakeTimers();
    const gd = vi.fn();
    const x = vi.fn();
    renderHook(() => useKeyboardShortcuts({
      bindings: [
        { keys: 'g d', handler: gd },
        { keys: 'x', handler: x },
      ],
    }));
    fireKey('g');
    fireKey('x');
    expect(gd).not.toHaveBeenCalled();
    expect(x).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('repeated prefix re-arms the timeout', () => {
    vi.useFakeTimers();
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({
      bindings: [{ keys: 'g d', handler }],
    }));
    fireKey('g');
    vi.advanceTimersByTime(1000);
    fireKey('g');
    vi.advanceTimersByTime(1000);
    fireKey('d');
    expect(handler).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
