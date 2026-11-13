import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ContractError,
  parseCatalogQuery,
  parseId,
  parseLibraryQuery,
  parseLibraryUpdate,
  type ProviderDescriptor,
} from '@struchkai/contracts';
import { ProviderRegistry } from '@struchkai/providers';
test('Contratos validan IDs, filtros, actualizaciones y paginación', () => {
  assert.equal(parseId('atlas-del-viento'), 'atlas-del-viento');
  assert.deepEqual(
    parseCatalogQuery({ q: ' Atlas ', page: '2', limit: '10' }),
    { q: 'Atlas', page: 2, limit: 10, genre: undefined },
  );
  assert.equal(parseLibraryQuery({ kind: 'manga' }).kind, 'manga');
  assert.equal(parseLibraryUpdate({ favorite: false }).favorite, false);
  for (const input of [
    { limit: '0' },
    { limit: '101' },
    { page: '1.5' },
    { page: ['1', '2'] },
    { page: '1000001' },
  ])
    assert.throws(
      () => parseCatalogQuery(input),
      (error: unknown) =>
        error instanceof ContractError && error.code === 'INVALID_PAGINATION',
    );
  for (const input of [{ q: '   ' }, { other: 'x' }, { genre: '../x' }])
    assert.throws(() => parseCatalogQuery(input), ContractError);
  for (const input of [
    {},
    { status: 'invalid' },
    { favorite: 'true' },
    { profileId: 'demo-rio' },
  ])
    assert.throws(() => parseLibraryUpdate(input), ContractError);
  assert.throws(() => parseId('a/b'), ContractError);
});
test('Registro extensible rechaza IDs duplicados y capacidades sin implementación', () => {
  const registry = new ProviderRegistry();
  const descriptor: ProviderDescriptor = {
    id: 'fixture',
    name: 'Fixture',
    version: '1',
    capabilities: [],
    languages: ['es'],
    status: 'unavailable',
    usagePolicy: {
      simulation: true,
      allowsCaching: false,
      allowsPolling: false,
      allowsPlayback: false,
      allowsRedistribution: false,
    },
  };
  registry.register({ descriptor });
  assert.equal(registry.find('fixture')?.descriptor, descriptor);
  assert.throws(() => registry.register({ descriptor }), /duplicado/);
  assert.throws(
    () =>
      registry.register({
        descriptor: { ...descriptor, id: 'other', capabilities: ['metadata'] },
      }),
    /inconsistentes/,
  );
});
