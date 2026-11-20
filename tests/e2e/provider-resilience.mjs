import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import {
  ProviderRegistry,
  createRemoteProvider,
  normalizeKitsu,
} from '@struchkai/providers';
import { ExternalService } from '../../apps/api/dist/modules/providers/external.service.js';

const registry = new ProviderRegistry();
registry.register(
  createRemoteProvider('kitsu', {
    minimumIntervalMs: 0,
    wire: async () => ({ status: 503, headers: {}, body: null }),
  }),
);
const service = new ExternalService(registry, { connection: undefined });
const title = normalizeKitsu(
  {
    id: '1',
    attributes: { canonicalTitle: 'Fixture conservado', status: 'finished' },
  },
  'anime',
);
await service.repository.save({ ...title, complete: true }, -1);
const query = { kind: 'anime', page: 1, limit: 8, sort: 'relevance' };
const page = {
  items: [],
  page: 1,
  limit: 8,
  total: 0,
  hasNextPage: false,
  warnings: [],
};
await service.repository.cacheReleases(title, query, page);
const now = Date.now();
mock.method(Date, 'now', () => now + 301000);
try {
  const cached = await service.detail('kitsu', 'anime', '1');
  assert.equal(cached.title, title.title);
  assert.equal(cached.cache.stale, true);
  await assert.rejects(
    service.detail('kitsu', 'anime', '1', true),
    (error) => error.status === 503 && error.code === 'PROVIDER_UNAVAILABLE',
  );
  const publications = await service.releases('kitsu', 'anime', '1', {
    page: '1',
    limit: '8',
  });
  assert.deepEqual(publications.items, []);
  assert.match(publications.warnings.join(' '), /caché caducada/);
  assert.equal(
    (await service.repository.cached('kitsu', 'anime', '1')).title,
    title.title,
  );
  assert.equal(service.availability('kitsu').state, 'unavailable');
  const offer = service.playback('kitsu', 'kitsu-episode-1');
  assert.equal(offer.authorization, 'not_granted');
  assert.equal(offer.url, null);
  console.info(
    'Resiliencia de servicio: ficha y publicaciones caducadas conservadas, actualización fallida explícita y reproducción no inventada',
  );
} finally {
  mock.restoreAll();
}
