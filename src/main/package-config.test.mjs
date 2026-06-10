import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
);

describe('Windows packaging config', () => {
  it('declares Windows signing intent without hardcoded cert paths', () => {
    const win = packageJson.build?.win;
    const signtoolOptions = win.signtoolOptions;

    expect(signtoolOptions).toMatchObject({
      publisherName: 'LEDGER',
      signingHashAlgorithms: ['sha256'],
    });
    expect(win).not.toHaveProperty('certificateFile');
    expect(win).not.toHaveProperty('certificatePassword');
  });

  it('publishes releases to the GitHub repo', () => {
    expect(packageJson.build?.publish).toEqual([
      {
        provider: 'github',
        owner: 'carloshrdezc',
        repo: 'ledger-finance',
      },
    ]);
  });

  it('includes the preload directory in the packaged bundle (CAR-242)', () => {
    // The renderer relies on `window.ledgerSecurity` / `window.ledgerDB`
    // exposed via `src/preload/index.js`. If the preload isn't bundled,
    // the lock screen and DB bridge silently break in production.
    expect(packageJson.build?.files).toContain('src/preload/**/*');
  });
});

describe('macOS packaging config (CAR-212)', () => {
  it('targets dmg + zip for both x64 and arm64 in the finance category', () => {
    const mac = packageJson.build?.mac;
    expect(mac.category).toBe('public.app-category.finance');
    // CAR-213 added a zip target alongside the dmg (mac auto-update needs zip).
    expect(mac.target).toEqual([
      { target: 'dmg', arch: ['x64', 'arm64'] },
      { target: 'zip', arch: ['x64', 'arm64'] },
    ]);
  });

  it('configures mac code signing + notarization (CAR-213)', () => {
    // Full assertions live in mac-signing.test.mjs; this just confirms the
    // CAR-212 "deferred" placeholder has been superseded.
    const mac = packageJson.build?.mac ?? {};
    expect(mac.hardenedRuntime).toBe(true);
    expect(mac.notarize).toBe(true);
  });
});

describe('Linux packaging config (CAR-212)', () => {
  it('builds AppImage and deb in the Office category', () => {
    const linux = packageJson.build?.linux;
    expect(linux.category).toBe('Office');
    expect(linux.target).toEqual(['AppImage', 'deb']);
  });
});

describe('app icon resources (CAR-212)', () => {
  it('points buildResources at the build/ dir holding the icon master', () => {
    expect(packageJson.build?.directories?.buildResources).toBe('build');
  });

  it('ships a >=512px icon master so electron-builder auto-derives all platforms', () => {
    const png = readFileSync(new URL('../../build/icon.png', import.meta.url));
    // PNG signature
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    // IHDR width/height live at byte offsets 16 and 20
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    expect(width).toBe(1024);
    expect(height).toBe(1024);
    expect(width).toBeGreaterThanOrEqual(512);
    expect(height).toBeGreaterThanOrEqual(512);
  });
});
