# Packaging LEDGER as a Desktop App

LEDGER ships as an [Electron](https://www.electronjs.org/) app and is packaged with [electron-builder](https://www.electron.build/). The renderer is built with Vite into `dist/`, and electron-builder bundles `dist/` + `src/main/` into a platform-native installer in `dist-app/`.

## Quick Start (Windows)

```bash
npm install
npm run package:win
```

The installer lands at `dist-app/LEDGER-Setup-1.0.0.exe`.

Double-click the `.exe` to install. The installer is an **NSIS** wizard:
- per-user install (no admin prompt),
- you can change the install directory,
- creates Start Menu + Desktop shortcuts,
- ships an uninstaller in `Add or remove programs`.

## Scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` | Vite dev server + Electron with live reload (hot DevTools) |
| `npm run build` | Vite build only — emits the renderer to `dist/` |
| `npm run package` | Vite build + electron-builder for the **current OS** |
| `npm run package:win` | Vite build + Windows NSIS `.exe` installer |
| `npm run package:mac` | Vite build + macOS `.dmg` (requires running on macOS) |
| `npm run package:linux` | Vite build + Linux `AppImage` |
| `npm test` | Run vitest suite |

## Outputs

```
dist/         # Vite renderer build (gitignored)
dist-app/     # electron-builder artifacts (gitignored)
  LEDGER-Setup-1.0.0.exe       # Windows NSIS installer
  win-unpacked/                # unpacked app folder
  builder-effective-config.yaml
  ...
```

## Configuration

All packaging config lives in the top-level `"build"` block of `package.json`:

- `appId`: `com.ledger.finance`
- `productName`: `LEDGER`
- `files`: only ships `dist/**` (renderer) + `src/main/**` (Electron main) + `package.json` — no source-tree leaks
- `win.target`: NSIS, x64 only (32-bit not supported)
- `nsis`: per-user install, user-chosen directory, with Start Menu + Desktop shortcuts

## Code Signing

**Not configured for v1.** Users will see Windows SmartScreen on first install ("Don't run / Run anyway").

Follow-ups tracked in:
- [CAR-214](https://linear.app/carloshrdezc/issue/CAR-214) — Windows code signing
- [CAR-213](https://linear.app/carloshrdezc/issue/CAR-213) — macOS notarization

## Auto-Update

**Not configured for v1.** Users update by re-running a fresh installer. Tracked in [CAR-215](https://linear.app/carloshrdezc/issue/CAR-215).

## Troubleshooting

**"electron-builder couldn't find an icon"** — there's no custom icon yet, so electron-builder uses Electron's default. Add `build/icon.ico` (256×256) to override.

**"resource (e.g. wasm) not found at runtime"** — make sure the file is referenced from the renderer source so Vite picks it up; or add it to `build.extraResources` and load via `process.resourcesPath`.

**"the app launches but the window is blank"** — usually a renderer path issue. The main process loads `dist/index.html` via a relative path; if Vite emits to a different `outDir`, update both `vite.config.js` and `src/main/index.js`.

**"npm run package:win takes forever the first time"** — electron-builder downloads ~150MB of winCodeSign + nsis binaries to `~/AppData/Local/electron-builder/Cache/`. Cached after the first run.

## CI Builds

Not yet wired — tracked in [CAR-216](https://linear.app/carloshrdezc/issue/CAR-216) (build & attach `.exe` on tagged releases).
