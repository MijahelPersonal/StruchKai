import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
test('Los diez workspaces tienen nombre único y compilación', async () => {
  const paths = [
    'apps/desktop',
    'apps/frontend',
    'apps/api',
    'apps/worker',
    'apps/admin',
    'packages/contracts',
    'packages/domain',
    'packages/providers',
    'packages/database',
    'packages/playback',
  ];
  const names = new Set<string>();
  for (const path of paths) {
    const manifest = JSON.parse(
      await readFile(
        new URL('../../' + path + '/package.json', import.meta.url),
        'utf8',
      ),
    );
    assert.ok(manifest.name.startsWith('@struchkai/'));
    assert.equal(manifest.private, true);
    assert.equal(typeof manifest.scripts.build, 'string');
    assert.equal(names.has(manifest.name), false);
    names.add(manifest.name);
  }
});
