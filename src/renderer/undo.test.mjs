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

test('redo replays the entry do() and moves it back to undo stack', () => {
  const stack = createUndoStack();
  const log = [];
  stack.register({ label: 'A', do: () => log.push('do'), undo: () => log.push('undo') });
  stack.undo();           // log: ['do', 'undo']
  stack.redo();           // log: ['do', 'undo', 'do']
  expect(log).toEqual(['do', 'undo', 'do']);
  // After redo, current is cleared (no third toast).
  expect(stack.current()).toBeNull();
  // Entry is back on the undo stack — undoing again works.
  stack.undo();
  expect(log).toEqual(['do', 'undo', 'do', 'undo']);
});

test('LIFO: three registers, three undos run in reverse order', () => {
  const stack = createUndoStack();
  const log = [];
  stack.register({ label: 'A', do: () => {}, undo: () => log.push('A') });
  stack.register({ label: 'B', do: () => {}, undo: () => log.push('B') });
  stack.register({ label: 'C', do: () => {}, undo: () => log.push('C') });
  stack.undo();
  stack.undo();
  stack.undo();
  expect(log).toEqual(['C', 'B', 'A']);
});

test('register clears the redo stack', () => {
  const stack = createUndoStack();
  const log = [];
  stack.register({ label: 'A', do: () => log.push('do-A'), undo: () => log.push('undo-A') });
  stack.undo();
  // Register B clears redo (A is no longer in the redo stack)
  stack.register({ label: 'B', do: () => log.push('do-B'), undo: () => log.push('undo-B') });
  // Now redo should be a no-op — A's do() must NOT run.
  stack.redo();
  // After register A: ['do-A']; after undo: ['do-A','undo-A']; after register B: ['do-A','undo-A','do-B']
  // After redo (no-op): unchanged.
  expect(log).toEqual(['do-A', 'undo-A', 'do-B']);
});

test('redo on empty stack is a no-op', () => {
  const stack = createUndoStack();
  expect(() => stack.redo()).not.toThrow();
});
