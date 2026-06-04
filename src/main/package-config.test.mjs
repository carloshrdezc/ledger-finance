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
