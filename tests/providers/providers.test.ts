import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseExternalQuery,
  parseExternalId,
  type ExternalTitle,
} from '@struchkai/contracts';
import {
  normalizeJikan,
  normalizeMangaDex,
  normalizeKitsu,
  normalizeAniList,
  ProviderTransport,
  ProviderError,
  validateProviderUrl,
  publicAddress,
  createRemoteProvider,
  type Wire,
} from '@struchkai/providers';
import { workIdentity, deduplicateTitles } from '@struchkai/domain';

const jikan = {
  mal_id: 101,
  title: 'Obra de prueba',
  title_english: 'Test Work',
  title_synonyms: ['Alias'],
  synopsis: '<p>Sinopsis de prueba</p>',
  year: null,
  status: 'Not yet aired',
  episodes: 12,
  genres: [{ mal_id: 1, name: 'Action' }],
  images: { jpg: { image_url: 'https://cdn.myanimelist.net/test.jpg' } },
};
const manga = {
  id: '11111111-1111-4111-8111-111111111111',
  attributes: {
    title: { en: 'Test Manga', es: 'Manga de prueba' },
    description: { en: 'Test description' },
    altTitles: [{ ja: 'Alias manga' }],
    year: null,
    status: 'ongoing',
    links: { mal: '101' },
    availableTranslatedLanguages: ['es', 'en'],
    tags: [],
  },
  relationships: [],
};
const kitsu = {
  id: '42',
  attributes: {
    canonicalTitle: 'Test Work',
    titles: { en: 'Alias' },
    status: 'current',
    startDate: '2024-04-01',
    episodeCount: 12,
    posterImage: { small: 'https://media.kitsu.app/test.jpg' },
  },
};

