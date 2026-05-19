// LEDGER theme.
//
// Colors are exposed as CSS variables (defined in index.html) so the entire
// app can be re-themed by toggling `data-theme` on <html>. Components keep
// importing `A` and using `A.bg`, `A.ink`, etc.; the resolved color comes
// from the CSS variable at paint time.
//
// `pos`, `neg`, and `font` are static — they don't need to change between
// themes (oklch values auto-adapt against any background, and the font is
// invariant). `rule` is an alias for `ink`.
export const A = {
  bg:    'var(--ledger-bg)',
  bg2:   'var(--ledger-bg2)',
  ink:   'var(--ledger-ink)',
  ink2:  'var(--ledger-ink2)',
  muted: 'var(--ledger-muted)',
  rule:  'var(--ledger-rule)',
  rule2: 'var(--ledger-rule2)',
  pos:   'oklch(54% 0.13 145)',
  neg:   'oklch(52% 0.17 25)',
  font:  '"IBM Plex Mono", "JetBrains Mono", ui-monospace, Menlo, monospace',
};

export const ACCENTS = [
  { label: 'GREEN',  val: '#1f6b3a' },
  { label: 'BLUE',   val: '#1a4f8a' },
  { label: 'AMBER',  val: '#b06000' },
  { label: 'VIOLET', val: '#5b2d8e' },
  { label: 'SLATE',  val: '#2f4858' },
];

export const THEMES = [
  { val: 'light', label: 'LIGHT' },
  { val: 'dark',  label: 'DARK'  },
  { val: 'auto',  label: 'AUTO'  },
];
