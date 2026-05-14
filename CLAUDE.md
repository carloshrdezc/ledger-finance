# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start Vite dev server + Electron (runs concurrently, waits for port 5173)
npm run build    # Vite production build + electron-builder → dist-app/
npm run preview  # Preview the Vite build in browser only (no Electron)
```

No lint or test scripts are configured.

## Architecture

**LEDGER** is an Electron desktop app (personal finance tracker) built with React 19 + Vite. The renderer is a single-page React app; there is no router — navigation is manual state switching.

### Process split

- `src/main/index.js` — Electron main process. Minimal: creates a `BrowserWindow`, loads `localhost:5173` in dev or `dist/index.html` in production. No preload script, no IPC.
- `src/renderer/` — Everything the user sees. Runs in the browser context with `nodeIntegration: false`.

### Dual layout (mobile vs desktop)

`App.jsx` is the root. It measures `window.innerWidth` and renders either:
- **`MobileApp`** (`< 1024px`) — tab-bar navigation (HOME / ACCTS / TXS / BUDGT / MORE) with a push/pop overlay stack for detail screens. Screens live in `src/renderer/screens/mobile/`.
- **`DesktopApp`** (`>= 1024px`) — page-based navigation driven by a `page` string state. Screens live in `src/renderer/screens/web/`, wrapped by `WebShell.jsx`.

Both layouts receive a `t` prop (`{ accent, density, decimals }`) from `useTweaks()`, which persists user display preferences to `localStorage`.

### State management

`src/renderer/store.jsx` exports a `StoreProvider` and `useStore` hook. The store is the single source of truth for mutable data:
- `transactions` / `addTransactions` / `hideTx`
- `categoryTree` / `addCategory`
- `budgets` / `setBudgets`
- `reset` — restores all state to seed data

All store state is persisted to `localStorage` via the internal `useLS` hook (keys prefixed `ledger:`). On first load, state seeds from the static arrays in `data.js`.

### Static data & formatters (`src/renderer/data.js`)

Contains the seed data arrays: `ACCOUNTS`, `TRANSACTIONS`, `BUDGETS`, `GOALS`, `BILLS`, `INVESTMENTS`, `MERCHANTS`, and derived metrics (`HERO_METRICS`, `NET_WORTH`, etc.).

Also exports shared formatters: `fmtMoney`, `fmtSigned`, `fmtPct`, `dayLabel`, `catBreadcrumb`, `catGlyph`.

Transactions use a `path` array (e.g. `['food', 'produce']`) that indexes into the nested `CATEGORY_TREE` object. `catBreadcrumb` and `catGlyph` walk this tree.

### Theme (`src/renderer/theme.js`)

Exports a single `A` object with all design tokens: background colors (`bg`, `bg2`), ink shades (`ink`, `ink2`, `muted`), rule colors, semantic colors (`pos` green, `neg` red), and the monospace font stack (IBM Plex Mono). Import `A` from `theme.js` wherever inline styles are used — do not hardcode color values.

### Shared components (`src/renderer/components/Shared.jsx`)

Four primitives used across all screens:
- `AsciiSpark` — SVG sparkline with optional scrub/hover
- `ARule` — horizontal rule (1px or 2px)
- `ALabel` — uppercase 10px label with letter-spacing
- `ADetailCell` — labeled value cell for detail grids

### Import/Export

`src/renderer/components/ImportExport.jsx` handles QIF, CSV, and MoneyMoney `.mmbak` (SQLite via `sql.js`) import and CSV/QIF export. `sql.js` is loaded as a WASM module.

### Design origin

The `project/` directory contains HTML prototype files exported from Claude Design — they are the visual reference, not production code. The `chats/` directory has the original design conversation. Refer to these when making visual changes to understand the intended look.
