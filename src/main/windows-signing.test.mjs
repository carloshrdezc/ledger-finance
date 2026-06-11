import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const workflow = readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8');

// CAR-363: lock the Windows code-signing contract. Auto-update REQUIRES the
// installer to be Authenticode-signed; electron-updater verifies the downloaded
// installer's signature Subject CN against build.win.signtoolOptions.publisherName.
describe('CAR-363 · Windows signing + auto-update contract', () => {
  const win = pkg.build.win;

  it('declares a publisherName for update signature verification', () => {
    // Must equal the signing certificate's Subject CN (see docs/windows-signing.md).
    // electron-updater rejects an update whose signer CN is not in this list.
    expect(win.signtoolOptions).toBeTruthy();
    const pn = win.signtoolOptions.publisherName;
    const list = Array.isArray(pn) ? pn : [pn];
    expect(list.length).toBeGreaterThan(0);
    expect(list.every(n => typeof n === 'string' && n.length > 0)).toBe(true);
  });

  it('signs with sha256', () => {
    expect(win.signtoolOptions.signingHashAlgorithms).toContain('sha256');
  });

  it('disables update signature verification (CAR-365 interim — unsigned builds)', () => {
    // Until a real Authenticode cert is configured (CAR-363), the update channel
    // can't enforce signatures or Windows auto-update rejects every unsigned
    // build. Re-enable (delete this / set true) once signing is live.
    expect(win.verifyUpdateCodeSignature).toBe(false);
  });

  it('wires the Windows signing secrets into the release workflow', () => {
    expect(workflow).toContain('CSC_LINK: ${{ secrets.WINDOWS_CERT_PFX_BASE64 }}');
    expect(workflow).toContain('CSC_KEY_PASSWORD: ${{ secrets.WINDOWS_CERT_PASSWORD }}');
  });
});
