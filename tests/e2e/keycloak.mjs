import assert from 'node:assert/strict';
import { randomBytes, createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile as fsRead, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, _electron as electron } from 'playwright';
import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';
const port = process.env.STRUCHKAI_TEST_KEYCLOAK_PORT ?? '8081';
assert.match(port, /^808[1-3]$/);
const issuer = 'http://127.0.0.1:' + port + '/realms/struchkai-d2';
const testDb = process.env.STRUCHKAI_TEST_APP_URL;
assert.ok(
  testDb &&
    /^\/struchkai_test(?:_[a-z0-9_]+)?$/.test(new URL(testDb).pathname) &&
    new URL(testDb).hostname === '127.0.0.1',
  'Usa una base de pruebas local',
);
const mails = [];
const smtp = new SMTPServer({
  disabledCommands: ['AUTH', 'STARTTLS'],
  onRcptTo(address, _session, done) {
    done(
      address.address.endsWith('@example.test')
        ? undefined
        : new Error('Solo correo de prueba'),
    );
  },
  onData(stream, session, done) {
    simpleParser(stream).then((mail) => {
      mails.push({
        to: session.envelope.rcptTo[0].address,
        text: mail.text ?? '',
      });
      done();
    }, done);
  },
});
const password = 'Test-' + randomBytes(18).toString('hex') + '!';
let email = 'struchkai-' + randomBytes(8).toString('hex') + '@example.test';
const wait = async (fn, label) => {
  for (let i = 0; i < 160; i++) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Tiempo agotado: ' + label);
};
const profile = await mkdtemp(join(tmpdir(), 'struchkai-d2-'));
let desktop, browser, backend;
try {
  await new Promise((resolve, reject) => {
    smtp.once('error', reject);
    smtp.listen(25252, '127.0.0.1', resolve);
  });
  backend = spawn(process.execPath, ['apps/api/dist/main.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      STRUCHKAI_API_PORT: '43100',
      STRUCHKAI_DATABASE_URL: testDb,
      STRUCHKAI_OIDC_ISSUER: issuer,
      STRUCHKAI_DEMO_PROFILES: 'false',
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  await wait(
    () =>
      fetch('http://127.0.0.1:43100/health/database')
        .then((r) => r.ok)
        .catch(() => false),
    'Nest y PostgreSQL',
  );
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  await page.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1'
      ? route.continue()
      : route.abort(),
  );
  const launch = () =>
    electron.launch({
      args: ['--user-data-dir=' + profile, 'apps/desktop'],
      env: {
        ...process.env,
        STRUCHKAI_OIDC_ISSUER: issuer,
        STRUCHKAI_API_URL: 'http://127.0.0.1:43100',
      },
    });
  desktop = await launch();
  const interceptBrowser = async () => {
    await desktop.evaluate(({ shell, app }, issuerOrigin) => {
      app.setPath(
        'userData',
        process.argv
          .find((arg) => arg.startsWith('--user-data-dir='))
          ?.split('=')
          .slice(1)
          .join('=') ?? app.getPath('userData'),
      );
      const originalTimeout = AbortSignal.timeout.bind(AbortSignal);
      AbortSignal.timeout = (delay) =>
        originalTimeout(
          delay === 180000 && globalThis.struchkaiTestShortCallback
            ? 4000
            : delay,
        );
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (url, options) => {
        const target = new URL(url instanceof Request ? url.url : url);
        if (
          globalThis.struchkaiTestOffline &&
          target.origin === issuerOrigin &&
          target.pathname.endsWith('/token')
        )
          return Promise.reject(new TypeError('Fallo de red controlado'));
        if (
          new URL(url).origin === 'http://127.0.0.1:43100' &&
          options?.headers?.Authorization
        )
          globalThis.struchkaiTestBearer = options.headers.Authorization;
        return originalFetch(url, options);
      };
      shell.openExternal = async (url) => {
        globalThis.struchkaiTestUrl = url;
      };
    }, new URL(issuer).origin);
  };
  await interceptBrowser();
  let window = await desktop.firstWindow();
  assert.equal(
    await window.evaluate(() =>
      ['refreshToken', 'accessToken', 'safeStorage'].some(
        (key) => key in globalThis,
      ),
    ),
    false,
  );
  assert.deepEqual(
    await window.evaluate(() => Object.keys(globalThis.struchkaiAuth)),
    ['run'],
  );
  const open = async (label, action) => {
    await desktop.evaluate(() => {
      globalThis.struchkaiTestUrl = undefined;
    });
    await window.getByRole('button', { name: label, exact: true }).click();
    const url = await wait(
      () => desktop.evaluate(() => globalThis.struchkaiTestUrl),
      'navegador externo',
    );
    assert.match(
      new URL(url).searchParams.get('code_challenge') ?? '',
      /^[A-Za-z0-9_-]{43}$/,
    );
    const target = new URL(url);
    if (action) target.searchParams.set('kc_action', action);
    await page.goto(target.href);
    return target;
  };
  const occupied = createServer();
  await new Promise((resolve, reject) => {
    occupied.once('error', reject);
    occupied.listen(43821, '127.0.0.1', resolve);
  });
  try {
    await window
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .click();
    await window
      .getByRole('status')
      .filter({ hasText: 'La operación falló' })
      .waitFor();
  } finally {
    await new Promise((resolve) => occupied.close(resolve));
  }
  const currentAccount = () =>
    desktop.evaluate(async () => {
      const result = await fetch('http://127.0.0.1:43100/v1/account', {
        headers: { Authorization: globalThis.struchkaiTestBearer },
      });
      if (!result.ok) throw new Error('Cuenta no disponible');
      return result.json();
    });
  await open('Iniciar sesión');
  const wrong = await fetch(
    'http://127.0.0.1:43821/oidc/callback?state=incorrecto',
  );
  assert.equal(wrong.status, 404);
  await page.goto('about:blank');
  await window.getByRole('button', { name: 'Cancelar acceso' }).click();
  await window
    .getByRole('button', { name: 'Registrarme' })
    .waitFor({ state: 'visible' });
  await wait(
    async () =>
      await window.getByRole('button', { name: 'Registrarme' }).isEnabled(),
    'cancelación',
  );
  await assert.rejects(
    fetch('http://127.0.0.1:43821/oidc/callback?state=tardio'),
  );
  console.info('State incorrecto, cancelación y listener cerrado comprobados');
  await desktop.evaluate(() => {
    globalThis.struchkaiTestShortCallback = true;
  });
  const timed = await open('Iniciar sesión');
  await window
    .getByRole('status')
    .filter({ hasText: 'La operación falló' })
    .waitFor();
  const late = new URL(timed.searchParams.get('redirect_uri'));
  late.searchParams.set('state', timed.searchParams.get('state'));
  late.searchParams.set('code', 'late-test');
  await assert.rejects(fetch(late));
  await desktop.evaluate(() => {
    globalThis.struchkaiTestShortCallback = false;
  });
  console.info('Timeout OIDC y rechazo del callback tardío comprobados');
  const totp = (secret) => {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
    const mac = createHmac('sha1', Buffer.from(secret))
      .update(counter)
      .digest();
    return String(
      (mac.readUInt32BE(mac[19] & 15) & 0x7fffffff) % 1000000,
    ).padStart(6, '0');
  };
  let secret;
  const finishOtp = async () => {
    if (
      !(new URL(page.url()).searchParams.get('execution') === 'CONFIGURE_TOTP')
    )
      return;
    await page.locator('[name=totp]').waitFor();
    const manual = page.locator('a[href*="mode=manual"]');
    if (await manual.count()) await manual.click();
    await page.locator('[name=totpSecret]').waitFor({ state: 'attached' });
    const shown = page.locator('[name=totpSecret]');
    if (await shown.count()) {
      secret = (await shown.inputValue()).trim();
      await page.locator('[name=totp]').fill(totp(secret));
      const device = page.locator('[name=userLabel]');
      if (await device.count())
        await device.fill('Prueba ' + randomBytes(4).toString('hex'));
      await page
        .locator('[name=totp]')
        .locator('xpath=ancestor::form')
        .locator('[type=submit]')
        .click();
      await page.waitForLoadState('domcontentloaded');
      if (
        new URL(page.url()).searchParams.get('execution') === 'CONFIGURE_TOTP'
      ) {
        console.info(
          'TOTP:',
          await page
            .locator('[aria-live], .pf-m-danger, [id^=input-error]')
            .allTextContents(),
          'longitud',
          secret.length,
        );
        throw new Error('TOTP rechazado');
      }
    }
  };
  const started = await open('Iniciar sesión');
  const invalidCallback = new URL('http://127.0.0.1:43821/oidc/callback');
  invalidCallback.searchParams.set('state', started.searchParams.get('state'));
  invalidCallback.searchParams.set('code', 'invalid-test-code');
  invalidCallback.searchParams.set('iss', issuer);
  assert.equal((await fetch(invalidCallback)).status, 200);
  await assert.rejects(fetch(invalidCallback));
  await window
    .getByRole('status')
    .filter({ hasText: 'La operación falló' })
    .waitFor();
  console.info('Código inválido y repetición del callback rechazados');
  const register = async ({ expireVerification = false } = {}) => {
    await open('Registrarme');
    page.setDefaultTimeout(6000);
    for (const [name, value] of [
      ['firstName', 'Prueba'],
      ['lastName', 'Local'],
      ['email', email],
    ])
      await page.locator('[name=' + name + ']').fill(value);
    for (const name of ['password', 'password-confirm']) {
      const input = page.locator('[name=' + name + ']');
      if (await input.count()) await input.fill(password);
    }
    await page.locator('form [type=submit]').click();
    const update = page.locator('[name=password-new]');
    if (!(await page.locator('[name=password]').count())) {
      await update.waitFor({ state: 'visible', timeout: 8000 });
      await update.fill(password);
      await page.locator('[name=password-confirm]').fill(password);
      await page.locator('form [type=submit]').first().click();
    }
    await page.waitForLoadState('domcontentloaded');
    await page.locator('[name=totp]').waitFor({ timeout: 8000 });
    await finishOtp();
    const message = await wait(
      () => mails.find((mail) => mail.to === email),
      'correo de verificación',
    );
    const link = message.text.match(
      /https?:\/\/[^\s<>]+\/login-actions\/action-token\?[^\s<>]+/,
    )?.[0];
    assert.ok(link);
    assert.equal(new URL(link).origin, new URL(issuer).origin);
    if (expireVerification) {
      const target = new URL(link);
      const encoded = target.searchParams.get('key')?.split('.')[1];
      assert.ok(encoded);
      const { exp } = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      );
      const delay = (exp + 2) * 1000 - Date.now();
      assert.ok(
        delay > 0 && delay < 45000,
        'Configura la vida de enlaces de prueba a 30 segundos',
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      const isolated = await browser.newPage();
      try {
        await isolated.goto(target.href);
        assert.match(await isolated.locator('body').innerText(), /expired/i);
        assert.equal(await window.getByText(email, { exact: true }).count(), 0);
      } finally {
        await isolated.close();
      }
      await window.getByRole('button', { name: 'Cancelar acceso' }).click();
      await wait(
        () =>
          window
            .getByRole('button', { name: 'Registrarme', exact: true })
            .isEnabled(),
        'cancelación del registro vencido',
      );
      console.info(
        'Enlace de verificación sin consumir expiró y fue rechazado',
      );
      return;
    }
    const tampered = new URL(link);
    tampered.searchParams.set('key', 'invalid');
    const rejected = await browser.newPage();
    await rejected.route('**/*', (route) =>
      new URL(route.request().url()).hostname === '127.0.0.1'
        ? route.continue()
        : route.abort(),
    );
    await rejected.goto(tampered.href);
    assert.match(
      await rejected.locator('body').innerText(),
      /invalid|expired|an error occurred/i,
    );
    await rejected.close();
    await page.goto(link);
    const proceed = page.locator('#kc-info-message a');
    if (await proceed.count()) await proceed.first().click();
    await finishOtp();
    await window.getByText(email, { exact: true }).waitFor({ timeout: 20000 });
    const replay = await browser.newPage();
    try {
      await replay.route('**/*', (route) =>
        new URL(route.request().url()).hostname === '127.0.0.1'
          ? route.continue()
          : route.abort(),
      );
      await replay.goto(link);
      assert.match(
        await replay.locator('body').innerText(),
        /already.*verified|verified.*already|expired|invalid|an error occurred/i,
      );
      assert.equal(new URL(replay.url()).origin, new URL(issuer).origin);
    } finally {
      await replay.close();
    }
    console.info('Segundo uso de la verificación no abrió otra sesión');
  };
  if (process.env.STRUCHKAI_TEST_SHORT_LINK === 'true') {
    await register({ expireVerification: true });
    email = 'struchkai-' + randomBytes(8).toString('hex') + '@example.test';
  }
  await register();
  console.info(
    'Registro, SMTP, TOTP, PKCE y GET /v1/account comprobados con Electron y Keycloak real',
  );
  const oldBearer = await desktop.evaluate(
    () => globalThis.struchkaiTestBearer,
  );
  if (process.env.STRUCHKAI_TEST_SHORT_ACCESS === 'true') {
    await new Promise((resolve) => setTimeout(resolve, 13000));
    const encrypted = await fsRead(join(profile, 'oidc-session.bin'));
    assert.ok(encrypted.length > 0);
    await desktop.evaluate(() => {
      globalThis.struchkaiTestOffline = true;
    });
    await window.getByRole('button', { name: 'Sesiones activas' }).click();
    await window
      .getByRole('status')
      .filter({ hasText: 'La operación falló' })
      .waitFor();
    assert.deepEqual(
      await fsRead(join(profile, 'oidc-session.bin')),
      encrypted,
    );
    await desktop.evaluate(() => {
      globalThis.struchkaiTestOffline = false;
    });
    console.info(
      'Fallo transitorio de renovación conserva la credencial cifrada',
    );
  }
  await window.getByRole('button', { name: 'Sesiones activas' }).click();
  await window.getByText(/Actual/).waitFor();
  if (process.env.STRUCHKAI_TEST_SHORT_ACCESS === 'true') {
    assert.notEqual(
      await desktop.evaluate(() => globalThis.struchkaiTestBearer),
      oldBearer,
    );
    console.info('Access token vencido y renovación real comprobados');
  }
  await window.getByRole('button', { name: 'Cerrar sesión' }).click();
  await window
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .waitFor();
  console.info('Listado de sesiones y cierre desde Electron comprobados');
  await open('Recuperar acceso');
  await page.locator('a[href*="reset-credentials"]').click();
  await page.locator('[name=username]').fill(email);
  await page.locator('form [type=submit]').first().click();
  const recovery = await wait(
    () => mails.filter((mail) => mail.to === email)[1],
    'correo de recuperación',
  );
  const resetUrl = recovery.text.match(
    /https?:\/\/[^\s<>]+\/login-actions\/action-token\?[^\s<>]+/,
  )?.[0];
  assert.ok(resetUrl);
  assert.equal(new URL(resetUrl).origin, new URL(issuer).origin);
  await page.goto(resetUrl);
  const confirmation = page.locator('#kc-info-message a');
  if (await confirmation.count()) await confirmation.first().click();
  const newPassword = 'Updated-' + randomBytes(18).toString('hex') + '!';
  await page.locator('[name=password-new]').fill(newPassword);
  await page.locator('[name=password-confirm]').fill(newPassword);
  await page.locator('form [type=submit]').first().click();
  await page.waitForLoadState('domcontentloaded');
  if (await page.locator('[name=otp]').count()) {
    await page.locator('[name=otp]').fill(totp(secret));
    await page.locator('form [type=submit]').first().click();
  }
  await finishOtp();
  const loginAgain = page.locator('[name=username]');
  if (await loginAgain.count()) {
    await loginAgain.fill(email);
    await page.locator('[name=password]').fill(newPassword);
    await page.locator('form [type=submit]').first().click();
    await page.locator('[name=otp]').fill(totp(secret));
    await page.locator('form [type=submit]').first().click();
  }
  await window.getByText(email, { exact: true }).waitFor({ timeout: 15000 });
  console.info(
    'Recuperación con SMTP local y retorno autenticado a Electron comprobados',
  );
  const accountA = await currentAccount();
  await window.locator('input[name=id]').fill('atlas-del-viento');
  await window.getByRole('button', { name: 'Añadir a mi biblioteca' }).click();
  await window.getByRole('button', { name: 'Marcar favorito' }).click();
  await window.getByRole('button', { name: 'Quitar favorito' }).waitFor();
  await window.getByRole('button', { name: 'Cerrar sesión' }).click();
  await window.getByRole('button', { name: 'Registrarme' }).waitFor();
  email = 'struchkai-' + randomBytes(8).toString('hex') + '@example.test';
  await register();
  await window
    .getByRole('button', { name: 'Mi biblioteca', exact: true })
    .click();
  await wait(
    async () =>
      await window
        .getByRole('button', { name: 'Mi biblioteca', exact: true })
        .isEnabled(),
    'biblioteca cuenta B',
  );
  assert.equal(await window.getByText(/atlas-del-viento ·/).count(), 0);
  const accountB = await currentAccount();
  if (process.env.STRUCHKAI_TEST_REFRESH_EXPIRY === 'true') {
    const credential = await fsRead(join(profile, 'oidc-session.bin'));
    assert.ok(credential.length);
    await desktop.close();
    // Keycloak añade una ventana de tolerancia a la inactividad de la sesión.
    await new Promise((resolve) => setTimeout(resolve, 140000));
    desktop = await launch();
    window = await desktop.firstWindow();
    await wait(
      async () =>
        fsRead(join(profile, 'oidc-session.bin')).then(
          () => false,
          (error) => {
            if (error.code !== 'ENOENT') throw error;
            return true;
          },
        ),
      'refresh token vencido y eliminado',
    );
    await window
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .waitFor();
    assert.equal(await window.getByText(email, { exact: true }).count(), 0);
    console.info(
      'Renovación rechazada tras expiración natural por inactividad',
    );
  } else {
    assert.notEqual(accountA.profileId, accountB.profileId);
    const statuses = await desktop.evaluate(async (_electron, slug) => {
      const headers = {
        Authorization: globalThis.struchkaiTestBearer,
        'Content-Type': 'application/json',
      };
      const base = 'http://127.0.0.1:43100/v1/';
      return Promise.all([
        fetch(base + 'library/' + slug + '/favorites', { headers }).then(
          (r) => r.status,
        ),
        fetch(base + 'library/' + slug + '/anime/atlas-del-viento', {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ favorite: false }),
        }).then((r) => r.status),
        fetch(base + 'admin/access', { headers }).then((r) => r.status),
      ]);
    }, accountA.slug);
    assert.deepEqual(statuses, [403, 403, 403]);
    console.info(
      'Dos cuentas reales, favoritos separados y accesos cruzados denegados',
    );
    await desktop.close();
    desktop = await launch();
    await interceptBrowser();
    window = await desktop.firstWindow();
    await window.getByText(email, { exact: true }).waitFor({ timeout: 15000 });
    await window.getByRole('button', { name: 'Sesiones activas' }).click();
    await window.getByText(/Actual/).waitFor();
    console.info(
      'Sesión restaurada tras reiniciar Electron con el mismo perfil temporal',
    );
    await desktop.evaluate(
      async ({ safeStorage }, { encrypted, issuer }) => {
        const credential = safeStorage.decryptString(
          Buffer.from(encrypted, 'base64'),
        );
        const response = await fetch(
          issuer + '/protocol/openid-connect/logout',
          {
            method: 'POST',
            body: new URLSearchParams({
              client_id: 'struchkai-desktop',
              refresh_token: credential,
            }),
          },
        );
        if (response.status !== 204)
          throw new Error('Keycloak no cerró la sesión de prueba');
      },
      {
        encrypted: (await fsRead(join(profile, 'oidc-session.bin'))).toString(
          'base64',
        ),
        issuer,
      },
    );
    await desktop.close();
    desktop = await launch();
    await interceptBrowser();
    window = await desktop.firstWindow();
    await window
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .waitFor();
    await wait(
      async () =>
        fsRead(join(profile, 'oidc-session.bin')).then(
          () => false,
          (error) => {
            if (error.code !== 'ENOENT') throw error;
            return true;
          },
        ),
      'credencial revocada eliminada',
    );
    assert.equal(await window.getByText(email, { exact: true }).count(), 0);
    console.info(
      'Keycloak revocó la sesión; Electron rechazó restaurarla y eliminó la credencial',
    );
    async function signInWithOtp() {
      await page.context().clearCookies();
      await open('Iniciar sesión');
      await page.locator('[name=username]').fill(email);
      await page.locator('[name=password]').fill(password);
      await page.locator('form [type=submit]').first().click();
      const input = page.locator('[name=otp]');
      await new Promise((resolve) =>
        setTimeout(resolve, 30500 - (Date.now() % 30000)),
      );
      await input.fill(totp(secret));
      await input
        .locator('xpath=ancestor::form')
        .locator('[type=submit]')
        .click();
      await page.waitForURL((url) => url.port === '43821', { timeout: 8000 });
    }
    await desktop.evaluate(() => {
      globalThis.struchkaiTestOffline = true;
    });
    await signInWithOtp();
    await window
      .getByRole('status')
      .filter({ hasText: 'La operación falló' })
      .waitFor();
    assert.equal(await window.getByText(email, { exact: true }).count(), 0);
    await desktop.evaluate(() => {
      globalThis.struchkaiTestOffline = false;
    });
    await signInWithOtp();
    await window.getByText(email, { exact: true }).waitFor();
    await window.getByRole('button', { name: 'Cerrar sesión' }).click();
    await window
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .waitFor();
    console.info(
      'Intercambio inicial interrumpido y nuevo acceso después de reconectar comprobados',
    );
    if (process.env.STRUCHKAI_TEST_MFA_CODES === 'true') {
      const signOut = async () => {
        await window.getByRole('button', { name: 'Cerrar sesión' }).click();
        await window
          .getByRole('button', { name: 'Iniciar sesión', exact: true })
          .waitFor();
      };
      const beginPasswordLogin = async (action) => {
        await page.context().clearCookies();
        await open('Iniciar sesión', action);
        await page.locator('[name=username]').fill(email);
        await page.locator('[name=password]').fill(password);
        await page.locator('form [type=submit]').first().click();
      };
      const generate = async () => {
        await beginPasswordLogin('CONFIGURE_RECOVERY_AUTHN_CODES');
        await new Promise((resolve) =>
          setTimeout(resolve, 30500 - (Date.now() % 30000)),
        );
        const otp = page.locator('[name=otp]');
        await otp.fill(totp(secret));
        await otp
          .locator('xpath=ancestor::form')
          .locator('[type=submit]')
          .click();
        const hidden = page.locator('[name=generatedRecoveryAuthnCodes]');
        await hidden.waitFor({ state: 'attached' });
        const codes = (await hidden.inputValue()).split(',');
        assert.equal(codes.length, 12);
        await page.locator('#kcRecoveryCodesConfirmationCheck').check();
        await page.locator('#saveRecoveryAuthnCodesBtn').click();
        await window.getByText(email, { exact: true }).waitFor();
        await signOut();
        return codes;
      };
      const beginRecovery = async () => {
        await beginPasswordLogin();
        await page.getByText(/try another way/i, { exact: true }).click();
        await page
          .getByText(/recovery authentication code/i)
          .first()
          .click();
        await page.locator('[name=recoveryCodeInput]').waitFor();
      };
      const useCode = async (code, valid) => {
        try {
          await page.locator('[name=recoveryCodeInput]').fill(code);
          await page.locator('#kc-login').click();
          if (valid) await window.getByText(email, { exact: true }).waitFor();
          else {
            await page
              .getByText(/invalid|incorrect/i)
              .first()
              .waitFor();
            assert.equal(
              await window.getByText(email, { exact: true }).count(),
              0,
            );
          }
        } catch {
          throw new Error(
            'Resultado inesperado en el formulario de recuperación MFA',
          );
        }
      };
      const old = await generate();
      await beginRecovery();
      await useCode(old[0], true);
      await signOut();
      await beginRecovery();
      await useCode(old[0], false);
      await window.getByRole('button', { name: 'Cancelar acceso' }).click();
      await wait(
        () =>
          window
            .getByRole('button', { name: 'Iniciar sesión', exact: true })
            .isEnabled(),
        'cancelación MFA',
      );
      const replacement = await generate();
      await beginRecovery();
      await useCode(old[1], false);
      await useCode(replacement[0], true);
      await signOut();
      for (const code of replacement.slice(1, -1)) {
        await beginRecovery();
        await useCode(code, true);
        await signOut();
      }
      await beginRecovery();
      await page.locator('[name=recoveryCodeInput]').fill(replacement.at(-1));
      await page.locator('#kc-login').click();
      await page
        .locator('[name=generatedRecoveryAuthnCodes]')
        .waitFor({ state: 'attached' });
      await window.getByRole('button', { name: 'Cancelar acceso' }).click();
      await wait(
        () =>
          window
            .getByRole('button', { name: 'Iniciar sesión', exact: true })
            .isEnabled(),
        'cierre tras agotar códigos',
      );
      console.info(
        'Códigos MFA: generación, uso único, regeneración, rechazo del juego anterior y agotamiento comprobados',
      );
    }
    const rejectedRecovery = await browser.newPage();
    try {
      await rejectedRecovery.goto(resetUrl);
      assert.match(
        await rejectedRecovery.locator('body').innerText(),
        /invalid|expired|an error occurred|already used/i,
      );
      assert.equal(
        await rejectedRecovery.locator('[name=password-new]').count(),
        0,
      );
      console.info('Segundo uso del enlace de recuperación rechazado');
      if (process.env.STRUCHKAI_TEST_SHORT_LINK === 'true') {
        const before = mails.length;
        await open('Recuperar acceso');
        await page.locator('a[href*="reset-credentials"]').click();
        await page.locator('[name=username]').fill(email);
        await page.locator('form [type=submit]').first().click();
        const fresh = await wait(
          () => mails.slice(before).find((mail) => mail.to === email),
          'segundo correo de recuperación',
        );
        const href = fresh.text.match(
          /https?:\/\/[^\s<>]+\/login-actions\/action-token\?[^\s<>]+/,
        )?.[0];
        assert.ok(href);
        const expiring = new URL(href);
        assert.equal(expiring.origin, new URL(issuer).origin);
        const encoded = expiring.searchParams.get('key')?.split('.')[1];
        assert.ok(encoded);
        const { exp } = JSON.parse(
          Buffer.from(encoded, 'base64url').toString('utf8'),
        );
        const remaining = (exp + 2) * 1000 - Date.now();
        assert.ok(
          remaining > 0 && remaining < 45000,
          'Configura actionTokenGeneratedByUserLifespan=30',
        );
        await new Promise((resolve) => setTimeout(resolve, remaining));
        await rejectedRecovery.goto(expiring.href);
        assert.match(
          await rejectedRecovery.locator('body').innerText(),
          /expired/i,
        );
        assert.equal(
          await rejectedRecovery.locator('[name=password-new]').count(),
          0,
        );
        await window.getByRole('button', { name: 'Cancelar acceso' }).click();
        console.info(
          'Enlace de recuperación no consumido venció y fue rechazado',
        );
      }
    } finally {
      await rejectedRecovery.close();
    }
  }
} finally {
  await desktop?.close().catch(() => {});
  await browser?.close().catch(() => {});
  if (backend) {
    const done = once(backend, 'close');
    if (backend.exitCode === null) {
      backend.kill();
      await done;
    }
  }
  await new Promise((resolve) => smtp.close(resolve));
  await rm(profile, { recursive: true, force: true });
}
