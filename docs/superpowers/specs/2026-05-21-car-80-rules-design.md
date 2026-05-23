# CAR-80 — Rule-Based Auto-Categorization

**Date:** 2026-05-21
**Linear:** [CAR-80](https://linear.app/carloshrdezc/issue/CAR-80/rule-based-auto-categorization-for-imports-and-new-transactions)
**Also closes:** [CAR-181](https://linear.app/carloshrdezc/issue/CAR-181) (CategoryPicker extraction — bulk + rules + future single-tx)
**Status:** Design approved, ready for implementation plan
**Branch:** `car-80-rules` (PR base: `dev-master`)

---

## 1. Problem

After importing a bank file, every transaction lands as `'other'` or with whatever category the source assigned. Users then re-categorize the same merchants over and over (every Starbucks visit, every Amazon order). Per the issue: this is the #1 reason personal finance apps get abandoned.

## 2. Goal

A rules engine that auto-categorizes transactions on import and pre-fills the picker on manual add. Rules are user-defined, ordered (priority = array index), and toggleable. A "re-apply to existing" action lets the user back-fill historical transactions.

## 3. Scope

### In scope

- Pure rules module (`rules.mjs`) with `applyRules`, `applyRulesToBatch`, `previewRulesAgainst`, `compileRule`, `normalizeMerchant`, `patternToRegExp`.
- Store additions: `rules` slice + `addRule` / `updateRule` / `deleteRule` / `reorderRules` CRUD + `updateTxsIndividually` for per-tx bulk patches.
- Atomic undo wrapper for `updateTxsIndividually` (single undo entry covers any number of per-tx changes).
- Reusable `<CategoryPicker>` primitive that walks `categoryTree` (closes CAR-181 by replacing the static-CATEGORIES popover in `<BulkActionBar>`).
- `<RuleForm>` for single-rule editing.
- `<RulesEditor>` for the list with drag-handle reorder, add, edit, delete, enable-toggle, and "re-apply to existing" preview modal.
- Mount the rules editor in `WebSettings.jsx` as a new full-width section after the existing 2-column grid.
- Apply rules in the import flow (`<ImportExport>` between parse and `addTransactions`).
- Pre-fill the picker on manual add (web `<WebAddModal>` and mobile `<AddSheet>`).
- Backup/restore: bump `BACKUP_FORMAT_VERSION` from 1 to 2; add `rules` slice. v1 backups restore as `rules: []` automatically.
- Pure-logic test coverage (Vitest, node env): ~21 new tests. Total suite goes from 155 to **176**.

### Out of scope (deferred)

- **Suggest-rule prompt** after 3rd identical re-categorization → **CAR-182**.
- Subcategory creation from inside the picker (user goes to Settings → Categories).
- Search/filter inside the rules editor.
- Per-rule "re-apply this rule" (the global re-apply covers it).
- Mobile rules editor (manual rule management is desktop-only for v1).
- Per-rule `note` field in `set` (deferred — adds complexity for marginal value).
- Cross-user rule sharing.
- ML/fuzzy merchant matching (a rules-based foundation has to land first; CAR-182 may motivate this later).

## 4. Approach

**Pure module + thin store wiring + extracted UI components.** Same architectural pattern as CAR-81 (undo) and CAR-82 (bulk select). Pure logic in `.mjs`, Vitest-tested in node env, no React. Store wiring is mechanical CRUD over a localStorage-mirrored slice. UI components are presentational with the parent owning state.

The `<CategoryPicker>` extraction is a deliberate two-birds-one-stone: rules need a tree-aware picker, and bulk-categorize (CAR-82) currently uses static `CATEGORIES` (the gap CAR-181 was filed for). Building the picker once and using it twice closes both gaps in one PR.

### Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  src/renderer/rules.mjs (pure, no React)                             │
│    patternToRegExp · normalizeMerchant · compileRule                 │
│    applyRules · applyRulesToBatch · previewRulesAgainst              │
└──────────────────────────────────────────────────────────────────────┘
                                  ▲
                                  │
┌──────────────────────────────────────────────────────────────────────┐
│  src/renderer/store.jsx (additions)                                  │
│    rules · addRule · updateRule · deleteRule · reorderRules          │
│    updateTxsIndividually  (per-tx bulk patches, single setTxs)       │
└──────────────────────────────────────────────────────────────────────┘
                                  ▲
                                  │
┌──────────────────────────────────────────────────────────────────────┐
│  src/renderer/useUndoableStore.js (additions)                        │
│    Wrap updateTxsIndividually as a single undo entry                 │
└──────────────────────────────────────────────────────────────────────┘
                                  ▲
                                  │
              ┌───────────────────┴────────────────────┐
              │                                        │
   ┌──────────┴───────────┐              ┌──────────────┴────────────┐
   │ <CategoryPicker>     │              │ <RuleForm>, <RulesEditor> │
   │ (also used by        │              │  (drag reorder, preview)  │
   │  <BulkActionBar>)    │              └──────────────┬────────────┘
   └──────────────────────┘                             │
              │                                          │
              ▼                                          ▼
       BulkActionBar (CAR-82,                  WebSettings (rules section)
        now uses CategoryPicker —                ImportExport (apply rules)
        closes CAR-181)                          WebAddModal + AddSheet
                                                  (pre-fill picker on type)
```

### Module boundaries

| Unit | Purpose | Depends on | Tested by |
|---|---|---|---|
| `rules.mjs` | Pattern compilation + matching + bulk apply + preview diff | none | `rules.test.mjs` (Vitest, ~18 tests) |
| `bulkOps.mjs` (extension) | New `updateTxsIndividuallyInArray` helper | none | `bulkOps.test.mjs` (3 new tests) |
| `store.jsx` (additions) | CRUD on `rules` slice + per-tx bulk update | none beyond existing | manual UAT |
| `useUndoableStore.js` (extension) | Atomic undo for `updateTxsIndividually` | undo system from CAR-81 | manual UAT |
| `<CategoryPicker>` | Tree-walking picker primitive | `categoryTree` shape | manual UAT |
| `<RuleForm>` | Single-rule inline editor | `<CategoryPicker>`, `<Checkbox>` from CAR-82 | manual UAT |
| `<RulesEditor>` | List + reorder + add + preview modal | `<RuleForm>`, drag pattern from `WebAccounts.jsx` | manual UAT |
| `backup.mjs` (extension) | Add `rules` slice to backup format | none | covered by existing backup tests |

## 5. Pure module: `src/renderer/rules.mjs`

### Public API

```js
// Compile a rule's match config into a fast matcher function.
// Returns null if the rule is disabled or has no usable conditions.
compileRule(rule) → ((tx) => boolean) | null

// Apply the first matching rule's `set` to the tx.
// Returns a new tx with shallow-merged patch, OR the original tx if no match.
applyRules(tx, rules) → tx | { ...tx, cat, path }

// Bulk apply for the import flow.
applyRulesToBatch(txs, rules) → txs           // identity-preserving on no changes

// Generate a "what would change" preview without mutating.
previewRulesAgainst(txs, rules) → Array<{
  txId: string,
  before: { cat: string, path: string[] },
  after:  { cat: string, path: string[] },
}>

// Normalize a merchant string for case-insensitive comparison.
normalizeMerchant(name) → string              // uppercase + trim

// Convert a user-friendly pattern to a RegExp (internal but exported for tests).
patternToRegExp(pattern) → RegExp
```

### Rule shape

```js
{
  id: string,              // 'rule_' + Date.now() + suffix; assigned by store.addRule
  enabled: boolean,
  match: {
    merchantPattern: string,                       // required
    amountRange?: { min?: number, max?: number }, // optional, AND-combined
    accountId?: string,                            // optional, AND-combined
  },
  set: {
    path: string[],          // ['food', 'produce'] or ['dining']
    // Note: cat is derived as path[0] when applied; not stored separately.
  },
  createdAt: string,         // ISO date 'YYYY-MM-DD'
}
```

**No `priority` field** — array index in the `rules` slice IS the priority. Reorder via drag-and-drop in the editor; first match in array order wins.

**No `descriptionPattern`** — there's no separate description field on `tx` (the codebase uses `tx.name` for the merchant string).

**No `note` in `set`** — out of scope for v1.

### Pattern compilation

User-friendly substring + wildcard syntax. Internal compilation to RegExp:

```js
function patternToRegExp(pattern) {
  // 1. Escape regex metachars EXCEPT '*'
  // 2. Replace '*' with '.*'
  // 3. Compile case-insensitive
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const withWildcards = escaped.replace(/\*/g, '.*');
  return new RegExp(withWildcards, 'i');
}
```

Examples:
- `'STARBUCKS'` → `/STARBUCKS/i` → matches `'SQ *STARBUCKS'`, `'STARBUCKS #4521'` (substring).
- `'STARBUCKS*'` → `/STARBUCKS.*/i` → matches `'STARBUCKS #4521'` but NOT `'SQ *STARBUCKS'` (starts-with).
- `'*COFFEE'` → `/.*COFFEE/i` → matches `'BLUE BOTTLE COFFEE'` (ends-with).
- `'STAR*BUCKS'` → `/STAR.*BUCKS/i` → matches both above (arbitrary middle).

Regex metacharacters in the user's pattern are escaped, so `'AT&T'` matches the literal ampersand without confusion.

### Match semantics

```js
function compileRule(rule) {
  if (!rule.enabled) return null;
  const m = rule.match;
  if (!m || !m.merchantPattern || !m.merchantPattern.trim()) return null;
  const re = patternToRegExp(m.merchantPattern);

  return (tx) => {
    if (!re.test(normalizeMerchant(tx.name))) return false;
    if (m.amountRange) {
      const abs = Math.abs(tx.amt);
      if (m.amountRange.min != null && abs < m.amountRange.min) return false;
      if (m.amountRange.max != null && abs > m.amountRange.max) return false;
    }
    if (m.accountId && tx.acct !== m.accountId) return false;
    return true;
  };
}
```

All conditions AND-combined. Amount range tests `Math.abs(tx.amt)` so users don't have to think about signs.

### `applyRules`

```js
function applyRules(tx, rules) {
  for (const rule of rules) {                     // array order = priority
    const matcher = compileRule(rule);
    if (!matcher) continue;
    if (matcher(tx)) {
      const path = rule.set.path;
      if (!path || path.length === 0) continue;   // malformed rule, skip
      return { ...tx, cat: path[0], path };
    }
  }
  return tx;                                       // identity preserved on no match
}
```

**Identity preservation matters** — same convention as `bulkOps.mjs` from CAR-82. Callers can check `if (next === prev) skip`.

### `applyRulesToBatch`

```js
function applyRulesToBatch(txs, rules) {
  if (!rules || rules.length === 0) return txs;
  let changed = false;
  const next = txs.map(tx => {
    const after = applyRules(tx, rules);
    if (after !== tx) changed = true;
    return after;
  });
  return changed ? next : txs;
}
```

Returns input identity if no tx matched any rule.

### `previewRulesAgainst`

```js
function previewRulesAgainst(txs, rules) {
  const changes = [];
  for (const tx of txs) {
    const after = applyRules(tx, rules);
    if (after === tx) continue;
    if (after.cat === tx.cat && pathsEqual(after.path, tx.path)) continue;
    changes.push({
      txId: tx.id,
      before: { cat: tx.cat, path: tx.path || [tx.cat] },
      after:  { cat: after.cat, path: after.path },
    });
  }
  return changes;
}
```

Used by the "re-apply to existing" preview modal. Returns the diff; the caller groups changes into `perTxPatches` and dispatches via `updateTxsIndividually`.

### Invariants

1. All functions are referentially transparent: same input → same output.
2. Inputs never mutated; outputs are new objects/arrays.
3. `applyRules` and `applyRulesToBatch` return input identity when there are no changes.
4. `previewRulesAgainst` skips txs whose `cat` AND `path` would not change (pure no-op detection).

## 6. Store layer

### State slice

In `src/renderer/store.jsx`, near the existing `useLS` declarations:

```jsx
const [rules, setRules] = useLS('ledger:rules', []);
```

### CRUD callbacks

```jsx
const addRule = React.useCallback((rule) => {
  if (!rule || !rule.match?.merchantPattern) return;
  const id = 'rule_' + Date.now();
  const newRule = {
    enabled: true,
    createdAt: new Date().toISOString().slice(0, 10),
    ...rule,
    id,                                    // generated id wins
  };
  setRules(prev => [...prev, newRule]);
  return newRule;
}, [setRules]);

const updateRule = React.useCallback((id, patch) => {
  setRules(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
}, [setRules]);

const deleteRule = React.useCallback((id) => {
  setRules(prev => prev.filter(r => r.id !== id));
}, [setRules]);

const reorderRules = React.useCallback((orderedIds) => {
  setRules(prev => {
    const byId = Object.fromEntries(prev.map(r => [r.id, r]));
    const reordered = orderedIds.filter(id => byId[id]).map(id => byId[id]);
    const untouched = prev.filter(r => !orderedIds.includes(r.id));
    return [...reordered, ...untouched];
  });
}, [setRules]);
```

`reorderRules` mirrors `reorderAccounts` (CAR-81 added it). Untouched rules append unchanged.

### Per-tx bulk update for the re-apply preview

The pure helper in `bulkOps.mjs`:

```js
export function updateTxsIndividuallyInArray(prevTxs, perTxPatches) {
  if (!perTxPatches || perTxPatches.length === 0) return prevTxs;
  const byId = Object.fromEntries(perTxPatches.map(p => [p.id, p.patch]));
  if (Object.keys(byId).length === 0) return prevTxs;
  let changed = false;
  const next = prevTxs.map(tx => {
    if (!byId[tx.id]) return tx;
    changed = true;
    return { ...tx, ...byId[tx.id] };
  });
  return changed ? next : prevTxs;
}
```

The store method:

```jsx
const updateTxsIndividually = React.useCallback((perTxPatches) => {
  if (!perTxPatches || perTxPatches.length === 0) return;
  setTxs(prev => updateTxsIndividuallyInArray(prev, perTxPatches));
}, [setTxs]);
```

### Context exposure

Add to `<StoreCtx.Provider value={{ ... }}>`:

```jsx
      // CAR-80 rules
      rules,
      addRule,
      updateRule,
      deleteRule,
      reorderRules,
      // CAR-80 per-tx bulk update
      updateTxsIndividually,
```

### Reset & restore

- `reset()` (`store.jsx:725-733`): add `setRules([])`.
- `restoreBackup()` (`store.jsx:745-795`): add `setRules` to the destructure and dependency array. `validateBackup` already substitutes `[]` for missing keys, so v1 backups restore as `rules: []` gracefully.

## 7. Undo wrapper for `updateTxsIndividually`

In `src/renderer/useUndoableStore.js`, alongside the four CAR-82 bulk wrappers:

```js
const updateTxsIndividually = React.useCallback((perTxPatches) => {
  if (!perTxPatches || perTxPatches.length === 0) return;
  // Capture pre-patch values for each id, only for keys touched by its patch.
  const idMap = new Map(perTxPatches.map(p => [p.id, p.patch]));
  const before = store.allTransactions
    .filter(t => idMap.has(t.id))
    .map(t => {
      const patch = idMap.get(t.id);
      const snap = { id: t.id };
      for (const k of Object.keys(patch)) snap[k] = t[k];
      return snap;
    });
  if (before.length === 0) return;
  stack.register({
    label: before.length === 1
      ? 'Transaction updated by rule'
      : `${before.length} transactions updated by rules`,
    batchKey: null,
    do:   () => store.updateTxsIndividually(perTxPatches),
    undo: () => store.setTransactions(prev => {
      const byId = Object.fromEntries(before.map(s => [s.id, s]));
      return prev.map(tx => byId[tx.id] ? { ...tx, ...byId[tx.id] } : tx);
    }),
  });
}, [store, stack]);
```

`batchKey: null` so this never coalesces with other registers. Same pattern as CAR-82's `updateTxs` wrapper.

## 8. Backup format change — `src/renderer/backup.mjs`

Two changes:

```js
// Line ~5
export const BACKUP_FORMAT_VERSION = 2;  // was 1

// Add to SLICES array (around line 15, alongside bills/goals)
['rules', 'rules', [], 'array'],
```

`validateBackup` (`backup.mjs:76-122`) already handles missing keys by substituting the default. v1 backups restore as `rules: []`. No migration code needed.

## 9. `<CategoryPicker>` — extracted primitive (closes CAR-181)

**File:** `src/renderer/components/CategoryPicker.jsx`

### Props

```js
{
  tree,                  // store.categoryTree
  value,                 // current selected path: string[] | null
  onChange,              // (path: string[]) => void
  placeholder = 'PICK',  // text shown when value is null
  align = 'left',        // 'left' | 'right' — popover alignment
  maxHeight = 300,
}
```

### Tree traversal

Walks `categoryTree` depth-first, emitting an entry for every node (top-level AND nested). User can pick a top-level (`['food']`) or a leaf (`['food', 'produce']`).

```js
function flattenTree(tree, path = []) {
  const entries = [];
  for (const [key, node] of Object.entries(tree || {})) {
    const nextPath = [...path, key];
    entries.push({ path: nextPath, label: node.label, glyph: node.glyph || '' });
    if (node.children) {
      entries.push(...flattenTree(node.children, nextPath));
    }
  }
  return entries;
}
```

Top-level keys live directly under `tree`; sub-categories under `.children`. This matches the store's existing `addCategory`/`renameCategory`/`removeCategory` walk semantics.

### Visual

- Trigger button: `value ? formatPath(value) : placeholder`. Click → opens upward-facing popover.
- Popover: `position: absolute; bottom: 100%; marginBottom: 8`. `A.bg` background, `1px solid A.ink` border, `maxHeight: 300; overflow: auto`. Each row shows `{glyph} {breadcrumb}` (e.g. `◆ DINING › CAFE`). Hover: `A.bg2`.
- Outside-click and Esc close the popover (same pattern as `<BulkActionBar>`'s pickers — and same `stopPropagation` non-fix from CAR-82's review applies here too: the global Esc handler is benign when no overlays are open).
- Click an entry → `onChange(path)`, popover closes.

### Reuse in `<BulkActionBar>` (CAR-181 close)

Replace the existing CATEGORIZE inline popover with `<CategoryPicker tree={categoryTree} value={null} onChange={onCategorize} placeholder="CATEGORIZE" />`.

The bar's `onCategorize` callback signature changes from `({ cat, path })` to `(path)` — the parent (`WebTransactions.jsx`) computes `cat = path[0]` itself when calling `updateTxs(ids, { cat, path })`. One-line change.

`<BulkActionBar>` gets a new prop `categoryTree` to pass through.

## 10. `<RuleForm>` — single-rule editor

**File:** `src/renderer/components/RuleForm.jsx`

### Props

```js
{
  rule,                  // existing rule (or null for new-rule mode)
  categoryTree,
  accountsWithBalance,
  onSave,                // (ruleData) => void — receives the form's rule shape (no id)
  onCancel,              // () => void
  onDelete,              // () => void — only shown when editing existing
}
```

### Layout (single row)

```
[≡] [✓] | merchant: [STARBUCKS*] | amount: [min]–[max] | acct: [Any ▾] | → [DINING › CAFE ▾] | [SAVE] [CANCEL] [DELETE]
```

- Drag handle `≡` rendered by parent (`<RulesEditor>`), not by this form.
- `[✓]` enabled checkbox (uses `<Checkbox>` from CAR-82).
- Merchant text input — required, mono font, placeholder `'STARBUCKS or *COFFEE'`.
- Amount range — two small numeric inputs separated by an em-dash. Both optional.
- Account `<select>` — options are `[Any]` + each account from `accountsWithBalance`. `Any` (default) means no account restriction.
- Visual `→` separator implies "matches → set".
- Target via `<CategoryPicker tree={categoryTree} value={path} onChange={setPath} placeholder="PICK CATEGORY" />`.
- `[SAVE]` disabled until merchantPattern is non-empty AND `path.length > 0`.
- `[DELETE]` only when editing an existing rule (form was opened from EDIT, not + ADD RULE).

### Form state and save handler

```jsx
const [enabled, setEnabled] = React.useState(rule?.enabled ?? true);
const [merchantPattern, setMerchantPattern] = React.useState(rule?.match?.merchantPattern ?? '');
const [amtMin, setAmtMin] = React.useState(rule?.match?.amountRange?.min ?? '');
const [amtMax, setAmtMax] = React.useState(rule?.match?.amountRange?.max ?? '');
const [accountId, setAccountId] = React.useState(rule?.match?.accountId ?? '');
const [path, setPath] = React.useState(rule?.set?.path ?? null);

const handleSave = () => {
  if (!merchantPattern.trim() || !path || path.length === 0) return;
  const minNum = amtMin === '' ? null : Number(amtMin);
  const maxNum = amtMax === '' ? null : Number(amtMax);
  const amountRange = (minNum != null || maxNum != null)
    ? { ...(minNum != null && { min: minNum }), ...(maxNum != null && { max: maxNum }) }
    : undefined;
  onSave({
    enabled,
    match: {
      merchantPattern: merchantPattern.trim(),
      ...(amountRange && { amountRange }),
      ...(accountId && { accountId }),
    },
    set: { path },
  });
};
```

The store's `addRule` / `updateRule` add the `id` and `createdAt`.

## 11. `<RulesEditor>` — list with reorder + add + re-apply

**File:** `src/renderer/components/RulesEditor.jsx`

### Props

```js
{
  rules,
  categoryTree,
  accountsWithBalance,
  transactions,             // for the re-apply preview
  onAddRule,                // (rule) => newRule
  onUpdateRule,             // (id, patch) => void
  onDeleteRule,             // (id) => void
  onReorderRules,           // (orderedIds) => void
  onApplyToExisting,        // (perTxPatches) => void — invokes updateTxsIndividually
}
```

### State

```jsx
const [editingId, setEditingId] = React.useState(null);   // null | rule.id | 'new'
const [dragIdx, setDragIdx] = React.useState(null);
const [overIdx, setOverIdx] = React.useState(null);
const [previewOpen, setPreviewOpen] = React.useState(false);
```

### Layout

```
RULES                                   [+ ADD RULE]  [RE-APPLY TO EXISTING]
─────────────────────────────────────────────────────────────────────────────
[≡] [✓] STARBUCKS    · any · any acct  →  DINING › CAFE   [EDIT] [DELETE]
[≡] [✓] *COFFEE      · any · any acct  →  DINING › CAFE   [EDIT] [DELETE]
[≡] [✓] WHOLE FOODS  · any · any acct  →  FOOD › PRODUCE  [EDIT] [DELETE]
[≡] [ ] AMAZON       · >$50 · CARD     →  SHOPPING        [EDIT] [DELETE]
─────────────────────────────────────────────────────────────────────────────
```

- Each row in **read mode** by default (compact, glanceable).
- Click `[EDIT]` → that row mounts `<RuleForm rule={r}>` inline.
- `[+ ADD RULE]` mounts `<RuleForm rule={null}>` at the top (`editingId === 'new'`).
- Click `[✓]` toggles `enabled` directly via `onUpdateRule(id, { enabled: !enabled })` — no edit mode required.
- `[≡]` is the drag handle. Drag a row to reorder.

### Drag-and-drop reorder

Mirror `WebAccounts.jsx:99-126`:

- HTML5 `draggable={true}` on each row.
- Three state vars: `dragIdx`, `overIdx`, no separate "reorder mode" toggle (rules editor is always reorderable).
- Handlers: `handleDragStart(idx)`, `handleDragOver(e, idx)` with `e.preventDefault()`, `handleDrop()` splices array, calls `onReorderRules(orderedIds)`.
- Visual: drag opacity 0.4, drop-target highlight via `A.ink + '18'` background, `cursor: grab` on the `[≡]` glyph.

### Re-apply preview modal — `<ApplyRulesPreviewModal>`

Click `[RE-APPLY TO EXISTING]` → opens a modal:

```
APPLY RULES TO EXISTING TRANSACTIONS

42 transactions will be re-categorized:

  STARBUCKS · 2026-05-15 · -$4.50    OTHER → DINING › CAFE
  STARBUCKS · 2026-05-12 · -$5.20    OTHER → DINING › CAFE
  WHOLE FOODS · 2026-05-10 · -$87.30 OTHER → FOOD › PRODUCE
  ... (39 more)

Press Ctrl+Z after applying to revert.

[CANCEL]                                  [APPLY 42 CHANGES]
```

- Computes `previewRulesAgainst(transactions, rules)` once when opened.
- Truncates display to first ~10 changes; rest collapsed to "+N more".
- "APPLY N CHANGES" routes to `onApplyToExisting(perTxPatches)` where `perTxPatches = changes.map(c => ({ id: c.txId, patch: { cat: c.after.cat, path: c.after.path } }))`.
- Empty-state: "No transactions would change. All matching txs are already categorized." with a single CLOSE button.
- Esc / outside-click cancels.
- `role="dialog" aria-modal="true"` on the inner content (matches the CAR-81 modal pattern that the keyboard handler bails on).

### Mount in `<WebSettings>`

After the existing 2-column grid (after line 332 of `WebSettings.jsx`, before the `showResetAndLoad` modal), add a full-width section:

```jsx
<div style={{ marginTop: 32, borderTop: '2px solid ' + A.ink, paddingTop: 18 }}>
  <ALabel>[04] RULES</ALabel>
  <div style={{ marginTop: 12 }}>
    <RulesEditor
      rules={rules}
      categoryTree={categoryTree}
      accountsWithBalance={accountsWithBalance}
      transactions={transactions}
      onAddRule={addRule}
      onUpdateRule={updateRule}
      onDeleteRule={deleteRule}
      onReorderRules={reorderRules}
      onApplyToExisting={updateTxsIndividually}
    />
  </div>
</div>
```

Section number `[04]` comes after the existing `[03] DISPLAY`. Numbering is consistent with the rest of the screen.

## 12. Import wiring — `<ImportExport>`

**File:** `src/renderer/components/ImportExport.jsx`

The codebase scan found four parser branches in `handleFile`, each ending in `addTransactions(parsed)`. Centralize via a tiny helper:

```jsx
import { applyRulesToBatch } from '../rules.mjs';
// ...
const { rules, addTransactions, /* ... */ } = useStore();

const importTxs = (txs) => {
  const withRules = applyRulesToBatch(txs, rules);
  addTransactions(withRules);
};

// Replace each `addTransactions(parsed)` call with `importTxs(parsed)`:
//   - QIF branch
//   - CSV branch
//   - XLSX branch (the partial-import case, not the bulk-replace case)
//   - mmbak partial branch (NOT the full-restore branch — that uses setTransactions)
```

**Critical:** the mmbak full-restore path (`isLedgerBackup === true`) uses `setTransactions` (REPLACE, not append) and MUST NOT apply rules — backup restore is a verbatim revert. Only the `addTransactions` paths run through `importTxs`.

Imports with source-supplied `cat` ALSO run through rules. The user opted in to rules; if their rule overrides the source's categorization, that's intentional (bank categories are usually wrong).

## 13. Manual-add wiring — `<WebAddModal>` and `<AddSheet>`

When the user types a merchant in the modal, run rules against a synthetic candidate tx. If a rule matches AND the user hasn't manually overridden the picker, pre-fill `cat`/`path`.

### State additions

```jsx
const [path, setPath] = React.useState(editTx?.path || (editTx?.cat ? [editTx.cat] : ['dining']));
const [catManuallySet, setCatManuallySet] = React.useState(!!editTx);
```

`catManuallySet` initializer: `true` for edit mode (don't fight an existing tx's category), `false` for new (rules can pre-fill).

### Effect

```jsx
React.useEffect(() => {
  if (catManuallySet) return;
  if (!merchant.trim()) return;
  if (!rules || rules.length === 0) return;
  const candidate = {
    name: merchant.trim(),
    amt: isExpense ? -Math.abs(parseFloat(amt) || 0) : Math.abs(parseFloat(amt) || 0),
    acct,
    cat: 'other',
    path: ['other'],
  };
  const after = applyRules(candidate, rules);
  if (after !== candidate && after.path && after.path.length > 0) {
    setCat(after.cat);
    setPath(after.path);
  }
}, [merchant, isExpense, amt, acct, rules, catManuallySet]);
```

### Picker click handler

The existing chip-picker `setCat(k)` becomes:

```jsx
onClick={() => {
  setCat(k);
  setPath([k]);                  // top-level chip → path of length 1
  setCatManuallySet(true);
}}
```

### Save handler

Non-transfer save block writes both `cat` and `path`:

```jsx
const changes = {
  name: merchant.trim(),
  amt: isExpense ? -Math.abs(parseFloat(amt)) : Math.abs(parseFloat(amt)),
  date,
  cat,
  path,                         // NEW: always include path
  ccy: editTx?.ccy || 'USD',
  acct,
};
```

### Mobile parity

`src/renderer/screens/mobile/AddSheet.jsx` gets identical changes (the codebase scan confirmed structural parity with web's manual-add flow). Same `path` state, same `catManuallySet`, same effect, same picker handler change, same save handler.

## 14. Testing

### `src/renderer/rules.test.mjs` (Vitest, node env)

~18 tests:

**`patternToRegExp`** (4):
1. Plain string → substring match.
2. Trailing `*` → starts-with.
3. Leading `*` → ends-with.
4. Regex metachars escaped (literal `.` matches `.`, not any char).

**`normalizeMerchant`** (1):
5. Trim + uppercase.

**`compileRule`** (4):
6. Disabled rule returns null.
7. Empty merchantPattern returns null.
8. Returns a function that matches all conditions (merchant, amount, account).
9. AND semantics — fails if any condition mismatches.

**`applyRules`** (5):
10. No rules → input identity.
11. No matching rule → input identity (`expect(after).toBe(tx)`).
12. First matching rule wins (priority via array order).
13. Returns shallow-merged tx with new `cat` and `path`.
14. Disabled rule is skipped.

**`applyRulesToBatch`** (2):
15. No rules → input array identity.
16. No tx matches any rule → input array identity.

**`previewRulesAgainst`** (2):
17. Returns empty array when no changes.
18. Returns one entry per changed tx with `before` and `after` shape.

### `src/renderer/bulkOps.test.mjs` additions (3 tests)

19. `updateTxsIndividuallyInArray` applies per-tx patches only to matching ids.
20. Empty patches array returns input identity.
21. No matching ids returns input identity.

### Component / integration tests

Skipped — same precedent as CAR-81 and CAR-82. Manual UAT covers visible behavior.

### Manual UAT checklist

| # | Action | Expected |
|---|---|---|
| 1 | Settings → scroll to RULES → click `+ ADD RULE` | Form appears at top with merchant/amount/account/target inputs. |
| 2 | Type `STARBUCKS`, leave amount/account blank, pick `DINING › CAFE`, SAVE | Rule appears as first row. |
| 3 | Import a CSV with 5 `STARBUCKS` rows (cat=`other`) | All 5 import as `DINING › CAFE`. |
| 4 | Add `*COFFEE` → `DINING › CAFE`. Drag above STARBUCKS | `*COFFEE` is now position 1. |
| 5 | `n` shortcut → modal → type `STARBUCKS DOWNTOWN` | DINING category chip auto-highlighted. |
| 6 | Same as 5, click SHOPPING chip, SAVE | Tx saves with `cat: 'shopping'` (override wins). |
| 7 | Edit existing tx (cat `food`), type `STARBUCKS` | Picker stays on `food` (rules don't override on edit). |
| 8 | Toggle a rule's enabled checkbox off, import `STARBUCKS` | Imports as `other` (rule skipped). |
| 9 | Click `RE-APPLY TO EXISTING` | Modal lists N changes; first 10 detailed, rest collapsed. |
| 10 | Click `APPLY N CHANGES` | Bulk update fires. UndoToast: `N transactions updated by rules`. Ctrl+Z reverts. |
| 11 | Add rule `RENT` + min:1000 + accountId Checking → HOUSING > RENT. Add tx `RENT` -$200 (Checking) → no match. Add tx `RENT` -$1500 (Checking) → match | Amount-range AND account-AND-merchant correctly gated. |
| 12 | Click DELETE on a rule | Removed from list. |
| 13 | Bulk select on transactions, click CATEGORIZE in the action bar | Picker shows `categoryTree` entries (closes CAR-181). |
| 14 | Export backup | JSON contains `rules: [...]` and `version: 2`. |
| 15 | Restore a v1 backup (no `rules` key) | Restore succeeds; `rules` is `[]`. |
| 16 | Restore a v2 backup with rules | Rules restored exactly. |
| 17 | Re-apply when no rules match anything | Modal shows "No transactions would change. All matching txs are already categorized." |
| 18 | Mobile: AddSheet → type `STARBUCKS` | Same pre-fill as web (mobile parity). |

## 15. Rollout (single PR per AGENTS.md, against `dev-master`)

1. `src/renderer/rules.mjs` + `rules.test.mjs` — pure module + 18 tests.
2. `src/renderer/bulkOps.mjs` + `bulkOps.test.mjs` — add `updateTxsIndividuallyInArray` + 3 tests.
3. `src/renderer/store.jsx` — `useLS('ledger:rules', [])`, 5 CRUD methods, `updateTxsIndividually`, expose on context, add to `reset` / `restoreBackup`.
4. `src/renderer/useUndoableStore.js` — wrap `updateTxsIndividually` (one undo entry).
5. `src/renderer/backup.mjs` — bump version to 2, add `rules` slice.
6. `src/renderer/components/CategoryPicker.jsx` — new primitive.
7. `src/renderer/components/BulkActionBar.jsx` — replace static CATEGORIES picker with `<CategoryPicker>` (closes CAR-181). New `categoryTree` prop.
8. `src/renderer/screens/web/WebTransactions.jsx` — pass `categoryTree` to `<BulkActionBar>`. Adapt `onCategorize` callback signature.
9. `src/renderer/components/RuleForm.jsx` — single-rule editor.
10. `src/renderer/components/RulesEditor.jsx` — list + reorder + add + preview modal.
11. `src/renderer/screens/web/WebSettings.jsx` — mount RulesEditor as new `[04] RULES` section.
12. `src/renderer/components/ImportExport.jsx` — `applyRulesToBatch` between parse and `addTransactions` (via `importTxs` helper).
13. `src/renderer/screens/web/WebAddModal.jsx` — pre-fill picker via rules; track `catManuallySet`; thread `path` through save.
14. `src/renderer/screens/mobile/AddSheet.jsx` — mobile parity (same pre-fill changes).
15. Self-QA via the table above; `npm test` and `npx vite build` clean.
16. PR with `Fixes CAR-80` and `Fixes CAR-181` against `dev-master`.

## 16. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Backup format bump breaks older app builds reading newer backups | `validateBackup` already rejects backups whose `version > BACKUP_FORMAT_VERSION` with a "please update" message. Existing safety. |
| User creates a runaway rule (e.g. merchant `*` matches everything) | The pure module is fast — `applyRulesToBatch` is O(n×r). 10k txs × 50 rules ≈ 500k function calls, <100ms. Acceptable. The user can always disable or delete the rule. |
| Rule references a category path that's been deleted in Settings | Pure module sets the path on the tx regardless; orphan paths already exist in the codebase (`removeCategory` doesn't re-categorize affected txs). Documented as known behavior. |
| Manual-add rules pre-fill surprises the user | Picker UI shows the resulting category before save — visible. `catManuallySet` prevents the rule from re-firing once the user picks. UAT #5-7 verifies. |
| Re-apply preview shows 1000s of changes; modal becomes unusable | Truncate display to first ~10; show count of remainder. The single undo covers all changes regardless of display size. |
| User imports a v3+ backup into a v2 app | `validateBackup` rejects with "please update". Same precedent as CAR-81's backup handling. |
| `path` state added to manual-add modal but not threaded through `editTx` initial state correctly | Initialize from `editTx?.path || (editTx?.cat ? [editTx.cat] : ['dining'])` so editing existing top-level-only txs works. UAT #7 covers. |
| `<CategoryPicker>` doesn't render large trees performantly | Tree flattens once on render via `useMemo`. Even 200 entries scroll fine in a 300px max-height container. If perf becomes an issue, virtualize later. |
| Rule with subcategory path conflicts with bulk-categorize (which always sets top-level) | They're independent surfaces. Bulk-categorize sets `path: [cat]`. Rules set `path: [...]` (any depth). The `path` field is the source of truth for both; nothing conflicts. |

## 17. Open questions / future work

- **Suggest-rule prompt** — CAR-182.
- **Single-tx WebAddModal picker** could also use `<CategoryPicker>` (instead of the static-CATEGORIES chip row). Defer — the chip-row aesthetic differs from the dropdown picker, and both are valid. Filing as a future polish if the inconsistency becomes a problem.
- **Per-rule "test against last 100 transactions"** preview inside the form (issue mentioned this) — the global re-apply preview covers the realistic need. Add only if user feedback demands.
- **Mobile rules editor** — manual rule management is desktop-only for v1. Mobile users get the rules applied on import (transparent) but can't manage rules without going to desktop.
- **Fuzzy merchant matching** — would help with bank data like `'STARBUCKS #4521'` vs `'SQ *STARBUCKS'`. Trigger for revisit: CAR-182 user feedback or a separate issue.
