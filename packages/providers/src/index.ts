import {
  parseId,
  type CatalogTitle,
  type Chapter,
  type EntityId,
  type Episode,
  type ProviderCapability,
  type ProviderDescriptor,
} from '@struchkai/contracts';
export interface ProviderContext {
  signal: AbortSignal;
  language?: string;
  region?: string;
}
export interface MetadataProvider {
  search(
    query: string,
    context: ProviderContext,
  ): Promise<readonly CatalogTitle[]>;
  getTitle(
    id: EntityId,
    context: ProviderContext,
  ): Promise<CatalogTitle | null>;
}
export interface EpisodeAvailabilityProvider {
  listEpisodes(
    seriesId: EntityId,
    context: ProviderContext,
  ): Promise<readonly Episode[]>;
}
export interface PlaybackProvider {
  resolvePlayback(
    episodeId: EntityId,
    context: ProviderContext,
  ): Promise<{
    mode: 'direct' | 'embed' | 'external';
    url: string;
    expiresAt?: string;
  } | null>;
}
export interface MangaProvider {
  listChapters(
    titleId: EntityId,
    context: ProviderContext,
  ): Promise<readonly Chapter[]>;
}
export interface ProviderAdapter {
  descriptor: ProviderDescriptor;
  metadata?: MetadataProvider;
  episode_availability?: EpisodeAvailabilityProvider;
  playback?: PlaybackProvider;
  manga?: MangaProvider;
}
export class ProviderRegistry {
  private readonly adapters = new Map<EntityId, ProviderAdapter>();
  register(adapter: ProviderAdapter): void {
    const { descriptor } = adapter;
    parseId(descriptor.id);
    if (this.adapters.has(descriptor.id))
      throw new Error('Proveedor duplicado: ' + descriptor.id);
    const capabilities: ProviderCapability[] = [
      'metadata',
      'episode_availability',
      'playback',
      'manga',
    ];
    if (
      new Set(descriptor.capabilities).size !==
        descriptor.capabilities.length ||
      capabilities.some(
        (capability) =>
          Boolean(adapter[capability]) !==
          descriptor.capabilities.includes(capability),
      )
    )
      throw new Error('Capacidades inconsistentes: ' + descriptor.id);
    this.adapters.set(descriptor.id, adapter);
  }
  list(): ProviderDescriptor[] {
    return [...this.adapters.values()].map((adapter) => adapter.descriptor);
  }
  find(id: EntityId): ProviderAdapter | undefined {
    return this.adapters.get(id);
  }
}
