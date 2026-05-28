import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../../.github/workflows/release.yml', import.meta.url),
  'utf8'
);

it('defines the tag-triggered release workflow with dispatch and release job', () => {
  expect(workflow).toContain("name: Release");
  expect(workflow).toContain("tags: ['v*']");
  expect(workflow).toContain('workflow_dispatch:');
  expect(workflow).toContain('dry_run:');
  expect(workflow).toContain('fail-fast: false');
  expect(workflow).toContain('matrix:');
  expect(workflow).toContain('windows-latest');
  expect(workflow).toContain('macos-latest');
  expect(workflow).toContain('ubuntu-latest');
  expect(workflow).toContain('softprops/action-gh-release@v2');
  expect(workflow).toContain('generate_release_notes: true');
});
