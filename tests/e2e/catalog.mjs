import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { chromium, _electron as electron } from 'playwright';

const stamp = '2026-01-01T00:00:00.000Z';
const title = (kind = 'anime') => ({
  id:
    kind === 'anime'
      ? 'kitsu-anime-1'
      : 'mangadex-manga-11111111-1111-4111-8111-111111111111',
  kind,
  title: kind === 'anime' ? 'Anime de fixture' : 'Manga de fixture',
  alternativeTitles: ['Alias de fixture'],
  synopsis: 'Sinopsis ficticia para pruebas repetibles',
  genres: [{ id: 'action', name: 'Action' }],
  coverUrl: 'https://media.kitsu.app/test.jpg',
  year: 2024,
  season: 'spring',
  status: 'finished',
  episodeCount: 12,
  chapterCount: null,
  languages: ['en'],
  updatedAt: stamp,
  externalIds: {},
  relations: [],
  source: {
    provider: kind === 'anime' ? 'kitsu' : 'mangadex',
    externalId: kind === 'anime' ? '1' : '11111111-1111-4111-8111-111111111111',
    url: 'https://kitsu.app/anime/1',
    fetchedAt: stamp,
  },
});
const descriptor = (id, kinds) => ({
  id,
  name: id,
  version: '1.0.0',
  capabilities: ['metadata'],
  languages: [],
  status: 'available',
  usagePolicy: {
    simulation: true,
    allowsCaching: true,
    allowsPlayback: false,
    allowsPolling: false,
    allowsRedistribution: false,
  },
  settings: {
    kinds,
    requestsPerMinute: 100,
    minimumIntervalMs: 400,
    cacheTtlSeconds: 300,
    baseUrl: 'https://kitsu.app',
    enabled: true,
    attribution: 'Fixture ' + id,
    filters: ['q'],
  },
  availability: {
    state: 'available',
    lastSuccess: stamp,
    lastError: null,
    retryAfterSeconds: 0,
  },
});
const calls = [];
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVZkAAAAASUVORK5CYII=',
  'base64',
);
const dist = resolve('apps/frontend/dist');
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  calls.push(url.href);
  const json = (value, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(value));
  };
  if (url.pathname === '/v1/external/providers')
    return json([
      descriptor('kitsu', ['anime', 'manga']),
      descriptor('mangadex', ['manga']),
    ]);
  if (url.pathname.endsWith('/cover')) {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    return res.end(png);
  }
  if (url.pathname.startsWith('/v1/external/')) {
    if (url.searchParams.get('q') === 'caída')
      return json(
        {
          code: 'PROVIDER_UNAVAILABLE',
          message: 'Fuente de fixture caída',
          requestId: '55c58411-7f11-4000-8000-000000000000',
        },
        503,
      );
    const kind = url.pathname.includes('/manga/') ? 'manga' : 'anime',
      item = title(kind);
    if (url.pathname.endsWith('/search'))
      return json({
        items: [item],
        page: Number(url.searchParams.get('page') ?? 1),
        limit: 8,
        total: 1,
        hasNextPage: false,
        warnings: [],
      });
    if (
      url.pathname.endsWith('/releases') ||
      url.pathname.endsWith('/releases/refresh')
    ) {
      const page = Number(url.searchParams.get('page') ?? 1);
      return json({
        items: [
          {
            id: 'release-' + page,
            mediaId: item.id,
            number: page,
            volume: null,
            title: 'Publicación ' + page,
            language:
              kind === 'manga' ? url.searchParams.get('language') : null,
            publishedAt: stamp,
            updatedAt: null,
            availability: 'published',
            playback: 'unavailable',
            externalUrl: null,
            credits: ['Grupo de fixture'],
            source: item.source,
          },
        ],
        page,
        limit: 8,
        total: 2,
        hasNextPage: page === 1,
        warnings: [],
      });
    }
    if (url.pathname.endsWith('/genres'))
      return json([{ id: 'action', name: 'Action' }]);
    return json(item);
  }
  try {
    const file = resolve(
      dist,
      '.' + (url.pathname === '/' ? '/index.html' : url.pathname),
    );
    if (!file.startsWith(dist + '\\') && !file.startsWith(dist + '/'))
      return json({}, 404);
    const content = await readFile(file),
      type =
        extname(file) === '.js'
          ? 'text/javascript'
          : extname(file) === '.css'
            ? 'text/css'
            : 'text/html';
    res.writeHead(200, { 'Content-Type': type });
    res.end(content);
  } catch {
    json({}, 404);
  }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = 'http://127.0.0.1:' + server.address().port;
const profile = await mkdtemp(join(tmpdir(), 'struchkai-catalog-'));
let browser, desktop;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const web = await browser.newPage();
  await web.goto(base);
  await web.getByLabel('Título o título alternativo').fill('Alias de fixture');
  await web.getByRole('button', { name: 'Buscar', exact: true }).click();
  await web
    .getByRole('button', { name: 'Anime de fixture', exact: true })
    .click();
  await web.getByText('Publicación 1', { exact: false }).waitFor();
  await web.getByRole('button', { name: 'Más publicaciones' }).click();
  await web.getByText('Publicación 2', { exact: false }).waitFor();
  assert.ok(
    calls.some(
      (value) => new URL(value).searchParams.get('q') === 'Alias de fixture',
    ),
  );
  await web.getByLabel('Tipo de contenido').selectOption('manga');
  await web.getByLabel('Título o título alternativo').fill('Manga');
  await web.getByRole('button', { name: 'Buscar', exact: true }).click();
  await web
    .getByRole('button', { name: 'Manga de fixture', exact: true })
    .click();
  await web.getByLabel('Idioma de capítulos').selectOption('en');
  await web.getByRole('button', { name: 'Consultar capítulos' }).click();
  await web.getByText('Grupo de fixture', { exact: false }).waitFor();
  assert.ok(
    calls.some(
      (value) =>
        new URL(value).pathname.endsWith('/releases') &&
        new URL(value).searchParams.get('language') === 'en',
    ),
  );
  await web.getByLabel('Título o título alternativo').fill('caída');
  await web.getByRole('button', { name: 'Buscar', exact: true }).click();
  await web.getByText(/Fuente de fixture caída/).waitFor();
  desktop = await electron.launch({
    args: ['--user-data-dir=' + profile, 'apps/desktop'],
    env: { ...process.env, STRUCHKAI_API_URL: base },
  });
  const window = await desktop.firstWindow();
  await window.getByLabel('Título o título alternativo').fill('Alias');
  await window.getByRole('button', { name: 'Buscar', exact: true }).click();
  await window
    .getByRole('button', { name: 'Anime de fixture', exact: true })
    .click();
  await window.getByText('Publicación 1', { exact: false }).waitFor();
  await window.waitForFunction(() =>
    [...globalThis.document.images].some(
      (image) => image.src.startsWith('data:image/') && image.naturalWidth > 0,
    ),
  );
  assert.deepEqual(
    await window.evaluate(() => Object.keys(window.struchkaiCatalog)),
    ['run'],
  );
  const count = calls.length;
  const refused = await window.evaluate(() =>
    window.struchkaiCatalog.run('detail', {
      provider: 'https://evil.test',
      kind: 'anime',
      id: '1',
    }),
  );
  assert.ok(refused.error);
  assert.equal(calls.length, count);
  console.info(
    'Catálogo con fixtures: búsqueda web, fichas, idioma, paginación, caída e IPC Electron y portadas bajo CSP aprobados',
  );
} finally {
  await desktop?.close();
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(profile, { recursive: true, force: true });
}
