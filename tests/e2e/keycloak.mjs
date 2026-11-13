import assert from 'node:assert/strict';
import { randomBytes, createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, _electron as electron } from 'playwright';
import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';
const issuer = 'http://127.0.0.1:8081/realms/struchkai-d2';
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
const email = 'struchkai-' + randomBytes(8).toString('hex') + '@example.test';
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
  desktop = await electron.launch({
    args: ['--user-data-dir=' + profile, 'apps/desktop'],
    env: {
      ...process.env,
      STRUCHKAI_OIDC_ISSUER: issuer,
      STRUCHKAI_API_URL: 'http://127.0.0.1:43100',
    },
  });
  await desktop.evaluate(({ shell, app }) => {
    app.setPath(
      'userData',
      process.argv
        .find((arg) => arg.startsWith('--user-data-dir='))
        ?.split('=')
        .slice(1)
        .join('=') ?? app.getPath('userData'),
    );
    shell.openExternal = async (url) => {
      globalThis.struchkaiTestUrl = url;
    };
  });
  const window = await desktop.firstWindow();
  const open = async (label) => {
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
    await page.goto(url);
  };
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
  assert.equal(new URL(link).origin, 'http://127.0.0.1:8081');
  await page.goto(link);
  const proceed = page.locator('#kc-info-message a');
  if (await proceed.count()) await proceed.first().click();
  await finishOtp();
  await window.getByText(email, { exact: true }).waitFor({ timeout: 20000 });
  console.info(
    'Registro, SMTP, TOTP, PKCE y GET /v1/account comprobados con Electron y Keycloak real',
  );
  await window.getByRole('button', { name: 'Sesiones activas' }).click();
  await window.getByText(/Actual/).waitFor();
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
  assert.equal(new URL(resetUrl).origin, 'http://127.0.0.1:8081');
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
