# CAR-79: Vim-style Keyboard Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small set of Vim-style keyboard shortcuts to the web (DesktopApp) layout, gated so they never fire while typing in form fields.

**Architecture:** A single `useKeyboardShortcuts` hook installs one `keydown` listener on `window`, takes a declarative `bindings` array plus an `enabled` flag, and supports two-key prefix sequences (`g _`) with a 1500ms timeout. `DesktopApp` calls the hook twice — once always-on for `Esc` (allowed in inputs) and once gated for the rest. `WebTransactions` calls it again for page-local `j`/`k`/`e`/`/` bindings. A new `Shortcuts.jsx` overlay shows the cheatsheet, modeled on `CommandPalette.jsx`. Period-nav handlers reuse the existing `goToPreviousPeriod` / `goToNextPeriod` store actions; **no store changes are needed.**

**Tech Stack:** React 19, Vite, Vitest, @testing-library/react (already installed), JS (`.jsx` for components, `.mjs` for plain modules and tests).

---

## File Structure

| Status | Path | Responsibility |
|---|---|---|
| NEW | `src/renderer/hooks/useKeyboardShortcuts.js` | Reusable hook: window keydown listener, input filtering, single-key + two-key prefix matching, enabled gate |
| NEW | `src/renderer/hooks/useKeyboardShortcuts.test.mjs` | Vitest unit tests for the hook |
| NEW | `src/renderer/components/Shortcuts.jsx` | `<ShortcutsOverlay onClose />` modal listing all bindings, grouped GLOBAL / NAVIGATION / TRANSACTIONS |
| MOD | `src/renderer/App.jsx` | Wire `cheatsheetOpen` state, replace inline Cmd+K effect with two `useKeyboardShortcuts` calls, render `<ShortcutsOverlay>` |
| MOD | `src/renderer/screens/web/WebTransactions.jsx` | Add `selectedIdx` + `searchRef`, register TX-only bindings, render selection styling and scroll-into-view |

**Not modified:** `src/renderer/store.jsx` — the spec called for new `prevPeriod` / `nextPeriod` actions, but `goToPreviousPeriod` / `goToNextPeriod` already exist (lines 516-522) and are exposed in the provider value. Reuse them directly.

---

## Task 1: Create `useKeyboardShortcuts` hook with single-key support (TDD)

**Files:**
- Create: `src/renderer/hooks/useKeyboardShortcuts.js`
- Test: `src/renderer/hooks/useKeyboardShortcuts.test.mjs`

- [ ] **Step 1: Write the failing test for single-key matching**

Create `src/renderer/hooks/useKeyboardShortcuts.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/hooks/useKeyboardShortcuts.test.mjs`
Expected: FAIL — file `useKeyboardShortcuts.js` does not exist.

- [ ] **Step 3: Write minimal hook implementation**

Create `src/renderer/hooks/useKeyboardShortcuts.js`:

```js
import React from 'react';

function isEditable(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable === true;
}

export default function useKeyboardShortcuts({ enabled = true, bindings = [] }) {
  const bindingsRef = React.useRef(bindings);
  bindingsRef.current = bindings;

  const enabledRef = React.useRef(enabled);
  enabledRef.current = enabled;

  React.useEffect(() => {
    const onKey = (e) => {
      if (!enabledRef.current) return;
      const editable = isEditable(e.target);
      for (const b of bindingsRef.current) {
        if (b.keys !== e.key) continue;
        if (editable && !b.allowInInput) continue;
        e.preventDefault();
        b.handler(e);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/hooks/useKeyboardShortcuts.test.mjs`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/hooks/useKeyboardShortcuts.js src/renderer/hooks/useKeyboardShortcuts.test.mjs
git commit -m "CAR-79: scaffold useKeyboardShortcuts hook with single-key support"
```

---

## Task 2: Add input-focus filtering and `allowInInput` opt-in

**Files:**
- Modify: `src/renderer/hooks/useKeyboardShortcuts.test.mjs`
- Modify: `src/renderer/hooks/useKeyboardShortcuts.js` (already correct — tests verify existing behavior)

- [ ] **Step 1: Add failing tests for input filtering**

Append to `src/renderer/hooks/useKeyboardShortcuts.test.mjs` inside the `describe` block:

```js
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
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run src/renderer/hooks/useKeyboardShortcuts.test.mjs`
Expected: PASS — 7 tests. (The hook already implements the filter; these tests pin the behavior.)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/hooks/useKeyboardShortcuts.test.mjs
git commit -m "CAR-79: cover input-focus filtering and allowInInput opt-in"
```

---

## Task 3: Add two-key prefix sequence support (`g d` etc.)

**Files:**
- Modify: `src/renderer/hooks/useKeyboardShortcuts.test.mjs`
- Modify: `src/renderer/hooks/useKeyboardShortcuts.js`