test('Contratos externos rechazan paginación, filtros, tipos e identificadores inválidos', () => {
  assert.equal(
    parseExternalQuery(
      { q: ' Alias ', page: '2', limit: '5', year: '2024', season: 'spring' },
      'anime',
    ).q,
    'Alias',
  );
  for (const q of [
    { page: '0' },
    { limit: '26' },
    { year: '1700' },
    { sort: 'random' },
    { q: ['a'] },
    { url: 'http://127.0.0.1' },
  ])
    assert.throws(() => parseExternalQuery(q, 'anime'));
  assert.throws(() => parseExternalId('mangadex', '../../admin'));
  assert.throws(() => parseExternalId('jikan', '0'));
});
test('Normalización no convierte un total anunciado en episodios o reproducción', () => {
  const title = normalizeJikan(jikan, 'anime');
  assert.equal(title.episodeCount, 12);
  assert.equal(title.status, 'announced');
  assert.equal(title.year, null);
  assert.equal(title.synopsis, 'Sinopsis de prueba');
  assert.equal(title.alternativeTitles.includes('Alias'), true);
  assert.equal('episodes' in title, false);
  assert.equal(normalizeMangaDex(manga, 'es').title, 'Manga de prueba');
  assert.equal(normalizeKitsu(kitsu, 'anime').year, 2024);
  assert.throws(() => normalizeJikan({ title: 'Sin identidad' }, 'anime'));
  assert.equal(
    normalizeJikan(
      { ...jikan, images: { jpg: { image_url: 'http://127.0.0.1/private' } } },
      'anime',
    ).coverUrl,
    null,
  );
});
test('Identidad solo fusiona identificadores declarados, nunca títulos parecidos', () => {
  const first = normalizeJikan(jikan, 'manga'),
    second = normalizeMangaDex(manga);
  assert.equal(workIdentity(first), workIdentity(second));
  assert.equal(deduplicateTitles([first, second]).length, 1);
  const other = {
    ...first,
    id: 'jikan-manga-102',
    externalIds: { mal: '102' },
  } satisfies ExternalTitle;
  assert.equal(deduplicateTitles([first, other]).length, 2);
  assert.equal(
    normalizeAniList({ id: 4, idMal: 101, title: { romaji: 'Test' } }, 'manga')
      .externalIds.mal,
    '101',
  );
});
test('SSRF: se rechazan hosts, protocolos, puertos y direcciones privadas o reservadas', () => {
  for (const url of [
    'http://api.jikan.moe/v4',
    'https://127.0.0.1/x',
    'https://api.jikan.moe.evil.test/x',
    'https://api.jikan.moe:8443/x',
    'https://u:p@api.jikan.moe/x',
    'https://api.jikan.moe/#fragment',
  ])
    assert.throws(() => validateProviderUrl(url));
  for (const address of [
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    '2001:db8::1',
  ])
    assert.equal(publicAddress(address), false, address);
  assert.equal(publicAddress('1.1.1.1'), true);
});
test('Caché, actualización manual y solicitudes concurrentes deduplicadas', async () => {
  let calls = 0;
  const wire: Wire = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 5));
    return { status: 200, headers: {}, body: { data: [1] } };
  };
  const transport = new ProviderTransport(0, 100, wire);
  const signal = AbortSignal.timeout(1000);
  await Promise.all([
    transport.json('https://api.jikan.moe/v4/anime/1', signal),
    transport.json('https://api.jikan.moe/v4/anime/1', signal),
  ]);
  await transport.json('https://api.jikan.moe/v4/anime/1', signal);
  assert.equal(calls, 1);
  await transport.json(
    'https://api.jikan.moe/v4/anime/1',
    signal,
    undefined,
    300,
    true,
  );
  assert.equal(calls, 2);
});
test('TTL expira y rate limit local se aplica antes de salir a la red', async () => {
  let now = 60000,
    calls = 0;
  const transport = new ProviderTransport(
    0,
    2,
    async () => {
      calls++;
      return { status: 200, headers: {}, body: { ok: true } };
    },
    1000,
    () => now,
  );
  const signal = AbortSignal.timeout(2000);
  await transport.json(
    'https://api.jikan.moe/v4/anime/1',
    signal,
    undefined,
    1,
  );
  now += 1500;
  await transport.json(
    'https://api.jikan.moe/v4/anime/1',
    signal,
    undefined,
    1,
  );
  assert.equal(calls, 2);
  await assert.rejects(
    transport.json('https://api.jikan.moe/v4/anime/2', signal),
    (error) =>
      error instanceof ProviderError && error.reason === 'rate_limited',
  );
  assert.equal(calls, 2);
});
test('429 respeta Retry-After y no reintenta contra el bloqueo', async () => {
  let calls = 0;
  const transport = new ProviderTransport(0, 100, async () => {
    calls++;
    return { status: 429, headers: { 'retry-after': '60' }, body: {} };
  });
  await assert.rejects(
    transport.json(
      'https://api.jikan.moe/v4/anime/1',
      AbortSignal.timeout(1000),
    ),
  );
  await assert.rejects(
    transport.json(
      'https://api.jikan.moe/v4/anime/2',
      AbortSignal.timeout(1000),
    ),
  );
  assert.equal(calls, 1);
  assert.equal(transport.status().lastError, 'rate_limited');
});
test('Un filtro rechazado por la fuente no se confunde con una caída ni abre el circuito', async () => {
  const transport = new ProviderTransport(0, 100, async () => ({
    status: 400,
    headers: {},
    body: { error: 'invalid filter' },
  }));
  await assert.rejects(
    transport.json(
      'https://api.jikan.moe/v4/anime?q=Test',
      AbortSignal.timeout(1000),
    ),
    (error) =>
      error instanceof ProviderError && error.reason === 'invalid_query',
  );
  assert.equal(transport.status().lastError, null);
});
test('Timeout acotado incluso si el transporte ignora AbortSignal', async () => {
  const transport = new ProviderTransport(
    0,
    100,
    async () => {
      await new Promise((r) => setTimeout(r, 100));
      return { status: 200, headers: {}, body: {} };
    },
    15,
  );
  await assert.rejects(
    transport.json(
      'https://api.jikan.moe/v4/anime/1',
      AbortSignal.timeout(1000),
    ),
    (error) => error instanceof ProviderError && error.reason === 'timeout',
  );
});
test('Caída reintenta una vez; redirecciones no se siguen', async () => {
  let calls = 0;
  const down = new ProviderTransport(0, 100, async () => {
    calls++;
    return { status: 503, headers: {}, body: null };
  });
  await assert.rejects(
    down.json('https://api.jikan.moe/v4/anime/1', AbortSignal.timeout(2000)),
  );
  assert.equal(calls, 2);
  const redirected = new ProviderTransport(0, 100, async () => ({
    status: 302,
    headers: { location: 'http://127.0.0.1' },
    body: {},
  }));
  await assert.rejects(
    redirected.json(
      'https://api.jikan.moe/v4/anime/1',
      AbortSignal.timeout(1000),
    ),
  );
});
test('AniList queda preparado pero no consulta sin autorización; búsquedas construyen URLs seguras', async () => {
  let calls = 0;
  const wire: Wire = async (url) => {
    calls++;
    assert.equal(url.hostname, 'api.jikan.moe');
    assert.equal(url.searchParams.get('q'), 'Alias');
    assert.equal(url.searchParams.get('genres'), '1');
    return {
      status: 200,
      headers: {},
      body: {
        data: [jikan],
        pagination: { has_next_page: true, items: { total: 2 } },
      },
    };
  };
  const disabled = createRemoteProvider('anilist', { wire });
  await assert.rejects(
    disabled.metadata!.searchCatalog!(
      { kind: 'anime', q: 'Test', page: 1, limit: 1, sort: 'relevance' },
      { signal: AbortSignal.timeout(1000) },
    ),
  );
  assert.equal(calls, 0);
  const adapter = createRemoteProvider('jikan', { wire, minimumIntervalMs: 0 });
  const result = await adapter.metadata!.searchCatalog!(
    {
      kind: 'anime',
      q: 'Alias',
      genre: '1',
      page: 1,
      limit: 1,
      sort: 'relevance',
    },
    { signal: AbortSignal.timeout(1000) },
  );
  assert.equal(result.items[0].source.externalId, '101');
  assert.equal(result.hasNextPage, true);
});
