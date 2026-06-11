# Windows Code-Signing & Auto-Update (CAR-363)

LEDGER's Windows auto-update **requires the installer to be Authenticode
code-signed**. electron-updater verifies the downloaded `LEDGER-Setup-*.exe`
against the publisher name baked into the installed app's `app-update.yml`
(`publisherName`). An **unsigned** build has `SignerCertificate: null`, fails
that check, and the update is silently rejected — the app downloads it but never
installs it.

> First-time installs are NOT signature-verified, which is why an unsigned
> v1.0.2 installs fine. **Auto-updates are verified**, so every Windows
> auto-update is blocked until builds are signed.

> **Interim (CAR-365, since v1.0.5):** `build.win.verifyUpdateCodeSignature` is
> set to `false`, so the updater accepts unsigned installers and auto-update
> works without a cert. This weakens update-channel tamper protection (see
> trade-off below). **Re-enable signature verification (delete that flag) once a
> real cert is configured** per this doc.

## What you need (one-time)

An **Authenticode code-signing certificate**. Options:

| Type | Notes |
|------|-------|
| **OV (Organization Validation)** | ~$200-400/yr (Sectigo, DigiCert, SSL.com). Subject CN = your org's registered name. |
| **EV (Extended Validation)** | Pricier, hardware-token or cloud HSM; instantly trusted by SmartScreen. |
| **Azure Trusted Signing** | ~$10/mo, Microsoft-run; CN = your verified identity. Modern, no physical token. |
| **Individual** | Some CAs issue to individuals; CN = your legal name. |

The cert must be exportable as a `.pfx` (PKCS#12) with a password, **or** be
usable via a signing service electron-builder supports.

## GitHub repository secrets to set

Settings → Secrets and variables → Actions:

| Secret | Value |
|--------|-------|
| `WINDOWS_CERT_PFX_BASE64` | the `.pfx` file, base64-encoded |
| `WINDOWS_CERT_PASSWORD` | the `.pfx` export password |

```bash
base64 -w0 codesign.pfx        # Linux — copy output into the secret
base64 -i codesign.pfx | pbcopy  # macOS
certutil -encode codesign.pfx out.txt   # Windows (strip the BEGIN/END lines)
```

The release workflow's **Package (Windows)** step already wires these in as
`CSC_LINK` / `CSC_KEY_PASSWORD` — once set, builds sign automatically.

## ⚠️ Critical: `publisherName` must match the cert's Subject CN

`package.json` → `build.win.signtoolOptions.publisherName` is currently
**`"LEDGER"`**. electron-updater compares the *downloaded* installer's signature
Subject CN against this value. **It must equal your certificate's Subject CN.**

- If your cert CN is e.g. `"Carlos Hernández"` or `"Acme Inc"`, change
  `publisherName` to exactly that string before the first signed release.
- `publisherName` can be an array to allow multiple CNs (useful during a CA
  migration): `"publisherName": ["Acme Inc", "LEDGER"]`.

## ⚠️ One-time migration caveat (already-installed v1.0.x)

Every **already-installed** build froze `publisherName: ["LEDGER"]` into its
`app-update.yml`. The first **signed** build's cert CN will almost certainly NOT
be the literal string `"LEDGER"`, so those existing installs will **reject** the
first signed update (same "not signed by the application owner" error).

Mitigations:
1. **Easiest:** existing users do a **one-time manual reinstall** of the first
   signed release. From then on, auto-update works (their `app-update.yml` now
   carries the real CN).
2. **Smoother bridge:** if you can obtain a cert whose CN is literally `LEDGER`
   (e.g. register an org named "LEDGER"), no reinstall is needed. Usually not
   worth it.

New installs from the first signed build onward auto-update normally.

## Verifying a signed build (on Windows)

```powershell
Get-AuthenticodeSignature "LEDGER-Setup-<version>.exe" | Format-List
# Status should be 'Valid'; SignerCertificate.Subject should show your CN.
signtool verify /pa /v "LEDGER-Setup-<version>.exe"
```

## Why this matters beyond updates

A signed installer also avoids the Windows **SmartScreen "unknown publisher"**
warning on first run — a major UX win for distribution.
