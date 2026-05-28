# CAR-79: Vim-style keyboard shortcuts (web app)

**Date:** 2026-05-20
**Linear:** CAR-79
**Branch:** `car-79-keyboard-shortcuts`
**Pairs with:** CAR-78 (command palette) — palette is discovery; shortcuts are muscle memory.

## Problem

The web (DesktopApp) layout has zero keyboard shortcuts beyond browser defaults. Period navigation, page switching, and transaction list interaction all require the mouse.

## Goal

A small, memorable set of single-key (and two-key Vim-style) bindings that cover the 80% of daily web-app interactions, gated so they never fire while the user is typing.

## Scope

Web (`DesktopApp`) only. Mobile is touch-first and explicitly out of scope.

## Bindings

| Key | Action | Scope |
|---|---|---|
| `?` | Toggle cheatsheet overlay | Global |
| `Esc` | Close any open modal / sheet / cheatsheet | Global, allowed in inputs |
| `n` | Open `WebAddModal` | Global |
| `[` / `]` | Previous / next period | Global |
| `g d` | Go to dashboard | Global (two-key) |
| `g t` | Go to transactions | Global (two-key) |
| `g a` | Go to accounts | Global (two-key) |
| `g b` | Go to budgets | Global (two-key) |
| `g r` | Go to reports | Global (two-key) |
| `g i` | Go to investments | Global (two-key) |
| `j` / `k` | Move selection down / up in TX list | TX page only |
| `e` | Edit currently selected TX | TX page only |
| `/` | Focus search input | TX page only |

Existing `Cmd/Ctrl+K` (command palette) is folded into the same hook so all bindings live in one place.

### Input-focus rule

Shortcuts are ignored when the active element is `<input>`, `<textarea>`, or has `[contenteditable]`. Only `Esc` (and any binding that opts in via `allowInInput: true`) fires while typing.

### Two-key sequences

`g _` is the only prefix in this set. Implementation:

- A `pendingPrefix` ref tracks the most recent prefix key.
- Pressing the prefix sets it and starts a 1500ms timeout.
- The next keypress is matched against `prefix + key`. On match, the handler fires and the prefix is cleared. On no-match, the prefix is silently cleared and the second key is treated as a fresh keypress.
- Timeout expires → prefix cleared, no action.

## Architecture

### `src/renderer/hooks/useKeyboardShortcuts.js` (new)

```js
useKeyboardShortcuts({ enabled = true, bindings })
```

`bindings` is an array of:

```js
{
  keys: 'n' | '[' | 'g d' | 'Escape',
  handler: (e) => void,
  allowInInput?: boolean,    // default false; Esc sets true
}
```

The hook installs one `keydown` listener on `window` and:
1. If `!enabled`, ignores everything.
2. Resolves whether the event target is editable.
3. If editable and the matching binding does not opt in, skips.
4. Handles single-key bindings on direct match.
5. Handles prefix bindings: if the key matches a known prefix, store it and start the 1500ms timeout. Otherwise check for a `prefix + key` binding.
6. Calls `e.preventDefault()` before invoking the handler.

The hook returns nothing.

### `src/renderer/components/Shortcuts.jsx` (new)

Exports `<ShortcutsOverlay onClose />`. Modal styled like `CommandPalette` (centered, `A.bg2` background, 2px `A.ink` border, IBM Plex Mono). Three sections rendered as definition lists:

- **GLOBAL** — `?`, `Esc`, `n`, `[` / `]`, `Cmd/Ctrl+K`
- **NAVIGATION** — `g d`, `g t`, `g a`, `g b`, `g r`, `g i`
- **TRANSACTIONS** — `j` / `k`, `e`, `/`

Closes on `Esc` or click outside (handled by the global Esc binding).

### `src/renderer/store.jsx` (modify)

Add two actions to the store value object:

- `prevPeriod()` — `setSelectedPeriod(p => addMonths(p, -1))`
- `nextPeriod()` — `setSelectedPeriod(p => addMonths(p, 1))`

`WebTransactions.jsx` already does this inline; it refactors to the store actions so the keyboard handler doesn't need to know about `addMonths`.

### `src/renderer/App.jsx` (modify)

In `DesktopApp`:

- Add `const [cheatsheetOpen, setCheatsheetOpen] = React.useState(false);`
- Replace the inline `Cmd+K` `useEffect` with a `useKeyboardShortcuts` call covering all global bindings plus `Cmd/Ctrl+K`. Bindings are passed as a memoized array.
- Render `<ShortcutsOverlay onClose={() => setCheatsheetOpen(false)} />` when `cheatsheetOpen`.
- The `Esc` handler closes whichever overlay is currently open: cheatsheet → palette → add modal → I/O sheet, in that priority order.

### `src/renderer/screens/web/WebTransactions.jsx` (modify)

