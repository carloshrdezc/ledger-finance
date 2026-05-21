# CAR-78 — Command Palette (Cmd/Ctrl+K): Design

**Status:** Draft → review
**Date:** 2026-05-20
**Linear:** [CAR-78](https://linear.app/carloshrdezc/issue/CAR-78)

## Summary

A `Cmd/Ctrl+K` palette for the desktop web app: a centered modal that lets the user navigate and trigger actions from the keyboard. Lean v1 ships 13 static commands (10 navigation + 3 actions). Web-only; mobile gets nothing in this issue.

## Problem

Daily-use velocity is bottlenecked by mouse-driven navigation. Power users want keyboard-first. Today the only keyboard affordances on web are browser defaults — no way to jump to Reports, add a transaction, or run a backup without clicking through the UI.

## Goal

A user on the desktop web app can:

1. Press `Cmd+K` (mac) or `Ctrl+K` (win/linux) from any page → palette opens.
2. Type a few characters → matching commands narrow to the top.
3. Use arrow keys to move through results, Enter to execute.
4. Esc or click outside → palette closes without action.

Commands must work from any page, not just the page they originated from. Existing form input must not be hijacked.

## Decisions (from brainstorm)

| # | Question | Decision |
|---|---|---|
| 1 | Visual style | Centered modal, dimmed backdrop, ~50% viewport width |
| 2 | Action inventory (v1) | 10 navigation + 3 actions = 13 static commands |
| 3 | Matching | Hand-rolled fuzzy scorer (~30 lines, no new dependency) |
| 4 | Keyboard arbitration | Palette captures all keys when open. Future shortcuts (Vim from CAR-79, Undo from CAR-81) check a single `paletteOpen` boolean and bail if true. |
| 5 | Behavior in input fields | `Cmd/Ctrl+K` suppressed when `document.activeElement` is `input`/`textarea`/`contenteditable`. The user's existing typing wins. |
| 6 | Mobile | Palette doesn't mount when `isMobile` is true. No keyboard, no value. |
| 7 | Mounting location | Palette mounts inside `<DesktopApp>`, not `<AppShell>`. `<DesktopApp>` already owns `setPage`, `setShowAdd`, and the modal-open flags. The palette needs them in scope; mounting at AppShell would require lifting state. |
| 8 | "Add transfer" command | Dropped from v1. Transfers are a mode inside `<WebAddModal>` (set via the EXP/INC/XFER tab inside the modal). Pre-opening in transfer mode would require a new prop on the modal. Not worth it for v1; user can Cmd-K → Add transaction → click XFER tab (one extra click). Revisit in a v2 once the action surface stabilizes. |

## Non-goals (separate issues)

- **Mobile UI for command palette** — out of scope for CAR-78. Mobile is touch-first and the design needs different work.
- **Custom user-defined commands** — out of scope. Commands are hardcoded in v1.
- **AI / natural-language commands** — out of scope.
- **Period nav from palette** ("Previous month" / "Next month" / "Jump to <month>") — out of scope. Could ship in a v2.
- **Dynamic filter commands** ("Filter by Amazon", "Filter by Dining") — out of scope. Requires building a search index over current data; v2 work.
- **"Mark `<bill>` paid" command** — out of scope. Requires bill indexing.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  src/renderer/fuzzy.mjs  (new, pure)                        │
│  ─────────────────────                                       │
│  score(query, label) → number                               │
│    All-chars-in-order required to be a match.               │
│    Bonuses: prefix match, word-boundary match,              │
│    consecutive-char run.                                     │
│    Returns 0 if not a match, otherwise positive score.      │
│                                                              │
│  matchAndRank(query, items, getLabel) → items[]            │
│    Maps each item to {item, score}, filters score>0,       │
│    sorts score desc, returns items.                         │
└──────────────────────┬───────────────────────────────────────┘
                       │ used by
┌──────────────────────▼───────────────────────────────────────┐
│  src/renderer/commands.mjs  (new, pure-ish)                 │
│  ──────────────────────                                     │
│  buildCommands({ store, navigate, openAddTx }) → Command[] │
│  Each Command:                                              │
│    { id, label, hint?, run() }                              │
│  Returns the 13 commands ready to execute.                  │
│                                                              │
│  No React, no DOM. The `run` callback closes over the       │
│  store actions / navigate fn / modal openers passed in.     │
└──────────────────────┬───────────────────────────────────────┘
                       │ used by
┌──────────────────────▼───────────────────────────────────────┐
│  src/renderer/components/CommandPalette.jsx  (new)          │
│  ──────────────────────────────────────                     │
│  Renders the modal. Internal state: query, selectedIndex.   │
│  Reads commands list and palette-open state from props.     │
│  On Enter, calls selected command's run() then onClose().   │
│  On Esc / backdrop click, calls onClose().                  │
│  Arrow keys move selection within filtered set.             │
│                                                              │
│  Accepts `commands: Command[]` and `onClose: () => void`.   │
│  Pure presentational; doesn't know about the store.         │
└──────────────────────┬───────────────────────────────────────┘
                       │ mounted by
┌──────────────────────▼───────────────────────────────────────┐
│  src/renderer/App.jsx  (modified — DesktopApp + AppShell)   │
│  ─────────────────────                                       │
│  AppShell adds:                                             │
│  - useEffect global keydown listener for Cmd/Ctrl+K with    │
│    the input-field guard. Sets a paletteOpen state.         │
│  - Passes `paletteOpen` + `onPaletteClose` down to          │
│    DesktopApp (and not to MobileApp).                       │
│  - Listener bails on isMobile=true (so no listener for     │
│    mobile users).                                            │
│                                                              │
│  DesktopApp (the only place that owns setPage / setShowAdd) │
│  uses buildCommands(...) with closure over its local        │
│  setters and the store, then renders <CommandPalette        │
│  commands={...} onClose={...} /> when paletteOpen is true.  │
└──────────────────────────────────────────────────────────────┘
```

### Command list (v1)

```js
[
  // Navigate (10)
  { id: 'go.dashboard',    label: 'Go to Dashboard',     run: () => setPage('dashboard') },
  { id: 'go.transactions', label: 'Go to Transactions',  run: () => setPage('tx') },
  { id: 'go.accounts',     label: 'Go to Accounts',      run: () => setPage('accounts') },
  { id: 'go.budgets',      label: 'Go to Budgets',       run: () => setPage('budgets') },
  { id: 'go.goals',        label: 'Go to Goals',         run: () => setPage('goals') },
  { id: 'go.bills',        label: 'Go to Bills',         run: () => setPage('bills') },
  { id: 'go.reports',      label: 'Go to Reports',       run: () => setPage('reports') },
  { id: 'go.investments',  label: 'Go to Investments',   run: () => setPage('investments') },
  { id: 'go.alerts',       label: 'Go to Alerts',        run: () => setPage('alerts') },
  { id: 'go.settings',     label: 'Go to Settings',      run: () => setPage('settings') },

  // Actions (3)
  { id: 'add.tx',       label: 'Add transaction',        run: () => setShowAdd(true) },
  { id: 'backup.now',   label: 'Backup now',             run: () => { exportBackup; download; recordBackupTaken; } },
  { id: 'theme.toggle', label: 'Toggle theme (light/dark/auto)', run: () => cycleTheme() },
]
```

`hint` is optional metadata for future visual treatment (e.g., showing the keyboard shortcut next to "Go to Transactions" once CAR-79 ships). v1 leaves it unset.

### Visual / interaction

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│              ╭─────────────────────────╮                │
│              │ ┌─────────────────────┐ │                │
│              │ │ Type a command…     │ │                │
│              │ └─────────────────────┘ │                │
│              │ ─────────────────────── │                │
│              │ › Go to Transactions    │                │
│              │   Go to Reports         │                │
│              │   Add transaction       │                │
│              │   Backup now            │                │
│              │ ─────────────────────── │                │
│              │ ↑↓ navigate ↵ run esc × │                │
│              ╰─────────────────────────╯                │
│                                                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
                  (dimmed backdrop)
```

- Width: `min(560px, 90vw)`. Centered horizontally.
- Top offset: `20vh` (so it sits in the upper-third of the viewport, where eyes already are).
- Backdrop: `rgba(0,0,0,0.5)`, click-through closes.
- Border: `2px solid A.ink` (matches the existing modal pattern in `<BackupSection>`'s confirmation modal).
- Background: `A.bg`.
- Input: full-width, no border, focus-styled bottom border `1px A.ink`.
- Result row: `padding: 10px 14px`. Selected row gets `background: A.ink, color: A.bg`. Hover row gets `background: A.rule2`.
- Footer hint line: `↑↓ navigate · ↵ run · esc ×`. Small `9px` muted text.
- All-caps labels are NOT used here (this is content, not metadata) — sentence case, matching how command palettes in other tools render. The `<ALabel>` IBM Plex pattern is reserved for section headers, not commands.

### Match scoring

Hand-rolled `score(query, label)` algorithm:

```js
export function score(query, label) {
  if (!query) return 1;                       // empty query = everything matches with weight 1
  const q = query.toLowerCase();
  const l = label.toLowerCase();
  let qi = 0;                                  // pointer into query
  let s = 0;                                   // running score
  let consecutive = 0;
  for (let li = 0; li < l.length; li++) {
    if (qi < q.length && l[li] === q[qi]) {
      let charScore = 1;
      if (li === 0)                  charScore += 5;   // start-of-string bonus
      else if (l[li-1] === ' ')      charScore += 3;   // word-boundary bonus
      consecutive++;
      charScore += consecutive;                        // streak bonus
      s += charScore;
      qi++;
    } else {
      consecutive = 0;
    }
  }
  return qi === q.length ? s : 0;             // require all query chars matched in order
}
```

Properties verified by tests:
- `score('', 'anything') > 0` (empty query matches everything)
- `score('go', 'Go to Transactions') > score('go', 'Investments')` (prefix bonus)
- `score('tran', 'Go to Transactions') > 0` (mid-string match)
- `score('zxq', 'Go to Transactions') === 0` (chars not in label)
- `score('trxs', 'Go to Transactions') > 0` ("trxs" — all chars in order, just spread)
- `score('gT', 'Go to Transactions') > 0` (case-insensitive)

`matchAndRank(query, items, getLabel)` maps→filter→sort. Trivial wrapper.

### Keyboard arbitration

`AppShell` registers ONE document-level keydown listener:

```js
React.useEffect(() => {
  if (isMobile) return;
  const handler = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      const t = e.target;
      const tag = t?.tagName;
      const isEditable =
        tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable;
      if (isEditable) return;          // user is typing; let the browser do its thing
      e.preventDefault();
      setPaletteOpen(p => !p);          // toggle (Cmd-K twice closes it)
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [isMobile]);
```

Rationale for `e.target` check (not `document.activeElement`):
- `e.target` reflects the element that received the keydown — it's what the user is interacting with.
- `document.activeElement` can be stale during focus transitions.
- Standard React keyboard handling.

When `paletteOpen` is true, the palette's own `<input>` autofocuses and consumes typing, arrows, Enter, Esc. It also calls `e.preventDefault()` on Cmd-K to prevent the toggle re-firing.

For future shortcuts (CAR-79 Vim, CAR-81 Undo), the same `useEffect` pattern is fine — they'll add `if (paletteOpen) return;` at the top of their handlers. No central arbitration system needed in v1.

### Mobile

`isMobile` is already a piece of state in `<AppShell>` (it gates Mobile vs Desktop layout). The palette mounts inside the desktop branch only:

```jsx
{!isMobile && paletteOpen && (
  <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />
)}
```

The keydown listener also bails on mobile (`if (isMobile) return;`). So on mobile: zero bundle impact at runtime, no listener registered, no palette code path exercised.

## Files Touched

| File | Status | Purpose |
|---|---|---|
| `src/renderer/fuzzy.mjs` | NEW | Pure scoring + ranking helpers |
| `src/renderer/fuzzy.test.mjs` | NEW | Vitest tests for `score`/`matchAndRank` |
| `src/renderer/commands.mjs` | NEW | Pure command-list builder |
| `src/renderer/commands.test.mjs` | NEW | Vitest tests for the builder (no DOM, pass mocks for runs) |
| `src/renderer/components/CommandPalette.jsx` | NEW | The modal component |
| `src/renderer/App.jsx` | MODIFY | `paletteOpen` state, keydown listener, mount the palette in desktop branch, build commands list |

`commands.mjs` lives in `src/renderer/` (not `src/renderer/components/`) because it's a `.mjs` pure module — same convention as `backup.mjs`/`alerts.mjs`/`fuzzy.mjs`.

## Error Handling and Edge Cases

| Case | Behavior |
|---|---|
| User presses Cmd-K while in a `<input>` | No palette; browser default. (Already gated.) |
| User presses Cmd-K while palette is open | `e.preventDefault()` and toggle off (close). |
| User presses Cmd-K twice rapidly | Open then close. State toggles — no race; React batches. |
| User types a query that matches nothing | Palette shows "No matches" placeholder row. Enter is a no-op. |
| User opens palette, doesn't type, presses Enter | The first command runs (selectedIndex defaults to 0; with empty query everything scores ≥1). |
| User opens palette mid-modal (e.g. backup confirmation modal is up) | The other modal stays under the palette backdrop. When palette closes, focus returns to the other modal. We don't try to suppress Cmd-K when modals are open in v1; if it's annoying, file a follow-up. |
| Backup-now command fails (very rare — Blob URL error) | The `run` callback catches and logs. Palette closes either way. User can re-open Settings → Backup Now to see the inline error there. |
| User clicks a result row vs. presses Enter | Same `run()` execution. |
| User runs "Toggle theme" 3 times rapidly | Cycles light → dark → auto → light. Closes after each (palette closes on every `run`). |
| Browser zoom changes (`isMobile` flips) | useEffect cleanup re-runs; listener removed. Palette state persists but won't be rendered. If the user re-zooms back, listener is re-registered. |

## Testing

`fuzzy.test.mjs` (Vitest):
- `score('', 'foo')` returns positive value (empty-query match-everything).
- `score('go', 'Go to Transactions')` > `score('go', 'Investments')` (prefix beats mid-string).
- `score('trans', 'Go to Transactions')` > 0 (mid-string OK).
- `score('zzzz', 'Go to Transactions') === 0` (no-match chars).
- `score('GT', 'go to transactions')` > 0 (case-insensitive).
- `score('rasn', 'Go to Transactions')` > 0 (chars in order, non-consecutive).
- `score('trsa', 'Go to Transactions') === 0` ('a' before 's' — order violated).
- `matchAndRank('go', [...]) → array sorted by score desc, only score>0`.

`commands.test.mjs` (Vitest):
- `buildCommands({ ... mocks })` returns 13 entries.
- Every command has `id`, `label`, `run`.
- `run()` for each command calls the right mock (e.g., `'go.transactions'`'s `run` calls `navigate('tx')`).
- IDs are unique.

`CommandPalette.jsx` and the `<AppShell>` keydown wiring don't get component-level tests in v1 — deferred to CAR-90's component-test follow-up if/when that lands.

## Manual Verification

1. Open the app on desktop. Press `Cmd+K` (mac) or `Ctrl+K` (win). Palette appears centered, input focused.
2. Type `tran` — "Go to Transactions" and "Add transaction" rank highest.
3. Press ↓ once, then Enter — the second result runs (e.g., navigates).
4. Press `Cmd+K` again to open. Press `Esc` — palette closes without action.
5. Click backdrop with palette open — palette closes.
6. Open palette, click a result with mouse — palette closes, action runs.
7. Type `xyzz` — palette shows "No matches"; Enter is no-op.
8. Click into the existing transaction-search input. Press `Cmd+K` — nothing happens (palette suppressed because focus is in an input).
9. Resize the window to <1024px (mobile). Press `Cmd+K` — nothing happens (no listener registered in mobile branch).
10. Run "Backup now" from palette — `.ledger.json` file downloads, "LAST BACKUP" timestamp updates in Settings.
11. Run "Toggle theme" three times — cycles through light → dark → auto.
12. With palette open, press `Cmd+K` again — palette closes.

## Acceptance Criteria

- [ ] `Cmd+K` (mac) / `Ctrl+K` (win/linux) opens the palette from any desktop page.
- [ ] Palette is suppressed in mobile layout (`window.innerWidth < 1024`).
- [ ] Palette is suppressed when focus is inside an `<input>`, `<textarea>`, or `[contenteditable]`.
- [ ] All 13 listed commands are present and execute correctly.
- [ ] Typing fuzzy-filters and ranks the visible commands.
- [ ] ↑/↓ navigate selection; Enter executes; Esc/backdrop closes without action.
- [ ] Selecting "Go to Transactions" sets `page=tx` and closes the palette.
- [ ] Selecting "Add transaction" opens `<WebAddModal>` and closes the palette.
- [ ] Selecting "Backup now" downloads a `.ledger.json` file and updates `lastBackupAt`.
- [ ] Selecting "Toggle theme" cycles light → dark → auto → light.
- [ ] No keyboard shortcut elsewhere is broken by this PR.
- [ ] All existing tests continue to pass; new `fuzzy.test.mjs` and `commands.test.mjs` pass.
- [ ] `npx vite build` exits 0.
- [ ] CI green.

## Dependencies and Sequencing

- **Depends on:** none (CAR-77 settings-bridge means `theme`/`setTheme` are accessible from `useStore()`, which the toggle command needs).
- **Unblocks:** CAR-79 (Vim shortcuts) — they layer on top of the same keydown pattern. CAR-81 (Undo) — same. The `paletteOpen` boolean from CAR-78 becomes a precondition both will check.

## Notes for Implementers

- The 13 commands feel like a small list to test, but ALL must work. Easy to silently miss "Go to Investments" if not exhaustively verified.
- The keydown listener should NOT use `useCallback` with `[]` — it needs to read `isMobile` from state, which means re-registering when isMobile flips. Use `useEffect` with `[isMobile]` as deps. (Already in the code sketch above.)
- The `commands.mjs` builder pattern (closure over `setPage` etc.) means the commands list is rebuilt on every `<AppShell>` render. That's fine — buildCommands is cheap (just object literals). If it becomes a hot path later, memoize.
- Don't try to memoize the palette open/close state in localStorage — the palette is transient UI; opening it should always start fresh (empty query, top result selected).
- Bundle size impact: ~3-4KB minified for the new files. Acceptable.
