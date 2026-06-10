# macOS Code-Signing & Notarization (CAR-213)

LEDGER's release workflow signs and notarizes the macOS build on GitHub's
`macos-latest` runners. **No certificates ever live in the repo or on a
developer machine** — they're read from GitHub Actions **secrets** at build time.

When the secrets are absent, electron-builder skips signing (per its
documented behavior): the x64 artifact is left unsigned and the arm64 artifact
gets an ad-hoc signature, and notarization is skipped — so the release workflow
never breaks for contributors without the credentials.

## What you need (one-time)

An active **Apple Developer Program** membership ($99/yr), then:

1. **Developer ID Application certificate** exported as a `.p12`
   (Keychain Access → your "Developer ID Application: …" cert → right-click →
   Export → set a password).
2. The **`.p12` password** from that export.
3. An **app-specific password** for your Apple ID
   (<https://appleid.apple.com> → Sign-In and Security → App-Specific Passwords).
4. Your **Team ID** (10 chars, e.g. `AB12CD34EF` — App Store Connect →
   Membership, or `xcrun altool`/Developer portal).

## GitHub repository secrets to set

Settings → Secrets and variables → Actions → **New repository secret**:

| Secret | Value |
|--------|-------|
| `MAC_CERT_P12_BASE64` | the `.p12` file, base64-encoded (see below) |
| `MAC_CERT_PASSWORD` | the password you set when exporting the `.p12` |
| `APPLE_ID` | your Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | the app-specific password from step 3 |
| `APPLE_TEAM_ID` | your 10-character Team ID |

Base64-encode the cert (macOS/Linux):

```bash
base64 -i DeveloperID.p12 | pbcopy   # macOS: now paste into the secret
base64 -w0 DeveloperID.p12           # Linux: copy the output
```

(The Windows signing secrets `WINDOWS_CERT_PFX_BASE64` / `WINDOWS_CERT_PASSWORD`
are independent and optional — same pattern for the Windows leg.)

## How it runs

`.github/workflows/release.yml` → `build` job → **Package (macOS)** step passes
those secrets to `electron-builder --mac` as `CSC_LINK`, `CSC_KEY_PASSWORD`,
`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`. With
`build.mac.notarize: true` + `hardenedRuntime: true` + the entitlements in
`build/entitlements.mac.plist`, electron-builder signs, staples, and notarizes
the `.dmg`/`.zip`.

Trigger a release by pushing a `v*` tag (or run the workflow manually with
`dry_run` to build artifacts without creating a Release).

## Verifying a signed build (on a Mac)

```bash
spctl -a -vvv -t install "LEDGER.app"          # → "accepted, source=Notarized Developer ID"
codesign --verify --deep --strict "LEDGER.app"  # no output = OK
xcrun stapler validate "LEDGER-<version>.dmg"    # → "The validate action worked"
```

## Notes

- **Hardened runtime is mandatory for notarization**; the entitlements grant the
  JIT / unsigned-executable-memory / dyld-env permissions Electron's V8 requires.
- The config is locked by `src/main/mac-signing.test.mjs` so the signing pieces
  can't be silently dropped.
- Signing/notarization **only run on macOS** — they cannot be exercised on the
  Windows/Linux matrix legs or locally on a non-Mac host.
