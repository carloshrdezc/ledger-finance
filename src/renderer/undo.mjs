// In-memory undo/redo stack. Pure (no React).
// See docs/superpowers/specs/2026-05-21-car-81-undo-redo-design.md

export function createUndoStack({
  maxSize = 50,
  batchWindowMs = 1500,
  now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
} = {}) {
  const undoStack = [];
  const redoStack = [];
  let fresh = null; // { entry, mode: 'undo' | 'redo' } | null
  const listeners = new Set();
  let nextId = 1;

  const notify = () => listeners.forEach(fn => fn());

  function register({ label = '', do: doFn, undo: undoFn, batchKey = null, pluralize = null }) {
    if (typeof doFn !== 'function' || typeof undoFn !== 'function') {
      throw new Error('register requires do and undo functions');
    }
    doFn();
    redoStack.length = 0;

    const top = undoStack[undoStack.length - 1];
    const canCoalesce =
      top &&
      batchKey != null &&
      top.batchKey === batchKey &&
      now() - top.createdAt <= batchWindowMs;

    if (canCoalesce) {
      const prevDo = top.do;
      const prevUndo = top.undo;
      top.do = () => { prevDo(); doFn(); };
      top.undo = () => { undoFn(); prevUndo(); };
      top.count += 1;
      top.createdAt = now();
      if (pluralize) top.label = pluralize(top.count);
      fresh = { entry: top, mode: 'undo' };
    } else {
      const entry = {
        id: nextId++,
        label,
        do: doFn,
        undo: undoFn,
        batchKey,
        count: 1,
        createdAt: now(),
      };
      undoStack.push(entry);
      while (undoStack.length > maxSize) undoStack.shift();
      fresh = { entry, mode: 'undo' };
    }
    notify();
  }

  function undo() {
    const entry = undoStack.pop();
    if (!entry) return;
    entry.undo();
    redoStack.push(entry);
    fresh = { entry, mode: 'redo' };
    notify();
  }

  function redo() {
    const entry = redoStack.pop();
    if (!entry) {
      if (fresh !== null) {
        fresh = null;
        notify();
      }
      return;
    }
    entry.do();
    undoStack.push(entry);
    fresh = null;
    notify();
  }

  function current() {
    return fresh;
  }

  function dismissCurrent() {
    if (fresh === null) return;
    fresh = null;
    notify();
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { register, undo, redo, current, dismissCurrent, subscribe };
}
