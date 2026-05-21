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

test('two registers with same batchKey within window coalesce', () => {
  let t = 0;
  const stack = createUndoStack({ batchWindowMs: 1500, now: () => t });
  const log = [];
  stack.register({
    label: '1 deleted',
    batchKey: 'deleteTx',
    pluralize: (n) => `${n} deleted`,
    do: () => log.push('do1'),
    undo: () => log.push('undo1'),
  });
  t = 1000; // within window
  stack.register({
    label: '1 deleted',
    batchKey: 'deleteTx',
    pluralize: (n) => `${n} deleted`,
    do: () => log.push('do2'),
    undo: () => log.push('undo2'),
  });
  // Both do() calls ran during register
  expect(log).toEqual(['do1', 'do2']);
  // Coalesced into one fresh entry with count 2 and pluralized label
  expect(stack.current().entry.count).toBe(2);
  expect(stack.current().entry.label).toBe('2 deleted');
  // Single undo restores both, in reverse order
  stack.undo();
  expect(log).toEqual(['do1', 'do2', 'undo2', 'undo1']);
});

test('registers outside the batch window do not coalesce', () => {
  let t = 0;
  const stack = createUndoStack({ batchWindowMs: 1500, now: () => t });
  const log = [];
  stack.register({ label: 'A', batchKey: 'deleteTx', do: () => {}, undo: () => log.push('A') });
  t = 2000; // outside window
  stack.register({ label: 'B', batchKey: 'deleteTx', do: () => {}, undo: () => log.push('B') });
  stack.undo();
  expect(log).toEqual(['B']);
  stack.undo();
  expect(log).toEqual(['B', 'A']);
});

test('batchKey null never coalesces even within window', () => {
  let t = 0;
  const stack = createUndoStack({ batchWindowMs: 1500, now: () => t });
  const log = [];
  stack.register({ label: 'A', batchKey: null, do: () => {}, undo: () => log.push('A') });
  t = 100;
  stack.register({ label: 'B', batchKey: null, do: () => {}, undo: () => log.push('B') });
  stack.undo(); // should pop B only
  expect(log).toEqual(['B']);
  stack.undo(); // pops A
  expect(log).toEqual(['B', 'A']);
});

test('different batchKeys never coalesce', () => {
  let t = 0;
  const stack = createUndoStack({ batchWindowMs: 1500, now: () => t });
  const log = [];
  stack.register({ label: 'A', batchKey: 'deleteTx', do: () => {}, undo: () => log.push('A') });
  t = 100;
  stack.register({ label: 'B', batchKey: 'deleteAccount', do: () => {}, undo: () => log.push('B') });
  stack.undo();
  stack.undo();
  expect(log).toEqual(['B', 'A']);
});

test('maxSize bounds the undo stack with FIFO eviction', () => {
  const stack = createUndoStack({ maxSize: 3 });
  const undone = [];
  for (let i = 0; i < 5; i++) {
    stack.register({ label: String(i), do: () => {}, undo: () => undone.push(i) });
  }
  // Only the last 3 entries (2, 3, 4) remain
  stack.undo();
  stack.undo();
  stack.undo();
  expect(undone).toEqual([4, 3, 2]);
  // Fourth undo is a no-op
  stack.undo();
  expect(undone).toEqual([4, 3, 2]);
});

test('subscribe fires on register/undo/redo/dismissCurrent and unsubscribe stops fires', () => {
  const stack = createUndoStack();
  let count = 0;
  const unsub = stack.subscribe(() => { count += 1; });
  stack.register({ label: 'A', do: () => {}, undo: () => {} });
  stack.undo();
  stack.redo();
  stack.dismissCurrent(); // current is null after redo, so this is a no-op
  expect(count).toBe(3);
  unsub();
  stack.register({ label: 'B', do: () => {}, undo: () => {} });
  expect(count).toBe(3); // no further increments after unsubscribe
});

test('dismissCurrent clears fresh without disturbing stacks', () => {
  const stack = createUndoStack();
  const log = [];
  stack.register({ label: 'A', do: () => {}, undo: () => log.push('A') });
  expect(stack.current()).not.toBeNull();
  stack.dismissCurrent();
  expect(stack.current()).toBeNull();
  // Stack still works
  stack.undo();
  expect(log).toEqual(['A']);
});
