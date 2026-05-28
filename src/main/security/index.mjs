// CAR-241: Security module barrel. Re-exports the public surface so the
// rest of the app (CAR-242 boot wiring, CAR-243 lock screen, CAR-244 settings)
// can `import { ... } from './security/index.mjs'`.

export {
  aeadEncrypt,
  aeadDecrypt,
  aeadEncryptString,
  aeadDecryptString,
  randBytes,
  bytesToBase64,
  base64ToBytes,
  AEAD_AAD_STORE,
  AEAD_AAD_WRAPPER,
} from './aead.mjs';

export {
  ARGON2ID_DEFAULTS,
  PBKDF2_DEFAULTS,
  deriveArgon2id,
  deriveRecoveryKey,
  normalizeRecoveryPhrase,
} from './kdf.mjs';

export {
  wrapMasterKey,
  unwrapMasterKey,
} from './wrappers.mjs';

export {
  generateRecoveryPhrase,
  isValidRecoveryPhrase,
} from './recoveryPhrase.mjs';

export {
  PIN_POLICY,
  PASSWORD_POLICY,
  RECOVERY_POLICY,
  initialRateLimit,
  canAttempt,
  recordFailure,
  recordSuccess,
  policyForMethod,
} from './rateLimit.mjs';

export {
  SECURITY_FILE_VERSION,
  encodeStore,
  decodeStore,
  buildSecurityConfig,
  runSetupMigration,
} from './storeCodec.mjs';
