import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { requireLocalAdminUrl } from '@struchkai/database';
test(
  'OIDC valida tokens y aísla perfiles, favoritos, administración y sesiones',
  { skip: !process.env.STRUCHKAI_TEST_DATABASE_URL, timeout: 20000 },
  async (t) => {
    const url = requireLocalAdminUrl('STRUCHKAI_TEST_DATABASE_URL');
    const pair = await generateKeyPair('RS256', { extractable: true });
    const key = {
      ...(await exportJWK(pair.publicKey)),
      kid: 'test',
      alg: 'RS256',
    };
    const server = createServer((_req, res) =>
      res
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ keys: [key] })),
    );
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => {
      server.close();
    });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const issuer = 'http://127.0.0.1:' + address.port + '/realms/test';
    const entry = fileURLToPath(
      new URL('../../apps/api/dist/main.js', import.meta.url),
    );
    const child = spawn(process.execPath, [entry], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        STRUCHKAI_DEMO_PROFILES: 'false',
        STRUCHKAI_DATABASE_URL: process.env.STRUCHKAI_TEST_APP_URL || url,
        STRUCHKAI_API_PORT: '0',
        STRUCHKAI_OIDC_ISSUER: issuer,
        STRUCHKAI_OIDC_AUDIENCE: 'struchkai-api',
        STRUCHKAI_OIDC_CLIENT_ID: 'struchkai-desktop',
      },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const closed = once(child, 'close');
    t.after(async () => {
      child.kill();
      await closed;
    });
    const reader = createInterface({ input: child.stdout });
    const [line] = await Promise.race([
      once(reader, 'line', { signal: AbortSignal.timeout(8000) }),
      closed.then(() => {
        throw new Error('La API no inició');
      }),
    ]);
    const base = line.slice('API local en '.length);
    async function token(
      subject: string,
      sid: string,
      verified = true,
      aud = 'struchkai-api',
    ) {
      return new SignJWT({
        sid,
        email: subject + '@example.test',
        email_verified: verified,
        typ: 'Bearer',
        azp: 'struchkai-desktop',
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'test' })
        .setIssuer(issuer)
        .setAudience(aud)
        .setSubject(subject)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(pair.privateKey);
    }
    const call = (
      route: string,
      bearer?: string,
      method = 'GET',
      body?: unknown,
    ) =>
      fetch(base + '/v1/' + route, {
        method,
        signal: AbortSignal.timeout(5000),
        headers: {
          ...(bearer ? { authorization: 'Bearer ' + bearer } : {}),
          'content-type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const a = await token('alex', 'session-a'),
      other = await token('alex', 'session-b'),
      b = await token('rio', 'session-c');
    assert.equal((await call('account')).status, 401);
    assert.equal((await call('account', 'garbage')).status, 401);
    assert.equal(
      (await call('account', await token('alex', 's', true, 'wrong'))).status,
      401,
    );
    assert.equal(
      (await call('account', await token('alex', 's', false))).status,
      403,
    );
    const result = await call('account', a);
    assert.equal(result.status, 200);
    const account = await result.json();
    assert.equal((await call('account', other)).status, 200);
    assert.equal(
      (
        await call('account', a, 'PATCH', {
          displayName: 'Cuenta A',
          avatarUrl: null,
          locale: 'es',
        })
      ).status,
      200,
    );
    assert.equal(
      (await (await call('account', other)).json()).displayName,
      'Cuenta A',
    );
    assert.equal((await call('admin/access', a)).status, 403);
    assert.equal((await call('library/demo-alex')).status, 401);
    const library = 'library/' + account.slug;
    assert.equal((await call(library + '/favorites', b)).status, 403);
    assert.equal(
      (await call(library + '/anime/atlas-del-viento', a, 'PUT')).status,
      200,
    );
    assert.equal(
      (
        await call(library + '/anime/atlas-del-viento', a, 'PATCH', {
          favorite: true,
        })
      ).status,
      200,
    );
    assert.equal(
      (await (await call(library + '/favorites', a)).json()).total,
      1,
    );
    const sessions = (await (
      await call('account/sessions', a)
    ).json()) as Array<{ id: string; current: boolean }>;
    const remote = sessions.find((session) => !session.current);
    assert.ok(remote);
    assert.equal(
      (await call('account/sessions/' + remote.id, b, 'DELETE')).status,
      404,
    );
    assert.equal(
      (await call('account/sessions/' + remote.id, a, 'DELETE')).status,
      204,
    );
    assert.equal((await call('account', other)).status, 401);
    assert.equal(
      (await call('account/sessions/current', a, 'DELETE')).status,
      204,
    );
    assert.equal((await call('account', a)).status, 401);
    assert.equal((await call('anime')).status, 200);
    assert.equal((await call('providers')).status, 200);
  },
);
