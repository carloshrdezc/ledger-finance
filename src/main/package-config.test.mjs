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
});
