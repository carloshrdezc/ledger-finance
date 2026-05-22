// In-memory undo/redo stack. Pure (no React).
// See docs/superpowers/specs/2026-05-21-car-81-undo-redo-design.md

export function createUndoStack({
  maxSize = 50,
  batchWindowMs = 1500,
  now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
} = {}) {
  const undoStack = [];
  const redoStack = [];
  // `fresh` is the "currently displayable" toast entry. The `version` field
  // bumps on every register()/undo() call so React effects (e.g. UndoToast's
  // 5s auto-dismiss timer) can detect coalesced re-registrations even when
  // the underlying entry's id and mode are unchanged.
  let fresh = null; // { entry, mode: 'undo' | 'redo', version } | null
  let freshVersion = 0;
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
      fresh = { entry: top, mode: 'undo', version: ++freshVersion };
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
      fresh = { entry, mode: 'undo', version: ++freshVersion };
    }
    notify();
  }

  function undo() {
    const entry = undoStack.pop();
    if (!entry) return;
    entry.undo();
    redoStack.push(entry);
    fresh = { entry, mode: 'redo', version: ++freshVersion };
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
