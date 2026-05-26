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

**Status:** Windows code-signing scaffold landed in CAR-214. Signing turns on automatically once a cert is provisioned via `CSC_LINK` + `CSC_KEY_PASSWORD`; until then, unsigned builds continue to work.

### EV vs OV certificate options

| Type | Cost (yr) | SmartScreen reputation | Storage | Recommended |
|------|-----------|------------------------|---------|-------------|
| EV   | $300-500  | Instant | Hardware token (USB) or cloud HSM (Azure KV, DigiCert ONE) | Yes for solo dev — instant trust |
| OV   | $80-200   | Builds slowly (after ~thousands of installs) | Software `.pfx` | Cheaper but worse UX |

### Vendor recommendations

Good places to start: SSL.com, DigiCert, Sectigo, and Certum. Certum can be cheaper for OV certificates (often around ~$70/yr) but validation is slower.

### Local signing flow

Once the certificate is acquired, set the env vars and build the Windows installer:

```bash
# OV (.pfx file):
export CSC_LINK="C:\path\to\cert.pfx"
export CSC_KEY_PASSWORD="your-password"
npm run package:win

# Verify:
signtool verify /pa dist-app/LEDGER-Setup-1.0.0.exe
```

### EV cert / hardware token note

The `.pfx` flow above does **not** work for EV USB tokens. Those need either:
- cloud-HSM signing (Azure Key Vault + `azuresigntool` — supported by electron-builder via custom sign script), or
- manual `signtool` with `/n "Cert CN"` after build as a fallback.

### CI signing flow

The GitHub Actions env shape is:

```yaml
env:
  CSC_LINK: ${{ secrets.WINDOWS_CERT_PFX_BASE64 }}
  CSC_KEY_PASSWORD: ${{ secrets.WINDOWS_CERT_PASSWORD }}
```

`CSC_LINK` accepts either a filesystem path or a base64-encoded `.pfx` blob. For GitHub Actions, base64 is the right choice because it avoids checking in a cert file.

## Releases & CI

The `release.yml` GitHub Actions workflow builds installers for all 3 platforms on every `v*` tag and attaches them to a GitHub Release.

### Cutting a release

1. Bump `version` in `package.json` and commit.
2. Tag and push:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
3. The workflow runs automatically, builds Windows + macOS + Linux installers in parallel, and creates a GitHub Release with all artifacts attached.

### Testing the workflow without a real release

Use the `workflow_dispatch` trigger from the Actions tab on GitHub. This builds artifacts (downloadable from the run's artifacts panel for 30 days) but does NOT create a Release.

### Signing in CI

Code-signing turns on automatically when these secrets are present in the repo settings:

| Secret | Purpose | Required for |
|---|---|---|
| `WINDOWS_CERT_PFX_BASE64` | base64 of a `.pfx` file | Windows signing (CAR-214) |
| `WINDOWS_CERT_PASSWORD` | `.pfx` password | Windows signing |
| `MAC_CERT_P12_BASE64` | base64 of a Developer ID `.p12` | macOS signing (CAR-213) |
| `MAC_CERT_PASSWORD` | `.p12` password | macOS signing |
| `APPLE_ID` | Apple ID email | macOS notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from appleid.apple.com | macOS notarization |
| `APPLE_TEAM_ID` | 10-char Apple Team ID | macOS notarization |

When secrets are unset, builds produce UNSIGNED artifacts (a warning is logged but the build succeeds). This means the workflow ships today; signing turns on the moment secrets are provisioned.

To encode a `.pfx` or `.p12` for the secret value: `base64 -w 0 cert.pfx | clip` (Linux/macOS) or `[Convert]::ToBase64String([IO.File]::ReadAllBytes('cert.pfx')) | Set-Clipboard` (PowerShell).

### Verification commands

```bash
signtool verify /pa /v dist-app/LEDGER-Setup-1.0.0.exe
# Expected output (after cert is real):
# "Successfully verified: dist-app/LEDGER-Setup-1.0.0.exe"
```

### Important note on `publisherName`

`package.json` `win.signtoolOptions.publisherName` must match the certificate Subject CN exactly. For example, if the cert Subject CN is `Carlos Hernandez`, the config must use `Carlos Hernandez` or signing fails with a mismatch error.

### Acceptance criteria status

- [x] Configuration in `package.json` is ready for a cert (env-var-gated)
- [x] Local and CI signing flows are documented
- [ ] Signed `.exe` validates via `signtool verify /pa` — pending cert acquisition
- [ ] SmartScreen shows the publisher name — pending cert + first installs

## Auto-update

LEDGER uses `electron-updater` to check for tagged GitHub Releases on app launch. The installed app downloads the new build in the background and prompts the user to restart once the update is ready.

### Release flow

1. Bump `package.json` `version` using semver.
2. Commit the change and push a `v<version>` tag.
3. GitHub Actions (`.github/workflows/release.yml`) builds Windows, macOS, and Linux installers and publishes a GitHub Release.
4. Installed apps read the release metadata files (`latest.yml`, `latest-mac.yml`, `latest-linux.yml`) from GitHub Releases.
5. When the app starts, it waits 10 seconds, checks for updates, downloads the new build in the background, and installs it on quit.

### Detection cycle

Auto-update runs once on launch after a 10-second delay so it does not compete with cold-start IPC. This repo does **not** do periodic polling; the check happens on launch only.

### Platform notes

- **Windows:** works with the current scaffold, including unsigned builds. SmartScreen may re-flag each new version until code signing is enabled.
- **macOS:** blocked on CAR-213 code signing / notarization. Until that lands, mac builds will not auto-update.
- **Linux:** uses the AppImage update flow.

### How to test locally

Local testing is awkward because `electron-updater` expects an installed app that can read a real release feed. The most realistic check is to publish a pre-release from a test branch, install that build, then bump `version` and confirm the installed app detects the new tag on next launch.

### Acceptance status

- [x] GitHub Release publishing is configured in `package.json`
- [x] The app checks for updates after launch and downloads in the background
- [x] A restart banner appears when an update is downloaded
- [x] The user can trigger restart from the banner
- [x] Release flow and local testing notes are documented
- [ ] macOS auto-update is still blocked on CAR-213 signing
- [ ] Signed builds still need end-to-end validation on real release artifacts

## Troubleshooting

**"electron-builder couldn't find an icon"** — there's no custom icon yet, so electron-builder uses Electron's default. Add `build/icon.ico` (256×256) to override.

**"resource (e.g. wasm) not found at runtime"** — make sure the file is referenced from the renderer source so Vite picks it up; or add it to `build.extraResources` and load via `process.resourcesPath`.

**"the app launches but the window is blank"** — usually a renderer path issue. The main process loads `dist/index.html` via a relative path; if Vite emits to a different `outDir`, update both `vite.config.js` and `src/main/index.js`.

**"npm run package:win takes forever the first time"** — electron-builder downloads ~150MB of winCodeSign + nsis binaries to `~/AppData/Local/electron-builder/Cache/`. Cached after the first run.

## CI Builds

See [Releases & CI](#releases--ci) for the tag-triggered release workflow tracked in [CAR-216](https://linear.app/carloshrdezc/issue/CAR-216).