- [ ] **Step 1: Add failing tests for two-key sequences**

Append to `src/renderer/hooks/useKeyboardShortcuts.test.mjs` inside the `describe` block:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/hooks/useKeyboardShortcuts.test.mjs`
Expected: FAIL on the four new tests.

- [ ] **Step 3: Update hook to support two-key prefixes**

Replace the contents of `src/renderer/hooks/useKeyboardShortcuts.js` with:

```js
import React from 'react';

const PREFIX_TIMEOUT_MS = 1500;

function isEditable(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable === true;
}

function splitKeys(keys) {
  const parts = keys.split(' ');
  return parts.length === 2 ? parts : null;
}

export default function useKeyboardShortcuts({ enabled = true, bindings = [] }) {
  const bindingsRef = React.useRef(bindings);
  bindingsRef.current = bindings;

  const enabledRef = React.useRef(enabled);
  enabledRef.current = enabled;

  const prefixRef = React.useRef(null);
  const timerRef = React.useRef(null);

  React.useEffect(() => {
    const clearPrefix = () => {
      prefixRef.current = null;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const findBinding = (keys, editable) => {
      for (const b of bindingsRef.current) {
        if (b.keys !== keys) continue;
        if (editable && !b.allowInInput) continue;
        return b;
      }
      return null;
    };

    const isPrefix = (key) => {
      for (const b of bindingsRef.current) {
        const pair = splitKeys(b.keys);
        if (pair && pair[0] === key) return true;
      }
      return false;
    };

    const onKey = (e) => {
      if (!enabledRef.current) {
        clearPrefix();
        return;
      }
      const editable = isEditable(e.target);

      if (prefixRef.current) {
        const combined = prefixRef.current + ' ' + e.key;
        const match = findBinding(combined, editable);
        clearPrefix();
        if (match) {
          e.preventDefault();
          match.handler(e);
          return;
        }
      }

      const single = findBinding(e.key, editable);
      if (single) {
        e.preventDefault();
        single.handler(e);
        return;
      }

      if (!editable && isPrefix(e.key)) {
        prefixRef.current = e.key;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(clearPrefix, PREFIX_TIMEOUT_MS);
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearPrefix();
    };
  }, []);
}
```

- [ ] **Step 4: Run all hook tests**

Run: `npx vitest run src/renderer/hooks/useKeyboardShortcuts.test.mjs`
Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/hooks/useKeyboardShortcuts.js src/renderer/hooks/useKeyboardShortcuts.test.mjs
git commit -m "CAR-79: support two-key prefix sequences with 1500ms timeout"
```

---

## Task 4: Build `<ShortcutsOverlay>` cheatsheet component

**Files:**
- Create: `src/renderer/components/Shortcuts.jsx`

- [ ] **Step 1: Write the component**

Create `src/renderer/components/Shortcuts.jsx`:

```jsx
import React from 'react';
import { A } from '../theme';

const SECTIONS = [
  {
    title: 'GLOBAL',
    items: [
      ['?',           'Toggle this cheatsheet'],
      ['Esc',         'Close any open modal'],
      ['n',           'New transaction'],
      ['[ / ]',       'Previous / next period'],
      ['Cmd/Ctrl+K',  'Command palette'],
    ],
  },
  {
    title: 'NAVIGATION',
    items: [
      ['g d', 'Go to dashboard'],
      ['g t', 'Go to transactions'],
      ['g a', 'Go to accounts'],
      ['g b', 'Go to budgets'],
      ['g r', 'Go to reports'],
      ['g i', 'Go to investments'],
    ],
  },
  {
    title: 'TRANSACTIONS',
    items: [
      ['j / k', 'Select previous / next row'],
      ['e',     'Edit selected transaction'],
      ['/',     'Focus search'],
    ],
  },
];

export default function ShortcutsOverlay({ onClose }) {
  const onBackdropMouseDown = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      onMouseDown={onBackdropMouseDown}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
        paddingTop: '15vh',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        style={{
          width: 'min(560px, 90vw)',
          background: A.bg,
          border: '2px solid ' + A.ink,
          fontFamily: A.font,
          color: A.ink,
          padding: '20px 24px',
        }}
      >
        <div style={{
          fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase',
          color: A.muted, marginBottom: 16,
        }}>
          Keyboard Shortcuts
        </div>

        {SECTIONS.map(section => (
          <div key={section.title} style={{ marginBottom: 18 }}>
            <div style={{
              fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase',
              color: A.muted, marginBottom: 8,
              borderBottom: '1px solid ' + A.rule2, paddingBottom: 4,
            }}>
              {section.title}
            </div>
            <dl style={{ margin: 0 }}>
              {section.items.map(([key, label]) => (
                <div key={key} style={{
                  display: 'flex', alignItems: 'baseline',
                  fontSize: 12, padding: '4px 0',
                }}>
                  <dt style={{
                    width: 110, flexShrink: 0,
                    color: A.ink, fontWeight: 600,
                  }}>{key}</dt>
                  <dd style={{ margin: 0, color: A.ink2 }}>{label}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}

        <div style={{
          borderTop: '1px solid ' + A.rule2,
          paddingTop: 8, marginTop: 4,
          fontSize: 9, letterSpacing: 1, color: A.muted,
          textTransform: 'uppercase',
        }}>
          esc to close
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/Shortcuts.jsx
git commit -m "CAR-79: add ShortcutsOverlay cheatsheet component"
```

---

## Task 5: Wire shortcuts into `DesktopApp` (App.jsx)

**Files:**
- Modify: `src/renderer/App.jsx`

- [ ] **Step 1: Add imports**

In `src/renderer/App.jsx`, find the line:
```js
import CommandPalette from './components/CommandPalette';
```
and add directly after it:
```js
import ShortcutsOverlay from './components/Shortcuts';
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts';
```

- [ ] **Step 2: Replace the inline Cmd+K effect with two `useKeyboardShortcuts` calls and add cheatsheet state**

In `DesktopApp` (around line 163), the current state block looks like:
```js
const [page, setPage] = React.useState('dashboard');
const [showIO, setShowIO] = React.useState(false);
const [showAdd, setShowAdd] = React.useState(false);
const [paletteOpen, setPaletteOpen] = React.useState(false);
const { exportBackup, recordBackupTaken } = useStore();
```

Replace it with:
```js
const [page, setPage] = React.useState('dashboard');
const [showIO, setShowIO] = React.useState(false);
const [showAdd, setShowAdd] = React.useState(false);
const [paletteOpen, setPaletteOpen] = React.useState(false);
const [cheatsheetOpen, setCheatsheetOpen] = React.useState(false);
const {
  exportBackup, recordBackupTaken,
  goToPreviousPeriod, goToNextPeriod,
} = useStore();
```

**KEEP** the existing `React.useEffect` Cmd+K block UNCHANGED. The Cmd+K palette toggle stays in its own effect (it already handles modifier matching, editable-target, and preventDefault correctly — folding it into the new hook would consume bare `k` keystrokes because the hook calls `e.preventDefault()` before the handler).

Immediately AFTER the existing Cmd+K `useEffect`, add:

```js
const closeTopOverlay = React.useCallback(() => {
  if (cheatsheetOpen) { setCheatsheetOpen(false); return; }
  if (paletteOpen)    { setPaletteOpen(false);    return; }
  if (showAdd)        { setShowAdd(false);        return; }
  if (showIO)         { setShowIO(false);         return; }
}, [cheatsheetOpen, paletteOpen, showAdd, showIO]);

const anyOverlayOpen = cheatsheetOpen || paletteOpen || showAdd || showIO;

const escBindings = React.useMemo(() => [
  { keys: 'Escape', handler: closeTopOverlay, allowInInput: true },
], [closeTopOverlay]);

useKeyboardShortcuts({ bindings: escBindings });

const globalBindings = React.useMemo(() => [
  { keys: '?',      handler: () => setCheatsheetOpen(v => !v) },
  { keys: 'n',      handler: () => setShowAdd(true) },
  { keys: '[',      handler: goToPreviousPeriod },
  { keys: ']',      handler: goToNextPeriod },
  { keys: 'g d',    handler: () => setPage('dashboard') },
  { keys: 'g t',    handler: () => setPage('tx') },
  { keys: 'g a',    handler: () => setPage('accounts') },
  { keys: 'g b',    handler: () => setPage('budgets') },
  { keys: 'g r',    handler: () => setPage('reports') },
  { keys: 'g i',    handler: () => setPage('investments') },
], [goToPreviousPeriod, goToNextPeriod]);

useKeyboardShortcuts({ enabled: !anyOverlayOpen, bindings: globalBindings });
```

The final order in `DesktopApp` is:

1. State (including `cheatsheetOpen`)
2. `useStore()` destructuring (now includes `goToPreviousPeriod`, `goToNextPeriod`)
3. Existing Cmd+K `useEffect` (unchanged)
4. `closeTopOverlay` callback
5. `anyOverlayOpen` const
6. Esc hook (always-on)
7. Global bindings hook (gated by `!anyOverlayOpen`)
8. Existing `commands` `useMemo` (unchanged)

- [ ] **Step 3: Render `<ShortcutsOverlay>`**

In the JSX `return` of `DesktopApp`, find the block:
```jsx
{paletteOpen && (
  <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />
)}
```
and add directly after it:
```jsx
{cheatsheetOpen && (
  <ShortcutsOverlay onClose={() => setCheatsheetOpen(false)} />
)}
```

- [ ] **Step 4: Smoke-test build**

Run: `npm run build`
Expected: Vite build completes without errors.

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: PASS — all existing tests + 11 hook tests.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/App.jsx
git commit -m "CAR-79: wire keyboard shortcuts and cheatsheet into DesktopApp"
```

---

## Task 6: Add j/k/e/// bindings to `WebTransactions`

**Files:**
- Modify: `src/renderer/screens/web/WebTransactions.jsx`

- [ ] **Step 1: Add imports and selection state**

In `src/renderer/screens/web/WebTransactions.jsx`:

1. Add to the imports at the top (alongside the existing React import):
```js
import useKeyboardShortcuts from '../../hooks/useKeyboardShortcuts';
```

2. Inside the component, just below the existing `useState` hooks for `filter` / `search` / `editTx`, add:
```js
const [selectedIdx, setSelectedIdx] = React.useState(0);
const searchRef = React.useRef(null);
const rowRefs = React.useRef({});
```

3. Below the line that defines `visible`, add a reset effect:
```js
React.useEffect(() => {
  setSelectedIdx(0);
}, [visible.length, visible[0]?.id]);
```

4. Add a scroll-into-view effect:
```js
React.useEffect(() => {
  const tx = visible[selectedIdx];
  if (!tx) return;
  const el = rowRefs.current[tx.id];
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'nearest' });
  }
}, [selectedIdx, visible]);
```

- [ ] **Step 2: Register the TX-only bindings**

After the scroll effect, add:
```js
const txBindings = React.useMemo(() => [
  { keys: 'j', handler: () => setSelectedIdx(i => Math.min(i + 1, Math.max(0, visible.length - 1))) },
  { keys: 'k', handler: () => setSelectedIdx(i => Math.max(0, i - 1)) },
  { keys: 'e', handler: () => {
      const tx = visible[selectedIdx];
      if (tx) setEditTx(tx);
    } },
  { keys: '/', handler: () => searchRef.current?.focus() },
], [visible, selectedIdx]);

