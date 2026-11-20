import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalogRequest } from '@struchkai/contracts';
test('El puente de catálogo solo construye operaciones REST cerradas y valida entradas', () => {
  const request = catalogRequest('search', {
    provider: 'kitsu',
    kind: 'anime',
    query: { q: 'Cowboy Bebop', page: '2', limit: '8' },
  });
  const url = new URL(request.path, 'http://127.0.0.1:3100');
  assert.equal(url.origin, 'http://127.0.0.1:3100');
  assert.equal(url.pathname, '/v1/external/kitsu/anime/search');
  assert.equal(url.searchParams.get('q'), 'Cowboy Bebop');
  assert.equal(url.searchParams.get('page'), '2');
  for (const input of [
    { provider: 'https://evil.test', kind: 'anime', id: '1' },
    { provider: 'kitsu', kind: 'anime', id: '../account' },
    { provider: 'kitsu', kind: 'anime', id: '1', url: 'https://evil.test' },
  ])
    assert.throws(() => catalogRequest('detail', input));
  assert.throws(() =>
    catalogRequest('delete', { provider: 'kitsu', kind: 'anime', id: '1' }),
  );
  assert.equal(
    catalogRequest('refresh', { provider: 'kitsu', kind: 'anime', id: '1' })
      .method,
    'POST',
  );
});
