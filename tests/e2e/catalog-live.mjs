import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, _electron as electron } from 'playwright';

if (existsSync('.env')) process.loadEnvFile('.env');
const keepOpen = process.argv.includes('--keep-open');
const profile = keepOpen
  ? null
  : await mkdtemp(join(tmpdir(), 'struchkai-live-catalog-'));
let desktop, browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const web = await browser.newPage();
  await web.goto('http://127.0.0.1:5173');
  await web.getByLabel('Título o título alternativo').fill('Cowboy Bebop');
  await web.getByRole('button', { name: 'Buscar', exact: true }).click();
  await web
    .getByRole('button', { name: 'Cowboy Bebop', exact: true })
    .waitFor({ timeout: 30000 });
  await browser.close();
  browser = undefined;
  desktop = await electron.launch({
    args: [...(profile ? ['--user-data-dir=' + profile] : []), 'apps/desktop'],
  });
  const window = await desktop.firstWindow();
  await window.getByLabel('Título o título alternativo').fill('Cowboy Bebop');
  await window.getByRole('button', { name: 'Buscar', exact: true }).click();
  await window
    .getByRole('button', { name: 'Cowboy Bebop', exact: true })
    .click();
  const article = window.getByRole('article', { name: 'Ficha externa' });
  await article.locator('ol li').first().waitFor({ timeout: 30000 });
  const anime = await window.evaluate(() =>
    window.struchkaiCatalog.run('detail', {
      provider: 'kitsu',
      kind: 'anime',
      id: '1',
    }),
  );
  assert.equal(anime.data.source.externalId, '1');
  assert.equal(anime.data.externalIds.mal, '1');
  assert.ok(anime.data.relations.length);
  await window.waitForFunction(() =>
    [...globalThis.document.images].some(
      (image) => image.complete && image.naturalWidth > 0,
    ),
  );
  await mkdir('.struchkai-local/screenshots', { recursive: true });
  await article.screenshot({
    path: '.struchkai-local/screenshots/phase-e-anime.png',
  });
  const accountButtons = await window
    .getByRole('button', { name: 'Mi biblioteca', exact: true })
    .count();
  await window.getByLabel('Fuente', { exact: true }).selectOption('jikan');
  await window.getByLabel('Título o título alternativo').fill('Cowboy Bebop');
  await window.getByRole('button', { name: 'Buscar', exact: true }).click();
  await window
    .getByRole('status')
    .filter({ hasText: /fuente no respondió|límite|coincidencias/i })
    .waitFor({ timeout: 30000 })
    .catch(async () => {
      // A provider may recover between live validations; successful results are valid too.
      await window
        .getByRole('button', { name: /Cowboy Bebop/ })
        .first()
        .waitFor({ timeout: 30000 });
    });
  assert.equal(
    await window
      .getByRole('button', { name: 'Mi biblioteca', exact: true })
      .count(),
    accountButtons,
  );
  await window.getByLabel('Tipo de contenido').selectOption('manga');
  await window.getByLabel('Título o título alternativo').fill('Blue Period');
  await window.getByRole('button', { name: 'Buscar', exact: true }).click();
  await window
    .getByRole('button', { name: 'Blue Period', exact: true })
    .click();
  await article
    .getByRole('heading', { name: 'Blue Period', exact: true })
    .waitFor({ timeout: 30000 });
  // Wait for the initial page before changing the language; avoid racing the pending operation.
  await article
    .getByRole('button', { name: 'Actualizar ficha y publicaciones' })
    .waitFor();
  await window
    .getByRole('status')
    .filter({ hasText: 'Consultando fuente…' })
    .waitFor({ state: 'hidden', timeout: 30000 });
  await window.getByLabel('Idioma de capítulos').selectOption('en');
  await window.getByRole('button', { name: 'Consultar capítulos' }).click();
  await article.locator('ol li').first().waitFor({ timeout: 30000 });
  const manga = await window.evaluate(() =>
    window.struchkaiCatalog.run('detail', {
      provider: 'mangadex',
      kind: 'manga',
      id: 'f8e294c0-7c11-4c66-bdd7-4e25df52bf69',
    }),
  );
  assert.equal(manga.data.title, 'Blue Period');
  assert.ok(
    (await article.locator('ol li').allTextContents()).some((value) =>
      value.includes('published'),
    ),
  );
  await article.screenshot({
    path: '.struchkai-local/screenshots/phase-e-manga.png',
  });
  console.info(
    'Catálogo real aprobado: web y Electron, Cowboy Bebop/Kitsu, relaciones, portadas, Blue Period/MangaDex y capítulos en inglés; cuenta preservada al cambiar de fuente',
  );
  if (keepOpen) {
    await desktop.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.show();
      window.focus();
    });
    console.info('StruchKai permanece abierto en la ficha de Blue Period');
    await new Promise(() => {});
  }
} finally {
  await desktop?.close();
  await browser?.close();
  if (profile) await rm(profile, { recursive: true, force: true });
}
