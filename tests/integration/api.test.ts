import { execFileSync } from 'node:child_process';
import { requireLocalAdminUrl, createDatabase } from '@struchkai/database';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
test(
  'Nest inicia en loopback y responde a health',
  { timeout: 10000 },
  async (t) => {
    const entry = fileURLToPath(
      new URL('../../apps/api/dist/main.js', import.meta.url),
    );
    const child = spawn(process.execPath, [entry], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        STRUCHKAI_DEMO_PROFILES: 'true',
        STRUCHKAI_STORAGE: 'memory',
        STRUCHKAI_DATABASE_URL: '',
        STRUCHKAI_API_PORT: '0',
        API_PORT: '0',
      },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const closed = once(child, 'close');
    t.after(async () => {
      child.kill();
      await closed;
    });
    const lines = createInterface({ input: child.stdout });
    const [line] = await Promise.race([
      once(lines, 'line'),
      closed.then(() => {
        throw new Error('Nest terminó antes de anunciar el puerto');
      }),
    ]);
    assert.match(line, /^API local en http:\/\/127\.0\.0\.1:\d+$/);
    const response = await fetch(
      line.slice('API local en '.length) + '/health',
      { signal: AbortSignal.timeout(3000) },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
    const base = line.slice('API local en '.length);
    const call = (path: string, init?: RequestInit) =>
      fetch(base + path, { ...init, signal: AbortSignal.timeout(3000) });
    const checkError = async (
      path: string,
      status: number,
      code: string,
      init?: RequestInit,
    ) => {
      const result = await call(path, init);
      assert.equal(result.status, status);
      const error = await result.json();
      assert.equal(error.code, code);
      assert.match(error.requestId, /^[\da-f-]{36}$/);
      assert.equal(result.headers.get('X-Request-Id'), error.requestId);
    };
    const catalog = await call('/v1/anime?genre=adventure&limit=1&page=2');
    assert.equal(catalog.status, 200);
    const page = await catalog.json();
    assert.equal(page.total, 2);
    assert.equal(page.totalPages, 2);
    assert.equal(page.items[0].id, 'ruta-lunar');
    assert.equal(
      (await (await call('/v1/anime/atlas-del-viento')).json()).episodes[0]
        .number,
      1,
    );
    assert.equal(
      (await (await call('/v1/manga?q=jardin')).json()).items[0].id,
      'jardin-de-cometas',
    );
    assert.equal(
      (await (await call('/v1/manga/archivo-de-la-niebla')).json()).chapters[0]
        .number,
      1,
    );
    assert.equal(
      (await (await call('/v1/anime?page=99')).json()).items.length,
      0,
    );
    await checkError('/v1/anime?limit=0', 400, 'INVALID_PAGINATION');
    await checkError('/v1/anime?q=a&q=b', 400, 'INVALID_PARAMETERS');
    await checkError('/v1/manga/unknown', 404, 'NOT_FOUND');
    await checkError('/v1/manga/not_valid', 400, 'INVALID_PARAMETERS');
    assert.equal((await (await call('/v1/providers')).json()).length, 2);
    await checkError(
      '/v1/providers/fixture-offline',
      503,
      'PROVIDER_UNAVAILABLE',
    );
    const library = '/v1/library/demo-alex';
    const anime = library + '/anime/atlas-del-viento';
    const manga = library + '/manga/archivo-de-la-niebla';
    const json = (method: string, body: unknown): RequestInit => ({
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal((await call(anime, { method: 'PUT' })).status, 200);
    assert.equal((await call(manga, { method: 'PUT' })).status, 200);
    const updated = await call(
      anime,
      json('PATCH', { status: 'in_progress', favorite: true }),
    );
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).status, 'in_progress');
    assert.equal(
      (await (await call(anime, { method: 'PUT' })).json()).favorite,
      true,
    );
    assert.equal((await (await call(library + '?kind=manga')).json()).total, 1);
    assert.equal((await (await call(library + '/favorites')).json()).total, 1);
    assert.equal((await (await call('/v1/library/demo-rio')).json()).total, 0);
    await checkError('/v1/library/guest', 403, 'OPERATION_NOT_ALLOWED');
    await checkError(
      anime,
      400,
      'INVALID_PARAMETERS',
      json('PATCH', { favorite: 'true' }),
    );
    for (const item of [anime, manga])
      assert.equal((await call(item, { method: 'DELETE' })).status, 204);
    assert.equal((await (await call(library)).json()).total, 0);
    const spec = await call('/v1/openapi.json');
    assert.equal(spec.status, 200);
    assert.ok(
      (await spec.json()).paths['/v1/library/{profileId}/{kind}/{id}'].patch,
    );
  },
);

test(
  'Migraciones, restricciones y persistencia PostgreSQL tras reinicio',
  { skip: !process.env.STRUCHKAI_TEST_DATABASE_URL, timeout: 30000 },
  async () => {
    const url = requireLocalAdminUrl('STRUCHKAI_TEST_DATABASE_URL');
    const env = {
      ...process.env,
      NODE_ENV: 'test',
      STRUCHKAI_DEMO_PROFILES: 'true',
      STRUCHKAI_MIGRATION_URL: url,
      STRUCHKAI_DATABASE_URL: process.env.STRUCHKAI_TEST_APP_URL || url,
      STRUCHKAI_API_PORT: '0',
    };
    const file = (name: string) =>
      fileURLToPath(new URL(name, import.meta.url));
    for (const [script, arg] of [
      ['migrate', 'apply'],
      ['migrate', 'apply'],
      ['seed', ''],
    ])
      execFileSync(
        process.execPath,
        [file('../../packages/database/dist/' + script + '.js'), arg],
        { env, timeout: 8000, stdio: 'inherit' },
      );
    const { pool } = createDatabase(url);
    try {
      await assert.rejects(
        pool.query(
          "insert into genres(slug,name) values('adventure','Duplicado')",
        ),
        { code: '23505' },
      );
      await assert.rejects(
        pool.query(
          "insert into anime_episodes(slug,anime_id,number,title) values('invalid-ref',gen_random_uuid(),1,'Prueba')",
        ),
        { code: '23503' },
      );
    } finally {
      await pool.end();
    }
    async function api(
      verify: (
        get: (route: string, options?: RequestInit) => Promise<Response>,
      ) => Promise<void>,
    ) {
      const child = spawn(
        process.execPath,
        [file('../../apps/api/dist/main.js')],
        { env, stdio: ['ignore', 'pipe', 'inherit'] },
      );
      const closed = once(child, 'close');
      const reader = createInterface({ input: child.stdout });
      try {
        const [line] = await Promise.race([
          once(reader, 'line', { signal: AbortSignal.timeout(8000) }),
          closed.then(() => {
            throw new Error('La API cerró antes de iniciar');
          }),
        ]);
        assert.match(line, /^API local en http:\/\/127\.0\.0\.1:\d+$/);
        await verify((route, options) =>
          fetch(line.slice('API local en '.length) + route, {
            ...options,
            signal: AbortSignal.timeout(4000),
          }),
        );
      } finally {
        child.kill();
        await closed;
        reader.close();
      }
    }
    const library = '/v1/library/demo-alex',
      item = library + '/anime/atlas-del-viento';
    await api(async (get) => {
      assert.equal((await get('/health/database')).status, 200);
      const page = await (
        await get('/v1/anime?genre=adventure&limit=1&page=2')
      ).json();
      assert.equal(page.total, 2);
      assert.equal(page.items[0].id, 'ruta-lunar');
      assert.equal(
        (await (await get('/v1/manga?q=jardin')).json()).items[0].id,
        'jardin-de-cometas',
      );
      assert.equal((await get(item, { method: 'PUT' })).status, 200);
      const patch = await get(item, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'completed', favorite: true }),
      });
      assert.equal(patch.status, 200);
      assert.equal((await patch.json()).favorite, true);
      const invalid = await get('/v1/anime?limit=0');
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json()).code, 'INVALID_PAGINATION');
    });
    await api(async (get) => {
      const favorites = await (await get(library + '/favorites')).json();
      assert.ok(
        favorites.items.some(
          (row: { mediaId: string; status: string }) =>
            row.mediaId === 'atlas-del-viento' && row.status === 'completed',
        ),
      );
      assert.equal(
        (await (await get('/v1/library/demo-rio?kind=anime')).json()).total,
        0,
      );
      assert.equal((await get(item, { method: 'DELETE' })).status, 204);
    });
  },
);