useKeyboardShortcuts({ bindings: txBindings });
```

- [ ] **Step 3: Attach the search ref**

Find the search `<input>` element and add `ref={searchRef}` to its props.

- [ ] **Step 4: Style the selected row and attach row refs**

Find the row map (`visible.map((tx, i) => ...)`). On the rendered row element:
- Add `ref={el => { if (el) rowRefs.current[tx.id] = el; else delete rowRefs.current[tx.id]; }}`
- Add `aria-selected={i === selectedIdx ? 'true' : 'false'}`
- Merge into the row's `style`: `borderLeft: i === selectedIdx ? '2px solid ' + A.ink : '2px solid transparent'`

If the row map's index parameter is currently named differently (e.g. omitted), add `, i` so the index is in scope.

- [ ] **Step 5: Smoke-test build**

Run: `npm run build`
Expected: Vite build completes without errors.

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/screens/web/WebTransactions.jsx
git commit -m "CAR-79: add j/k/e/slash bindings and selection styling to WebTransactions"
```

---

## Task 7: Manual verification

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Verify each binding**

In the running app (desktop layout), confirm:

- `?` toggles the cheatsheet overlay.
- `Esc` closes the cheatsheet, then the palette, then the add modal, then the I/O sheet — in that priority.
- `n` opens the add-transaction modal.
- `[` and `]` move the selected period back and forward.
- `g d`, `g t`, `g a`, `g b`, `g r`, `g i` switch pages within 1.5s of the prefix.
- `g x` (no-match) does nothing harmful and a fresh `x` press is processed normally.
- On the Transactions page: `j` and `k` move the highlight, with a 2px left border on the selected row that scrolls into view.
- `e` on a selected row opens the edit modal.
- `/` focuses the search input and the slash itself does not appear in the field.
- Typing in any input never fires a shortcut except `Esc`.
- `Cmd/Ctrl+K` still toggles the command palette.

- [ ] **Step 3: Commit if any fixes were needed**

```bash
git add -A
git commit -m "CAR-79: manual verification fixes"
```
(Skip if no changes.)

---

## Acceptance Criteria

- [ ] All bindings in the spec table work on the relevant pages.
- [ ] No shortcut fires while the active element is `<input>`, `<textarea>`, or `[contenteditable]`, except `Esc`.
- [ ] `?` toggles a modal listing every binding, grouped GLOBAL / NAVIGATION / TRANSACTIONS.
- [ ] `j` / `k` selection in the TX list shows a 2px left border, sets `aria-selected`, and scrolls into view.
- [ ] `e` on a selected row opens the edit modal pre-populated with that TX.
- [ ] Two-key `g _` sequences time out after 1.5s.
- [ ] Existing `Cmd/Ctrl+K` palette toggle still works.
- [ ] All Vitest tests pass (`npx vitest run`).
