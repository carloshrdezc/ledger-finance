# LEDGER — Project AGENTS.md

Project-level rules. These extend the global `~/.config/opencode/AGENTS.md` workflow. Where a rule conflicts with the global file, this one wins.

## Branch & PR Rules

- **All PRs target `dev-master`, not `main`.** `main` is reserved for releases. Day-to-day feature work integrates into `dev-master`.
- Feature branches use the format `car-<NNN>-<short-name>` (e.g. `car-75-fx-rates`).
- When opening PRs with `gh pr create`, always pass `--base dev-master` explicitly.

## Linear

- **Team key:** `CAR` (use this in PR magic words: `Fixes CAR-NNN`).
- **Project name:** `Ledger` (matches the GitHub repo `ledger-finance`).
- **Common labels:** `Feature`, `Bug`, `Improvement`, `refactor`, `chore`, `tech-debt`, `frontend`, `data`, `ux`, `accessibility`, `documentation`, `web-ui`. (`firmware` and `hardware` exist on the team but are for other projects — don't apply them here.)
- **State map:** standard names match the global workflow exactly (`Backlog`, `Ready`, `In Progress`, `QA`, `Ready for Testing`, `PR Ready`, `Done`, `Canceled`, `Duplicate`).

## Commands

```bash
npm run dev      # Vite + Electron, dev mode
npm run build    # Vite production build + electron-builder → dist-app/
npm run preview  # Vite preview only (browser, no Electron)
npm test         # Vitest run (added in CAR-75)
npm run test:watch   # Vitest watch mode
```

No lint script is configured. Self-review the diff manually before moving an issue to QA.

## Code style

- Renderer code lives in `src/renderer/`. Inline-styled React using the `A` token object from `theme.js`. Do NOT hardcode color hex values — go through `A`.
- IBM Plex Mono is the only font. All-caps labels use the `<ALabel>` component (`Shared.jsx`).
- Pure logic modules use `.mjs` extension and have no React imports. Tests for `.mjs` modules co-locate as `<module>.test.mjs`.

## Test runners

The repo currently has two test runners coexisting:
- **`node:test`** — used by `alerts.test.mjs`, `charts.test.mjs`, `period.test.mjs`, `planning.test.mjs`. These predate CAR-75.
- **`vitest`** — installed in CAR-75. The Vitest config narrows the include glob so it only picks up Vitest-style files (anything outside the explicit allowlist must be `node:test` style).

**A separate Linear issue (TBD) tracks unifying these onto Vitest.** Until that ships, do not change the include glob without checking the runner each existing test file uses.

## When opening a PR

1. Ensure the issue is in `QA` (self-reviewed) before pushing.
2. `git push -u origin HEAD`
3. `gh pr create --base dev-master --title "CAR-NNN: ..." --body "...Fixes CAR-NNN"` — always `--base dev-master`.
4. Move the Linear issue to `Ready for Testing`.
5. After merge, move to `Done`.
