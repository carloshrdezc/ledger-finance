# CAR-239 — App Security: Design

**Status:** Draft → review
**Date:** 2026-05-26
**Linear:** [CAR-239](https://linear.app/carloshrdezc/issue/CAR-239)
**Implements for:** TBD (implementation issue filed when this spec lands; provisionally CAR-240)
**Dependencies:** CAR-77 (backup/restore — recovery flow shares format constraints)

## Summary

Define the data-protection layer for Ledger. The app currently stores all financial data in plaintext on disk and behind no authentication. This spec adds **(a)** at-rest encryption of the persistent store and **(b)** an app-lock UI gated by the user's choice of one or more authentication methods — **PIN, password, or passkey (WebAuthn)** — picked independently in Settings. Idle auto-lock and a 12-word recovery code (always retrievable while authenticated) round out the model. Both Electron desktop and the mobile-web preview build are in scope; they share the same on-disk format and Settings UI but differ in the crypto/auth primitives they reach for.

This spec does **not** define a multi-user model, a "guest" mode, cloud sync, or remote attestation.

## Problem

Today:

- `src/main/disk-store.mjs` writes the full app state as **plaintext JSON** to a single file in the Electron `userData` directory. Atomic rename, fsync, no encryption.
- `src/renderer/store.jsx` `useLS(key, default)` mirrors that state into `localStorage` slice-by-slice. The browser-fallback build (`npm run preview`) lives entirely in `localStorage`, also plaintext.
- `src/renderer/screens/mobile/Settings.jsx` and `src/renderer/screens/web/WebSettings.jsx` expose DISPLAY / FX RATES / BUDGETS / DATA sections. **Neither has a Security section today** — the user (Carlos) reported a "Security" item in mind, but the surface does not currently exist; this spec creates it.
- Anyone who opens the app — by walking up to an unlocked laptop, by mounting the disk on another machine, or by inspecting `localStorage` via DevTools in the browser preview — sees every transaction, account balance, goal, and bill in clear text.

The asymmetry hurts: a finance app is exactly the class of software where the user expects an unlock screen and encryption-at-rest by default, and Ledger has neither.

## Goal

After this spec ships and its implementation lands:

1. **At rest, the persistent store is opaque.** The Electron disk file is an authenticated-encryption blob; the browser `localStorage` payload is the same blob format. Reading the bytes off-device yields nothing without an unlock secret.
2. **At runtime, the UI is gated** by an unlock screen on every cold start and after configurable idle. The user picks any combination of PIN, password, and passkey to unlock; each method is independently enabled/disabled and stored as its own key-wrapper.
3. **Recovery is local-only and always available** to an already-authenticated user via Settings. A 12-word phrase, generated once at security-setup and re-derivable on demand, can rebuild the master key if the user loses every primary method.
## Decisions (from brainstorm)

| # | Question | Decision |
|---|---|---|
| 1 | Lock-UI vs encrypt-at-rest | **Both.** Both must be implemented; neither alone is sufficient. |
| 2 | Auth methods | **All three** — PIN, password, passkey. User enables each independently in Settings. At least one must be enabled once security is turned on. |
| 3 | Recovery model | **Recovery code (12-word) + OS-keychain escrow on Electron.** No cloud. No email. |
| 4 | Recovery-code retrieval | **Always available in Settings** while the user is authenticated. Not a one-time reveal. |
| 5 | Multi-user | **No.** Single-user only. |
| 6 | Platforms | **Electron desktop + mobile-web (`npm run preview`).** Both ship in v1; share UI, share on-disk format, differ in crypto primitives. |
| 7 | Idle auto-lock | **Yes, default 5 minutes, configurable.** Can be disabled. |
| 8 | Cold-start lock | **Always.** Never remember-me. |
| 9 | Security off by default | **Yes.** Existing users on upgrade keep plaintext until they opt in. New users see a non-blocking "secure your data" prompt on first run. |

## Non-goals (separate issues)

- **Multi-user / family mode** — out of scope. If ever wanted, file a new spec.
- **Cloud key escrow / sync** — out of scope. Recovery is local-only.
- **Remote wipe / panic mode** — out of scope; deferred to a follow-up if real demand surfaces.
- **Hardware-token (FIDO2 security key) as a *separate* method** — covered implicitly by passkey (WebAuthn supports both platform authenticators and roaming keys).
- **Audit log of unlock attempts** — out of scope for v1; rate-limit counters live in memory and the encrypted store, not a user-visible log.
- **Encrypted backup format for CAR-77** — CAR-77 currently exports plaintext JSON. Aligning its export with the encrypted-at-rest format is a follow-up (CAR-241, to be filed).
- **Re-encrypting a *running* store after a master-key rotation triggered by changing the recovery code** — covered as a deferred behaviour; see Open Questions.

## Inputs

The spec works over the existing data shapes; **no new top-level fields are invented in any user-visible record** (transactions, accounts, goals, etc.). The store layer adds a sibling document for security metadata.

```
Existing (today, plaintext):
  ledger.json
    {
      "ledger:tx":        [...],
      "ledger:accounts":  [...],
      "ledger:cats":      {...},
      ... (~16 slices)
    }

After this spec:
  ledger.json            (encrypted blob — see "On-disk format" below)
  ledger-security.json   (NOT encrypted — key-wrappers and config; see below)
```

`ledger-security.json` exists separately because:
- It must be readable *before* the user authenticates (to know which methods are enabled and to pull the right wrapper).
- It contains no plaintext financial data; only public security metadata + key-wrappers.
- Keeping it separate means a corrupted main store doesn't take security config with it (and vice versa).

In the browser-fallback build the same two payloads live as two `localStorage` keys: `ledger:encrypted` and `ledger:security`.

## Threat model

We protect against, ranked by likelihood for a single Mexico-City-based user running this on a personal laptop and a phone:

| Threat | Mitigated? | How |
|---|---|---|
| **T1.** Friend / family / coworker grabs the unlocked laptop and opens Ledger | ✅ | App-lock on idle. User must re-auth via PIN/password/passkey. |
| **T2.** Attacker steals laptop powered-off, mounts the disk, reads the JSON | ✅ | At-rest encryption. The blob is unreadable without a key derived from a secret the attacker doesn't have. |
| **T3.** Attacker has a remote shell on the unlocked, signed-in machine while Ledger is closed | ✅ | At-rest encryption + cold-start lock. Without the secret, they cannot decrypt the store; without unlocking the app, the in-memory key is never derived. |
| **T4.** Attacker has a remote shell on the machine while Ledger is **open and unlocked** | ❌ | Out of scope. The decrypted state lives in renderer memory; an attacker with code execution at this point owns the data anyway. |
| **T5.** Attacker steals the phone and opens the browser-preview build | ✅ | Same encrypted-at-rest blob in IndexedDB / localStorage; same lock screen on app open. |
| **T6.** Phishing / fake unlock screen | ⚠️ Partial | Passkey is phishing-resistant by design. PIN/password are not, but for a desktop app served from `file://` or a single trusted origin the attack surface is small. |
| **T7.** Forensic recovery of plaintext JSON written *before* the user enabled security | ❌ | Out of scope; documented in Open Questions. The migration overwrites the plaintext file but cannot guarantee secure deletion at the filesystem layer. |

The two threats we explicitly do NOT chase are T4 (in-memory after unlock — fundamentally hard, requires OS-level isolation) and T7 (already-written plaintext — requires shred-equivalent guarantees we cannot make portably).

## On-disk format

### Encrypted store blob (`ledger.json` on Electron, `ledger:encrypted` in browser)

```json
{
  "v": 1,
  "alg": "AES-256-GCM",
  "iv":  "<24-char base64 = 16 bytes>",
  "ct":  "<base64 ciphertext>",
  "tag": "<22-char base64 = 16 bytes auth tag>",
  "aad": "ledger-store-v1"
}
```

- **`v`** — format version. Bumps on schema change. Decryption refuses unknown versions.
- **`alg`** — fixed `"AES-256-GCM"` in v1. Field exists for future migration without a v-bump.
- **`iv`** — 16-byte random nonce, regenerated on every write. Never reused with the same key.
- **`ct`** — ciphertext of `JSON.stringify({ "ledger:tx": [...], ... })` — the same payload the disk store writes today, just encrypted.
- **`tag`** — GCM authentication tag. Tamper-evident.
- **`aad`** — additional authenticated data, fixed string `"ledger-store-v1"`. Binds ciphertext to format.

The plaintext payload format inside `ct` is **byte-identical** to today's `ledger.json`. The disk-store and renderer hydration paths see no schema change; only an encrypt/decrypt step on either side of `JSON.stringify`/`JSON.parse`.

### Security metadata (`ledger-security.json` on Electron, `ledger:security` in browser)

```json
{
  "v": 1,
  "enabled": true,
  "methods": {
    "pin":      { "enabled": true,  "wrapper": <KeyWrapper>, "rateLimit": <RateLimitState> },
    "password": { "enabled": false, "wrapper": null,         "rateLimit": null },
    "passkey":  { "enabled": true,  "wrapper": <KeyWrapper>, "credentialIds": ["<base64>"] }
  },
  "recovery": { "wrapper": <KeyWrapper> },
  "osEscrow": { "enabled": true,  "wrapper": <KeyWrapper> },
  "idleLockMs": 300000,
  "createdAt": "2026-05-26T18:00:00Z",
  "lastUnlockAt": "2026-05-26T18:00:00Z"
}
```

`KeyWrapper` is the per-method record that wraps the **master key (MK)** — a 32-byte random secret generated once at security-setup. Each enabled method holds its own wrapper that decrypts to the same MK; that's what lets the user enable any combination simultaneously.

```json
{
  "kdf":      "argon2id" | "pbkdf2-sha256" | "webauthn-prf" | "platform-keychain",
  "kdfParams": { ... method-specific },
  "salt":     "<base64>",
  "iv":       "<base64>",
  "wrappedMK":"<base64>",
  "tag":      "<base64>"
}
```

**`ledger-security.json` is NOT encrypted.** All wrappers are themselves AEAD-encrypted blobs whose decryption requires the corresponding secret/biometric/passkey. Reading the security file off-device tells the attacker which methods are enabled but yields no MK.

`RateLimitState` is `{ "failures": int, "lockedUntil": ISO-string | null }` — incremented on bad attempts, persisted so closing the app doesn't reset the counter.

## Key derivation per method

The **master key (MK)** is the only secret that decrypts the store. Every enabled method derives a **wrapping key (WK)** which AEAD-encrypts MK. Unlock = derive WK from the user's secret → decrypt wrapper → recover MK → decrypt store.

### PIN

- 4–8 digits, user choice. Length is **public** (stored alongside `wrapper`) so the unlock UI knows how many slots to draw; this leak is acceptable.
- KDF: **Argon2id** with parameters tuned for ~250 ms on a mid-range laptop:
  - `memoryCost: 64 MiB`, `timeCost: 3`, `parallelism: 1`, `hashLength: 32`.
  - `salt`: 16 random bytes, per-install.
- Rate limit: exponential backoff. `failures` count persists across app restarts.

  | failures | next attempt allowed after |
  |---|---|
  | 1–4  | immediate |
  | 5    | 30 s |
  | 6    | 2 min |
  | 7    | 10 min |
  | 8    | 1 hour |
  | 9+   | 24 hours |

  After 10 cumulative failures, the PIN method auto-disables and the user must use another method (password, passkey, or recovery code) to re-enable it.

### Password

- Minimum 8 characters. No upper bound (Argon2id handles it). No composition rules — length matters more than alphabet.
- KDF: **Argon2id** with the same parameters as PIN. Same `salt` semantics.
- Rate limit: same table as PIN, but no auto-disable — passwords are presumed harder to guess so we let the user grind through backoff rather than locking themselves out.

### Passkey (WebAuthn)

- Method-of-choice on Electron 30+ and modern browsers. Phishing-resistant.
- The Relying-Party ID is `app.ledger.local` (Electron) or `localhost` / the served origin (browser preview). This is documented as a known awkwardness — see Open Questions.
- We use the **PRF (`prf` extension)** to derive a stable 32-byte secret from the authenticator without persisting any user-side material:
  - At enrolment: create credential with `extensions.prf.eval.first = <random 32-byte salt>`. Store `salt` and `credentialId` in the wrapper.
  - At unlock: `navigator.credentials.get` with `extensions.prf.eval.first = <stored salt>` returns 32 bytes → that's the WK.
- If the platform refuses PRF (older authenticators), we fall back to using `userHandle` + a stored salt and HKDF; the wrapper records which path was used.
- No rate limit needed — the authenticator enforces its own.

### OS-keychain escrow (Electron only, optional second factor for recovery)

- Uses Electron `safeStorage` (Windows DPAPI on this machine; Keychain on macOS).
- Stores a copy of MK encrypted under the OS user's account secret. Fully transparent — no user prompt, no UX.
- **Not exposed as a primary unlock method.** It exists solely so a user who lost their PIN/password/passkey *and* recovery code can still unlock if they're signed into the same OS account that set up the app.
- Disabled if the user explicitly turns off "OS escrow" in Settings (advanced toggle, default ON).

### Recovery code

- 12 words from the BIP39 English wordlist (128 bits of entropy + 4-bit checksum).
- KDF: **PBKDF2-HMAC-SHA-256, 600 000 iterations** over the normalized phrase. Salt is fixed to a per-install value.
- Wrapper stored in `recovery.wrapper`. Decrypts to the same MK.
- Generated **once** at security-setup. Re-derivable on demand from Settings (the wrapper itself can be decrypted by any currently-enabled primary method, then re-rendered to the user as words). This is what makes "always retrievable" possible without storing the words plaintext.
- Rate limit: same as password, no auto-disable.

## Browser-fallback differences

The browser build (`npm run preview`) cannot use Electron `safeStorage` and cannot encrypt with Node's `crypto`. The differences:

| Concern | Electron | Browser |
|---|---|---|
| Symmetric crypto | Node `crypto` (`createCipheriv("aes-256-gcm")`) | `window.crypto.subtle` (`SubtleCrypto.encrypt({ name:"AES-GCM" })`) |
| Argon2id | `argon2` npm package via main process | WASM build of `argon2-browser` loaded once at unlock-screen render |
| Passkey | Same WebAuthn API; RP ID = `app.ledger.local` (custom protocol) | Same WebAuthn API; RP ID = served origin |
| OS escrow | `safeStorage` + DPAPI/Keychain | **Not available.** `osEscrow.enabled` is forced `false`. |
| Storage | `userData/ledger.json` + `ledger-security.json` | `localStorage["ledger:encrypted"]` + `localStorage["ledger:security"]` |
| Idle detection | `powerMonitor` + window blur events | `document.visibilitychange` + manual mouse/keyboard inactivity timer |

The on-disk format is **identical bytes** across both. A user who exports an encrypted backup on Electron and imports it on the phone-browser unlocks it with the same secret.

## Rules

Numbered for reference; the implementer must satisfy each.

**R1.** Security is opt-in and off by default. The app boots into the existing flow until the user runs "Set up security" from Settings.

**R2.** Setup flow:
  1. User picks at least one primary method (PIN, password, or passkey). May enable multiple.
  2. App generates a random 32-byte MK and a random 12-word recovery phrase.
  3. App wraps MK under each enabled method and (on Electron) under OS escrow.
  4. App displays the recovery phrase with an "I've written it down" confirmation. **The phrase remains retrievable from Settings later** — confirmation is a UX nudge, not a security primitive.
  5. App re-encrypts the existing plaintext store under MK and writes the encrypted blob.
  6. The plaintext file is overwritten with random bytes once and then with the encrypted blob (best-effort secure-delete; documented as not bulletproof).

**R3.** Unlock flow on cold start:
  1. Read `ledger-security.json`. If `enabled === false`, skip lock.
  2. Render the lock screen showing only methods where `methods.<x>.enabled === true`.
  3. User attempts a method. Derive WK → decrypt wrapper → MK in memory.
  4. Decrypt the store blob with MK. Hydrate renderer state via the existing `useLS` initial-value path.
  5. Reset `failures` to 0 on success.

**R4.** Unlock flow on idle: same as R3 step 2 onward, but renderer state is *retained* in memory and only re-checked once unlocked. (We don't wipe and re-decrypt — that'd lose unsaved UI state and create a gratuitous I/O burst.)

**R5.** Lock triggers (any of these locks the app immediately):
  - App cold start (always).
  - `idleLockMs` elapsed with no user input (default 300 000 = 5 min). Honour `0` as "never" if the user disabled it.
  - User clicks "Lock now" in the Settings or app menu.
  - Window blurs for >`idleLockMs` (Electron) / tab hidden for >`idleLockMs` (browser).

**R6.** Recovery code:
  - Generated once at setup. Persists for the life of the install unless the user explicitly rotates it.
  - Settings shows "Reveal recovery phrase" gated behind the user's currently-active unlock method (re-prompt; not the cached unlock from app start).
  - "Rotate recovery phrase" generates a new phrase and overwrites `recovery.wrapper`. The old phrase no longer works.

**R7.** Add/remove methods:
  - Adding a method requires the user to be already authenticated. App holds MK in memory, derives a new WK from the new secret, writes the new wrapper.
  - Removing a method deletes its wrapper. Removing the last enabled method is refused; the user must add another or fully disable security first.
  - Disabling security entirely: requires re-authentication, decrypts the store back to plaintext, deletes both `ledger-security.json` and the wrappers, returns to today's behaviour.

**R8.** Failed-unlock behaviour:
  - Per-method `failures` counter increments on each bad attempt.
  - Backoff is enforced by refusing to compute the KDF until `lockedUntil` has passed. The lock screen displays the remaining time.
  - After PIN auto-disables (10 cumulative failures), the lock screen no longer shows PIN until re-enabled from Settings via another method.

## Invariants

**I1.** **MK is the single source of decryption.** Every method's wrapper, when correctly unwrapped, yields exactly the same 32-byte MK. The store blob's `tag` verifies under no other key.

**I2.** **MK exists only in memory and only while the app is unlocked.** Cold start, idle-lock, and "Lock now" all clear the in-process MK reference. There is no on-disk plaintext copy of MK at any point.

**I3.** **Every IV is unique per (key, message).** AES-GCM IVs are generated with a CSPRNG on every encrypt; collisions across writes are computationally negligible (16-byte random IV).

**I4.** **Tampering with the encrypted store is detected on read.** A modified `ct` or `tag` causes GCM verification to fail; the app refuses to load the store and surfaces a "store is corrupt or has been modified" recovery flow rather than starting from blank state.

**I5.** **At least one unlock method is always enabled when `enabled === true`.** Disabling the last primary method is refused; toggling security off is the only way to reach a zero-method state.

**I6.** **Plaintext store and encrypted store never coexist on disk.** The setup migration writes the encrypted blob, then deletes (overwrite + unlink) the plaintext, in that order with `fsync` between. A crash mid-migration leaves either pure-plaintext or pure-encrypted but never both.

**I7.** **Rate-limit state survives app restart.** `failures` and `lockedUntil` live in `ledger-security.json`. Closing and reopening the app does not reset the counter.

**I8.** **The recovery phrase is always retrievable from Settings while authenticated** — it is *displayed* not *re-generated*. Calling "Reveal recovery phrase" twice on the same install yields the same 12 words.

**I9.** **Browser-fallback build never advertises OS escrow.** The Settings UI hides the toggle and `osEscrow.enabled` is forced `false` during setup if `window.electronAPI` is undefined.

**I10.** **Idle-lock honours the configured value.** A user-set `idleLockMs` of `0` means "never auto-lock"; any positive value is enforced within ±2 s.

## Edge cases & flags

| Edge case | Detection | Behaviour | Flag emitted |
|---|---|---|---|
| `ledger-security.json` exists but main store is plaintext | parse main store as JSON; if it succeeds and matches the legacy shape | Treat as inconsistent state. Log a warning, refuse to start, surface a "Repair" UI that offers re-encrypt-now or recover-from-backup | `STORE_INCONSISTENT` |
| Main store exists but `ledger-security.json` does not | enabled-flag missing | Treat as legacy plaintext install. Boot normally. Show a non-blocking "Secure your data" prompt. | none |
| Main store decrypts but inner JSON is malformed | `JSON.parse` after AEAD success throws | Surface "Backup may be corrupt." Offer to import a CAR-77 backup. Do not auto-reset. | `STORE_PAYLOAD_MALFORMED` |
| User enabled passkey on Electron, then opens browser preview | wrapper requires WebAuthn but origin differs | Lock screen lists only methods whose RP ID matches the current origin; passkey is hidden. PIN/password/recovery still work. | `METHOD_UNAVAILABLE_ON_ORIGIN` |
| User wipes browser data on phone | `localStorage["ledger:security"]` gone | Browser preview behaves like a fresh install. Encrypted blob (if also wiped) gone too. **No data loss on Electron.** | none |
| OS-escrow wrapper decrypt fails (DPAPI key unavailable, e.g. user copied app to a new machine) | `safeStorage.decryptString` throws | Mark `osEscrow.enabled = false` silently. User unlocks with a primary method; on success, re-create OS-escrow wrapper. | `OS_ESCROW_REKEY` (info, not error) |
| Recovery-phrase rotation while a primary method is mid-rate-limit | `lockedUntil > now` for the active method | Refuse rotation until the user can authenticate. Display remaining lock time. | `LOCKED_OUT` |
| User loses every primary method AND the recovery code | all wrappers fail | On Electron with OS-escrow ON: try escrow. If that fails too: surface "Data is unrecoverable. Restore from a CAR-77 backup or reset." | `UNRECOVERABLE` |

## Worked examples

Each example traces concrete state and proves the relevant invariant.

### Example A — First-time setup with PIN only

State before: legacy plaintext install. `ledger-security.json` does not exist. User opens Settings → Security → Set up.

Steps:

1. User picks PIN, types `4729`.
2. App generates `MK = randBytes(32)` — call it `MK_a` (a fixed 32-byte value).
3. App generates `salt_pin = randBytes(16)`, runs `WK_pin = argon2id("4729", salt_pin, m=64MiB, t=3, p=1, len=32)`.
4. App AES-GCM-encrypts `MK_a` under `WK_pin` with random `iv_pin`. Result: `wrapper_pin = { kdf:"argon2id", kdfParams:{...}, salt: salt_pin, iv: iv_pin, wrappedMK: ct_pin, tag: tag_pin }`.
5. App generates 12 BIP39 words, runs `WK_rec = pbkdf2(phrase, fixedSalt, 600k)`, builds `wrapper_rec` the same way around `MK_a`.
6. (Electron) App calls `safeStorage.encryptString(MK_a)`, stores result as `wrapper_osEscrow`.
7. App writes `ledger-security.json` with `enabled:true, methods.pin.enabled:true, recovery.wrapper:wrapper_rec, osEscrow.wrapper: wrapper_osEscrow, idleLockMs: 300000`.
8. App reads existing plaintext `ledger.json`, AES-GCM-encrypts the entire payload under `MK_a` with random `iv_store`, writes encrypted blob.
9. App overwrites the old plaintext path with random bytes once, fsyncs, then writes the new encrypted blob via the existing atomic-rename routine.

Invariant check:
- I1: `unwrap(wrapper_pin, "4729") = MK_a`, `unwrap(wrapper_rec, phrase) = MK_a`, `unwrap(wrapper_osEscrow) = MK_a` ✓
- I2: `MK_a` was held in memory and used; never written to a non-wrapper field. ✓
- I5: exactly one method (`pin`) plus recovery + escrow. ✓
- I6: at no point did both plaintext and encrypted main store files coexist past the atomic rename. ✓

### Example B — PIN unlock after cold start

State: from Example A. App was closed cleanly.

1. App boots. Reads `ledger-security.json`. `enabled === true` → render lock screen.
2. Lock screen lists `pin` (only enabled method).
3. User types `4729`. App runs `WK = argon2id("4729", salt_pin, ...)`, computes `aes-gcm-decrypt(wrapper_pin.wrappedMK, WK, wrapper_pin.iv, wrapper_pin.tag) → MK_a`. Tag verifies. ✓
4. App reads encrypted store blob, decrypts with `MK_a` → plaintext JSON of slices.
5. Renderer hydrates `useLS('ledger:tx', [])` etc. with the slice values.
6. `methods.pin.rateLimit.failures` reset to 0. `lastUnlockAt` updated.

Invariant check: I1 (single MK), I2 (MK held in memory only), I7 (failures reset only on success — if we'd typed a wrong PIN here first, the counter would have incremented and persisted). ✓

### Example C — Wrong PIN three times then correct on the fourth

1. User types `0000`. KDF runs (~250 ms), wrapper decrypt fails (tag mismatch). `failures: 0 → 1`. Persisted.
2. User types `1111`. Same. `failures: 1 → 2`.
3. User types `2222`. Same. `failures: 2 → 3`.
4. User types `4729`. Wrapper decrypts to `MK_a`. `failures: 3 → 0`.

Invariant check: I7 — between step 3 and step 4 the user closed and reopened the app. On reopen, lock screen showed "3 failed attempts" (the counter survived). After step 4 the counter cleared. ✓

### Example D — Adding a passkey to an install that has PIN

1. User is unlocked. MK = `MK_a` in memory.
2. User → Settings → Security → "Add passkey".
3. App calls `navigator.credentials.create` with `extensions.prf.eval.first = randBytes(32)` (call it `salt_pk`). Authenticator prompts.
4. Authenticator returns `{ credentialId, prfResults.first: 32 bytes }` — those 32 bytes are `WK_pk`.
5. App AES-GCM-encrypts `MK_a` under `WK_pk`, builds `wrapper_pk`.
6. App writes `methods.passkey.enabled = true, methods.passkey.wrapper = wrapper_pk, methods.passkey.credentialIds = [credentialId], methods.passkey.salt = salt_pk`.
7. **No re-encryption of the store.** MK didn't change.

Invariant check: I1 — both `unwrap(wrapper_pin, "4729")` and `unwrap(wrapper_pk, prf_output)` yield `MK_a`. ✓

### Example E — Recovery-code unlock after losing PIN and passkey

State: PIN set, passkey set. User forgot the PIN, lost the device with the passkey.

1. App cold-starts on a new install or after the user wiped phone data.
2. Lock screen shows "Use recovery phrase".
3. User types the 12 words. App normalises (lowercase, trim, single-space), runs `WK_rec = pbkdf2(phrase, fixedSalt, 600k)`.
4. `aes-gcm-decrypt(wrapper_rec.wrappedMK, WK_rec, wrapper_rec.iv, wrapper_rec.tag) → MK_a`. Tag verifies. ✓
5. Store decrypts. App boots normally and prompts the user to re-add at least one primary method (PIN or passkey) since the previous wrappers are still on disk but the user can't use them.
6. User adds a new PIN `8154`. App writes a fresh `wrapper_pin` over the old one (same `MK_a`).
7. Optional: user clicks "Forget the lost passkey" → `methods.passkey.enabled = false`, wrapper deleted.

Invariant check: I8 — at any point during step 5, the user could have gone to Settings and the recovery phrase would have been the same 12 words they just typed. ✓

### Example F — Idle-lock at 5 minutes

State: app open and unlocked.

1. `idleLockMs = 300000`. Renderer starts a timer on every user input event.
2. User goes to lunch. 5 min 0.4 s pass with no input.
3. Idle handler fires. Renderer dispatches "lock" — clears MK from memory, navigates to lock screen, retains React state in memory but all `useLS` reads now route through a sentinel that returns `null` until re-unlock.
4. User returns. Lock screen prompts. Unlock via any enabled method. MK re-derived. Store does NOT need re-decryption — the renderer already has hydrated state in memory; the lock was UI-level, not data-level.

Invariant check: I2 — between step 3 and step 4, MK was cleared. The decrypted slices were still in renderer memory (acceptable — see T4 in the threat model: post-unlock memory is out of scope). I10 — fired within ±2 s. ✓

### Example G — Tamper detection

1. Attacker with disk access flips one byte of `ct` in the encrypted store.
2. User unlocks normally. Wrapper decrypts → MK recovered.
3. Store-decrypt step calls `aes-gcm-decrypt(blob.ct, MK, blob.iv, blob.tag, aad="ledger-store-v1")`. **GCM tag verification fails.**
4. App refuses to hydrate. Surfaces "Store has been modified or is corrupt. Restore from backup." with a link to CAR-77 import.

Invariant check: I4 ✓

## Pseudocode (illustrative)

The implementer may differ in structure, but the rules and invariants are normative.

```
// Setup (one-time, runs from Settings → Set up security)
function setupSecurity(methods, secrets):
  MK     = randBytes(32)
  recPhrase = bip39.generate(128)             // 12 words
  recWrap   = wrap(MK, derivePBKDF2(recPhrase, FIXED_SALT, 600_000))

  config = { v:1, enabled:true, methods:{}, recovery:{ wrapper: recWrap }, idleLockMs: 300_000 }

  for (name, secret) in zip(methods, secrets):
    salt = randBytes(16)
    WK   = deriveKDF(name, secret, salt)
    config.methods[name] = { enabled:true, wrapper: wrap(MK, WK), salt }

  if onElectron():
    config.osEscrow = { enabled:true, wrapper: safeStorage.encryptString(MK) }

  writeAtomic(SECURITY_PATH, config)
  oldPlain = readJSON(STORE_PATH)
  encBlob  = aeadEncrypt(JSON.stringify(oldPlain), MK, "ledger-store-v1")
  overwriteWithRandom(STORE_PATH); fsync()    // best-effort wipe
  writeAtomic(STORE_PATH, encBlob)
  showRecoveryPhrase(recPhrase)               // user confirms; phrase remains retrievable

// Unlock (cold start or idle)
function unlock(method, secret):
  cfg = readJSON(SECURITY_PATH)
  if cfg.methods[method].rateLimit.lockedUntil > now(): refuse with remainingTime
  WK = deriveKDF(method, secret, cfg.methods[method].salt)
  try:
    MK = unwrap(cfg.methods[method].wrapper, WK)         // throws on tag mismatch
  catch:
    bumpFailures(cfg, method); writeAtomic(SECURITY_PATH, cfg); throw BadSecret
  resetFailures(cfg, method); writeAtomic(SECURITY_PATH, cfg)
  return MK

// Boot
function boot():
  cfg = readJSONOrNull(SECURITY_PATH)
  if !cfg or !cfg.enabled: return legacyBoot()
  MK = await renderLockScreenAndAwaitUnlock(cfg)        // user picks a method
  blob = readJSON(STORE_PATH)
  payload = JSON.parse(aeadDecrypt(blob, MK, "ledger-store-v1"))   // I4 enforced here
  hydrateRenderer(payload)
  startIdleTimer(cfg.idleLockMs, onIdle = () => { MK = null; lock(); })
```

## Test plan

Each invariant maps to at least one assertion. Where helpful, tests use deterministic seeds (passing the RNG/IV into the unit under test).

| # | Test | Maps to |
|---|---|---|
| T1 | Setup with PIN + password + passkey, then `unwrap(wrapper_pin)`, `unwrap(wrapper_password)`, `unwrap(wrapper_passkey)` all return the same 32-byte MK | I1 |
| T2 | After `lock()`, the in-memory MK reference is null and a subsequent store-write call refuses with `LOCKED` | I2 |
| T3 | 1000 sequential encrypts produce 1000 distinct IVs (statistical, not bit-perfect) | I3 |
| T4 | Flip one byte of `ct` in the encrypted blob; decrypt throws GCM-tag-mismatch and `boot()` surfaces `STORE_INCONSISTENT` UI | I4 |
| T5 | With one method enabled, calling `removeMethod(onlyEnabled)` rejects with `LAST_METHOD` | I5 |
| T6 | Mock `disk-store` write to interrupt after the encrypted blob lands but before plaintext deletion; on next boot, both files present → `STORE_INCONSISTENT` repair UI fires | I6 |
| T7 | Increment `failures` to 5, restart in-memory store, verify counter persists and `lockedUntil` is enforced | I7 |
| T8 | Call `revealRecoveryPhrase()` twice; both calls return the identical 12-word array | I8 |
| T9 | Run `boot()` with `window.electronAPI = undefined`; verify Settings hides OS-escrow toggle and config sets `osEscrow.enabled = false` | I9 |
| T10 | Set `idleLockMs = 1000`, simulate 1.2 s of inactivity, assert `lock()` was called | I10 |
| T11 | Setup → unlock → add method → remove original method → unlock with the new method (round-trip) | R7 |
| T12 | PIN enters auto-disable after 10 cumulative failures (failures persist across restart); password and passkey method choices remain | R8 |
| T13 | On Electron, simulate `safeStorage.decryptString` throwing; verify `OS_ESCROW_REKEY` flag and silent re-wrap on next successful unlock | edge case |
| T14 | Browser build (no Electron API): setup with passkey + recovery, close tab, reopen, unlock with passkey | browser path |
| T15 | Recovery-phrase rotate: new phrase decrypts to MK; old phrase fails decrypt | R6 |

CI runs T1–T15 under `npm test` (Vitest). Tests live as `src/main/security.test.mjs` (Node-side crypto) and `src/renderer/lockScreen.test.jsx` (UI behaviour).

## Open questions

Choices the spec deliberately defers to the implementation issue:

1. **Argon2id parameter calibration on mobile-web.** The 64 MiB / 3-iteration target is comfortable on desktop but borderline on a 3-year-old phone in the browser. Should we pick lower defaults for the browser path and document the security trade-off, or hold the line and accept a 1-2 s unlock on weak phones? Recommend: hold the line; show a "Working…" spinner.
2. **WebAuthn RP ID for Electron.** Using a custom protocol (`app.ledger.local`) is cleanest but requires `protocol.registerSchemesAsPrivileged` setup. Falling back to `localhost` works but couples the unlock screen to the dev server's port. Implementation should test both and pick.
3. **Secure-deletion of legacy plaintext.** The "overwrite with random bytes once, fsync, then write encrypted" flow does not survive against a forensic investigator who imaged the disk before migration. Document this in the user-facing prose; do not pretend otherwise.
4. **Re-encrypting a running store after recovery-phrase rotation.** Today's design says rotation only re-wraps MK under a new phrase. Should we *also* generate a new MK and re-encrypt the store on rotation? More secure (defends against a leaked phrase being used later if an attacker also has an old store snapshot) but more complex. Recommend: defer; rotate-MK is a separate "Reset all credentials" action.
5. **Memory protection of MK.** Renderer JS strings/Buffers are not zeroizable. We can `.fill(0)` Buffers in the main process; can't do anything analogous in the renderer. Document the limitation; out of scope for v1.
6. **Idle detection in Electron when the window is unfocused but the user is interacting with another monitor.** `powerMonitor` doesn't fire. Likely acceptable — locking aggressively on blur is the safer default. Confirm during implementation.
7. **Electron-side argon2 native dependency on Windows builds.** The `argon2` npm package needs `node-gyp`. Pure-JS fallback (`argon2-browser` WASM, also used by the browser path) is portable but slower. Decision: ship one path (WASM) on both runtimes for simplicity.

## Follow-up issues to file

When this spec lands, file:

- **CAR-240 — App security: implementation (PIN, password, passkey, encryption-at-rest).** Implements R1–R8 + I1–I10. Single PR or staged PRs at the implementer's discretion. Acceptance: T1–T15 pass; manual setup → cold-start → idle-lock → recovery-phrase → method-add round-trip verified by hand.
- **CAR-241 — Encrypt CAR-77 backups under the same format.** CAR-77 currently exports plaintext JSON; aligning with this format (same blob shape, same KDF for backup-time password) closes the obvious leak.
- **CAR-242 — Settings UX polish for Security section.** Pull the lock-screen and Settings copy through the impeccable / frontend-design pass; v1 of CAR-240 ships functional but plain.
- **CAR-243 — Optional: panic / wipe shortcut.** Stretch; only file if there's real demand.

## Acceptance criteria

Mirroring CAR-239's Linear ticket:

- [x] Spec markdown lands at `docs/superpowers/specs/2026-05-26-car-239-app-security-design.md` matching house style.
- [x] Threat model, on-disk format, per-method KDF, recovery-code generation + retrieval, and idle-lock behaviour all defined.
- [x] Both Electron and mobile-web crypto paths defined; shared vs platform-specific is explicit.
- [x] Numbered invariants (I1–I10), each testable.
- [x] Worked examples cover: first-run setup, PIN unlock, passkey unlock, recovery-code unlock, idle-lock, method-add, tamper-detect.
- [x] Test plan maps each invariant to assertions.
- [x] Open-questions section captures items deferred to implementation.
- [x] Follow-up issues to file are listed (CAR-240 implementation + CAR-241/242/243).
