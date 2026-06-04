// CAR-244 (slice 4): boot / unlock edge-case classifier.
//
// Pure logic, no React, no Electron. Maps the various failure signals the
// boot + unlock paths can hit onto a single repair-UI decision object, per
// the spec "Edge cases & flags" table. This keeps the renderer's repair UI
// and the main process's escrow-rekey wiring driven by one well-tested
// source of truth instead of scattered string comparisons.
//
// Decisions are advisory: each carries a `kind`, a user-facing `message`,
// the originating `flag`, whether a non-destructive `repair` is offered,
// and whether the situation is `recoverable`. Crucially, NONE of these
// decisions ever describes a destructive auto-action (spec: STORE_*
// repairs are non-destructive; UNRECOVERABLE has NO auto-reset).

// Canonical edge-case flags (mirror the spec table).
export const EDGE_FLAGS = Object.freeze({
  STORE_INCONSISTENT: 'STORE_INCONSISTENT',
  STORE_PAYLOAD_MALFORMED: 'STORE_PAYLOAD_MALFORMED',
  OS_ESCROW_REKEY: 'OS_ESCROW_REKEY',
  METHOD_UNAVAILABLE_ON_ORIGIN: 'METHOD_UNAVAILABLE_ON_ORIGIN',
  UNRECOVERABLE: 'UNRECOVERABLE',
});

// Repair actions a UI may offer. Re-encrypt-now and restore-from-backup are
// the only two non-destructive options for an inconsistent store; malformed
// payloads suggest a CAR-77 import. None reset/wipe data automatically.
export const REPAIR_ACTIONS = Object.freeze({
  REENCRYPT_NOW: 'reencrypt-now',
  RESTORE_FROM_BACKUP: 'restore-from-car77',
  IMPORT_BACKUP: 'import-car77',
  RESET: 'reset', // explicit, user-initiated only — never automatic.
});

// Classify a boot/unlock failure into a repair decision.
//
//   signal: {
//     code:           string  — an error code / flag from main or crypto core
//     osEscrowFailed: boolean — safeStorage.decryptString threw
//     primaryFailed:  boolean — every primary method + recovery failed to unwrap
//   }
export function classifyEdgeCase(signal = {}) {
  const code = typeof signal.code === 'string' ? signal.code : null;

  // OS-escrow wrapper decrypt failure (DPAPI/Keychain key gone — e.g. the
  // app was copied to a new machine). This is an INFO, not an error: we
  // silently disable escrow and re-wrap on the next successful unlock.
  if (code === EDGE_FLAGS.OS_ESCROW_REKEY || signal.osEscrowFailed === true) {
    return Object.freeze({
      kind: 'os-escrow-rekey',
      flag: EDGE_FLAGS.OS_ESCROW_REKEY,
      severity: 'info',
      message: null, // silent — no user-facing prompt.
      blocksBoot: false,
      repair: false,
      repairActions: [],
      recoverable: true,
      // The escrow wrapper should be marked disabled now and re-created
      // from MK after the user unlocks via a primary method.
      rekeyOnNextUnlock: true,
    });
  }

  // Encrypted store + a stale plaintext store both present (mid-migration
  // crash, or security.json next to a plaintext store). Non-destructive
  // repair: re-encrypt the plaintext now, or restore from a CAR-77 backup.
  if (code === EDGE_FLAGS.STORE_INCONSISTENT) {
    return Object.freeze({
      kind: 'store-inconsistent',
      flag: EDGE_FLAGS.STORE_INCONSISTENT,
      severity: 'error',
      message: 'Your data is in an inconsistent state. Repair it without losing data.',
      blocksBoot: true,
      repair: true,
      repairActions: [REPAIR_ACTIONS.REENCRYPT_NOW, REPAIR_ACTIONS.RESTORE_FROM_BACKUP],
      recoverable: true,
      rekeyOnNextUnlock: false,
    });
  }

  // AEAD decrypt succeeded (or a tamper check failed) but the inner JSON is
  // malformed. Likely corruption. Suggest a CAR-77 import; never auto-reset.
  if (code === EDGE_FLAGS.STORE_PAYLOAD_MALFORMED) {
    return Object.freeze({
      kind: 'store-payload-malformed',
      flag: EDGE_FLAGS.STORE_PAYLOAD_MALFORMED,
      severity: 'error',
      message: 'Backup may be corrupt. Import a CAR-77 backup to recover.',
      blocksBoot: true,
      repair: true,
      repairActions: [REPAIR_ACTIONS.IMPORT_BACKUP],
      recoverable: true,
      rekeyOnNextUnlock: false,
    });
  }

  // Every primary method AND the recovery code failed, and (on Electron)
  // OS escrow couldn't save us either. Surface a restore/reset prompt with
  // NO destructive auto-action.
  if (code === EDGE_FLAGS.UNRECOVERABLE || signal.primaryFailed === true) {
    return Object.freeze({
      kind: 'unrecoverable',
      flag: EDGE_FLAGS.UNRECOVERABLE,
      severity: 'error',
      message: 'Data is unrecoverable. Restore from a CAR-77 backup or reset.',
      blocksBoot: true,
      repair: true,
      // Reset is offered but is explicitly user-initiated; we never wipe
      // automatically (spec: "NO destructive auto-action").
      repairActions: [REPAIR_ACTIONS.RESTORE_FROM_BACKUP, REPAIR_ACTIONS.RESET],
      recoverable: false,
      rekeyOnNextUnlock: false,
    });
  }

  return null;
}

// Plan the OS-escrow re-wrap that should happen after a successful unlock,
// given an earlier OS_ESCROW_REKEY signal. Returns null when no re-key is
// pending (so callers can guard cheaply). The actual safeStorage.encrypt
// call lives in main; this just decides whether/what to do, deterministically.
export function planOsEscrowRekey({ rekeyPending, unlockSucceeded, onElectron }) {
  if (!rekeyPending || !unlockSucceeded || !onElectron) return null;
  return Object.freeze({
    action: 're-wrap-os-escrow',
    // Re-enable escrow only after we've recreated the wrapper from MK.
    setEnabledAfterWrap: true,
    flag: EDGE_FLAGS.OS_ESCROW_REKEY,
  });
}
