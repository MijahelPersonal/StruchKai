import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { createRemoteProvider, fetchProviderCover } from '@struchkai/providers';

const results = [];
for (const [provider, kind, q] of [
  ['kitsu', 'anime', 'Cowboy Bebop'],
  ['mangadex', 'manga', 'Blue Period'],
  ['jikan', 'anime', 'Cowboy Bebop'],
]) {
  const adapter = createRemoteProvider(provider);
  try {
    const context = { signal: AbortSignal.timeout(10000) };
    const search = await adapter.metadata.searchCatalog(
      { kind, q, page: 1, limit: 2, sort: 'relevance' },
      context,
    );
    assert.ok(search.items.length);
    // Select the exact returned identity, never infer chapter/episode identity from title text.
    const target =
      search.items.find(
        (title) => title.title.toLowerCase() === q.toLowerCase(),
      ) ?? search.items[0];
    const detail = await adapter.metadata.getCatalogTitle(
      kind,
      target.source.externalId,
      { signal: AbortSignal.timeout(10000) },
    );
    assert.equal(detail.source.externalId, target.source.externalId);
    assert.equal(detail.kind, kind);
    const method =
      kind === 'anime'
        ? adapter.episode_availability?.episodesPage
        : adapter.manga?.chaptersPage;
    const publications = method
      ? await method(
          detail.source.externalId,
          {
            kind,
            page: 1,
            limit: 2,
            sort: 'relevance',
            language: kind === 'manga' ? 'en' : undefined,
          },
          { signal: AbortSignal.timeout(10000) },
        )
      : null;
    if (publications)
      for (const item of publications.items) {
        assert.equal(item.playback, 'unavailable');
        assert.equal(item.source.provider, provider);
      }
    let cover = false;
    if (detail.coverUrl) {
      const image = await fetchProviderCover(
        detail.coverUrl,
        AbortSignal.timeout(8000),
      );
      assert.ok(image.bytes.length);
      cover = true;
    }
    const genres = await adapter.metadata.listGenres(kind, {
      signal: AbortSignal.timeout(10000),
    });
    const entry = {
      provider,
      state: 'verified',
      kind,
      externalId: detail.source.externalId,
      title: detail.title,
      searchItems: search.items.length,
      releaseItems: publications?.items.length ?? 0,
      hasNextPage: publications?.hasNextPage ?? false,
      genres: genres.length,
      cover,
    };
    results.push(entry);
    console.info(JSON.stringify(entry));
  } catch (error) {
    const entry = {
      provider,
      state: 'unavailable',
      reason: error.reason ?? 'verification_failed',
    };
    results.push(entry);
    console.info(JSON.stringify(entry));
  }
}
results.push({
  provider: 'anilist',
  state: 'disabled',
  reason: 'Sin autorización específica; no se realizó ninguna consulta.',
});
await mkdir('.struchkai-local', { recursive: true });
await writeFile(
  '.struchkai-local/providers-live.json',
  JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2),
);
assert.equal(
  results.some(
    (result) => result.provider === 'kitsu' && result.state === 'verified',
  ),
  true,
  'No se pudo verificar la fuente activa de anime',
);
assert.equal(
  results.some(
    (result) => result.provider === 'mangadex' && result.state === 'verified',
  ),
  true,
  'No se pudo verificar MangaDex',
);
