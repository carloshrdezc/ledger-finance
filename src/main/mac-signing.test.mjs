import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const entitlements = readFileSync(new URL('../../build/entitlements.mac.plist', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8');

// CAR-213: lock in the macOS code-signing + notarization configuration so a
// future edit can't silently drop the pieces that make notarization succeed
// (hardened runtime + entitlements) or the CI secret wiring.
describe('CAR-213 · macOS signing + notarization config', () => {
  const mac = pkg.build.mac;

  it('enables hardened runtime (required for notarization)', () => {
    expect(mac.hardenedRuntime).toBe(true);
  });

  it('points at the entitlements plist for app + inherited processes', () => {
    expect(mac.entitlements).toBe('build/entitlements.mac.plist');
    expect(mac.entitlementsInherit).toBe('build/entitlements.mac.plist');
  });

  it('requests notarization', () => {
    expect(mac.notarize).toBe(true);
  });

  it('disables gatekeeper assessment during the build', () => {
    expect(mac.gatekeeperAssess).toBe(false);
  });

  it('ships a zip target alongside the dmg (mac auto-update needs zip)', () => {
    const targets = mac.target.map(t => (typeof t === 'string' ? t : t.target));
    expect(targets).toContain('dmg');
    expect(targets).toContain('zip');
  });

  it('grants the JIT entitlements Electron needs under hardened runtime', () => {
    expect(entitlements).toContain('com.apple.security.cs.allow-jit');
    expect(entitlements).toContain('com.apple.security.cs.allow-unsigned-executable-memory');
    expect(entitlements).toContain('com.apple.security.cs.allow-dyld-environment-variables');
    // disable-library-validation lets hardened runtime load the bundled unsigned
    // native deps (sql.js wasm, @noble/*). Dropping it is the most common cause
    // of a notarized app crashing on launch — lock it so a cleanup can't remove it.
    expect(entitlements).toContain('com.apple.security.cs.disable-library-validation');
  });

  it('wires the signing + notarization secrets into the release workflow', () => {
    // Signing identity (Developer ID Application cert) and its password.
    expect(workflow).toContain('CSC_LINK: ${{ secrets.MAC_CERT_P12_BASE64 }}');
    expect(workflow).toContain('CSC_KEY_PASSWORD: ${{ secrets.MAC_CERT_PASSWORD }}');
    // Notarization credentials (Apple ID + app-specific password + team).
    expect(workflow).toContain('APPLE_ID: ${{ secrets.APPLE_ID }}');
    expect(workflow).toContain('APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}');
    expect(workflow).toContain('APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}');
  });

  it('uploads + releases the mac zip so notarized auto-update artifacts ship', () => {
    expect(workflow).toContain('dist-app/*.zip');
    expect(workflow).toContain('artifacts/*.zip');
  });
});
