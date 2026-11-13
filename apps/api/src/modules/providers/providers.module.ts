import { Controller, Get, Module, Param } from '@nestjs/common';
import { parseId } from '@struchkai/contracts';
import { ProviderRegistry } from '@struchkai/providers';
import { ApiFailure } from '../../http.js';
import { animeFixtures, mangaFixtures } from '../catalog/fixtures.js';
function fixtureRegistry() {
  const registry = new ProviderRegistry();
  const policy = {
    simulation: true,
    allowsCaching: true,
    allowsPolling: false,
    allowsPlayback: false,
    allowsRedistribution: false,
  };
  const titles = [...animeFixtures, ...mangaFixtures];
  registry.register({
    descriptor: {
      id: 'fixture-catalog',
      name: 'Catálogo simulado',
      version: '1.0.0',
      capabilities: ['metadata', 'episode_availability', 'manga'],
      languages: ['es'],
      status: 'available',
      usagePolicy: policy,
    },
    metadata: {
      search: async (query) =>
        titles.filter((title) =>
          title.title.toLowerCase().includes(query.toLowerCase()),
        ),
      getTitle: async (id) => titles.find((title) => title.id === id) ?? null,
    },
    episode_availability: {
      listEpisodes: async (id) =>
        animeFixtures.find((title) => title.id === id)?.episodes ?? [],
    },
    manga: {
      listChapters: async (id) =>
        mangaFixtures.find((title) => title.id === id)?.chapters ?? [],
    },
  });
  registry.register({
    descriptor: {
      id: 'fixture-offline',
      name: 'Fuente simulada fuera de servicio',
      version: '1.0.0',
      capabilities: [],
      languages: ['es'],
      status: 'unavailable',
      usagePolicy: policy,
    },
  });
  return registry;
}
@Controller('v1/providers')
class ProvidersController {
  constructor(private readonly registry: ProviderRegistry) {}
  @Get() list() {
    return this.registry.list();
  }
  @Get(':id') detail(@Param('id') id: unknown) {
    const adapter = this.registry.find(parseId(id));
    if (!adapter)
      throw new ApiFailure(404, 'NOT_FOUND', 'Proveedor no encontrado');
    if (adapter.descriptor.status === 'unavailable')
      throw new ApiFailure(
        503,
        'PROVIDER_UNAVAILABLE',
        'Proveedor no disponible',
      );
    return adapter.descriptor;
  }
}
@Module({
  controllers: [ProvidersController],
  providers: [{ provide: ProviderRegistry, useFactory: fixtureRegistry }],
})
export class ProvidersModule {}
