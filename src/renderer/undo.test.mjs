import { test, expect, vi } from 'vitest';
import { createUndoStack } from './undo.mjs';

test('register runs do() exactly once', () => {
  const stack = createUndoStack();
  const doFn = vi.fn();
  stack.register({ label: 'A', do: doFn, undo: () => {} });
  expect(doFn).toHaveBeenCalledTimes(1);
});

test('undo runs the entry undo() and clears current after', () => {
  const stack = createUndoStack();
  const undoFn = vi.fn();
  stack.register({ label: 'A', do: () => {}, undo: undoFn });
  expect(stack.current()?.mode).toBe('undo');
  stack.undo();
  expect(undoFn).toHaveBeenCalledTimes(1);
  expect(stack.current()?.mode).toBe('redo');
});

test('undo on empty stack is a no-op', () => {
  const stack = createUndoStack();
  expect(() => stack.undo()).not.toThrow();
  expect(stack.current()).toBeNull();
});