- Add `const [selectedIdx, setSelectedIdx] = React.useState(0);`
- Add a ref to the search input: `const searchRef = React.useRef(null);`
- Add a reset effect:
  ```js
  React.useEffect(() => { setSelectedIdx(0); }, [visible.length, visible[0]?.id]);
  ```
- Call `useKeyboardShortcuts` with TX-only bindings:
  - `j` → `setSelectedIdx(i => Math.min(i + 1, visible.length - 1))`
  - `k` → `setSelectedIdx(i => Math.max(i - 1, 0))`
  - `e` → `setEditTx(visible[selectedIdx])` if a row exists
  - `/` → `searchRef.current?.focus()` (handler must `preventDefault` so `/` doesn't appear in the input)
- The selected row gets `borderLeft: '2px solid ' + A.ink` and `aria-selected="true"`. Row also scrolls into view via `scrollIntoView({ block: 'nearest' })` when `selectedIdx` changes.

## Data flow

```
window keydown
  → useKeyboardShortcuts handler
    → editable-target check
    → binding match (single or prefix+key)
      → handler invoked
        → setState in component / store action
          → React re-render
```

No new global state. `cheatsheetOpen` is local to `DesktopApp`. `selectedIdx` is local to `WebTransactions`. Period actions live in the store (alongside the existing `selectedPeriod`).

## Error handling / edge cases

- **Two `g` presses:** second `g` re-arms the prefix and resets the timeout.
- **`g` then a non-matching key:** prefix silently cleared. The non-matching key is processed as a normal keypress.
- **Prefix timeout while modal is open:** harmless; the modal blocks shortcut firing because `enabled` is false at that level (see below).
- **Multiple modals:** Esc handler walks the priority order so only the topmost overlay is closed per press.
- **Modal-open suppression:** `DesktopApp` makes two `useKeyboardShortcuts` calls:
  1. **Always-on Esc hook** with a single `Escape` binding (`allowInInput: true`, `enabled: true`). Walks the overlay priority order (cheatsheet → palette → add modal → I/O sheet) and closes the topmost.
  2. **Gated bindings hook** with everything else. Its `enabled` is `!cheatsheetOpen && !paletteOpen && !showAdd && !showIO`, so `n`, `g _`, `[` / `]`, `?`, `Cmd+K` don't fire while any modal is open.
- **Currency / amount inputs in `WebAddModal`:** these are `<input>` elements, so the editable-target check covers them.

## Testing

### Unit (`useKeyboardShortcuts.test.js`)

- Single-key binding fires on key match.
- Single-key binding does NOT fire when target is `<input>`.
- Binding with `allowInInput: true` fires inside `<input>`.
- Two-key binding `g d` fires when `g` then `d` are pressed within the timeout.
- Two-key prefix is cleared on timeout (no fire).
- Two-key `g x` (no match) silently clears prefix and treats `x` as fresh.
- `enabled: false` suppresses all bindings.

### Component (light)

- `WebTransactions`: pressing `j` advances `selectedIdx`; pressing `k` decreases; pressing `e` opens edit modal with the selected TX; changing the search query resets selection to row 0.

### Manual

- All listed bindings work on the relevant pages.
- Shortcuts don't fire while typing in any form.
- `?` shows a modal listing every binding.
- `j/k` selection in TX list is visually obvious (highlighted row).
- `e` on a selected row opens the edit modal.

## Files touched

| Status | Path |
|---|---|
| NEW | `src/renderer/hooks/useKeyboardShortcuts.js` |
| NEW | `src/renderer/hooks/__tests__/useKeyboardShortcuts.test.js` |
| NEW | `src/renderer/components/Shortcuts.jsx` |
| MOD | `src/renderer/App.jsx` |
| MOD | `src/renderer/store.jsx` |
| MOD | `src/renderer/screens/web/WebTransactions.jsx` |

## Out of scope

- User-customizable bindings.
- Mobile keyboard shortcuts.
- Showing shortcut hints inside the command palette (potential follow-up).
- Shortcuts on pages other than Dashboard/TX (no `j/k` on Accounts, Budgets, etc. — can be added later if useful).

## Acceptance criteria

- [ ] All bindings in the table above work on the relevant pages.
- [ ] No shortcut fires while the active element is `<input>`, `<textarea>`, or `[contenteditable]`, except `Esc`.
- [ ] `?` toggles a modal listing every binding, grouped by GLOBAL / NAVIGATION / TRANSACTIONS.
- [ ] `j`/`k` selection in the TX list is visually obvious (left border, `aria-selected`) and the row scrolls into view.
- [ ] `e` on a selected row opens the edit modal pre-populated with that TX.
- [ ] Two-key `g _` sequences time out after 1.5s.
- [ ] Existing `Cmd/Ctrl+K` palette toggle still works.
- [ ] Hook unit tests pass.
