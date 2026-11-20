import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { loadDesktopEnvironment } from '../../apps/desktop/src/environment.ts';

test('Electron comparte el issuer local, respeta overrides y no carga secretos de API', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'struchkai-env-'));
  try {
    const file = pathToFileURL(join(dir, '.env'));
    await writeFile(
      file,
      'STRUCHKAI_OIDC_ISSUER=http://127.0.0.1:8083/realms/struchkai\nSTRUCHKAI_API_URL=http://127.0.0.1:3100\nSTRUCHKAI_DATABASE_URL=private-test-value\n',
    );
    const env: NodeJS.ProcessEnv = {
      STRUCHKAI_API_URL: 'http://127.0.0.1:43100',
    };
    loadDesktopEnvironment(file, env);
    assert.equal(
      env.STRUCHKAI_OIDC_ISSUER,
      'http://127.0.0.1:8083/realms/struchkai',
    );
    assert.equal(env.STRUCHKAI_API_URL, 'http://127.0.0.1:43100');
    assert.equal(env.STRUCHKAI_DATABASE_URL, undefined);
    loadDesktopEnvironment(pathToFileURL(join(dir, 'missing.env')), env);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
