import { Injectable } from '@nestjs/common';
import {
  ContractError,
  parseExternalId,
  parseExternalQuery,
  parseId,
  parseMediaKind,
  type ExternalTitle,
  type ExternalRelease,
  type ExternalPage,
  type PlaybackOffer,
} from '@struchkai/contracts';
import {
  ProviderRegistry,
  ProviderError,
  fetchProviderCover,
  type RemoteAdapter,
} from '@struchkai/providers';
import { deduplicateTitles } from '@struchkai/domain';
import { Database } from '../../database.module.js';
import { ApiFailure } from '../../http.js';
import { ExternalRepository } from './external.repository.js';

@Injectable()
export class ExternalService {
  private readonly covers = new Map<
    string,
    { bytes: Buffer; contentType: string; expires: number }
  >();
  readonly repository: ExternalRepository;
  constructor(
    private readonly registry: ProviderRegistry,
    database: Database,
  ) {
    this.repository = new ExternalRepository(database.connection);
  }
  private adapter(id: unknown): RemoteAdapter {
    const adapter = this.registry.find(parseId(id)) as
      RemoteAdapter | undefined;
    if (!adapter?.settings || !adapter.metadata?.searchCatalog)
      throw new ApiFailure(404, 'NOT_FOUND', 'Fuente externa no encontrada');
    if (!adapter.settings.enabled)
      throw new ApiFailure(
        403,
        'OPERATION_NOT_ALLOWED',
        adapter.settings.reason ?? 'Proveedor deshabilitado',
      );
    return adapter;
  }
  private async run<T>(
    adapter: RemoteAdapter,
    operation: () => Promise<T>,
  ): Promise<T> {
    await this.repository.provider(adapter);
    try {
      const result = await operation();
      adapter.descriptor.status = 'available';
      await this.repository.provider(adapter);
      return result;
    } catch (error) {
      if (error instanceof ProviderError) {
        adapter.descriptor.status = 'unavailable';
        adapter.transport.noteError(error.reason);
        await this.repository.provider(adapter, error.reason);
        if (error.reason === 'not_found')
          throw new ApiFailure(
            404,
            'NOT_FOUND',
            'Obra no encontrada en la fuente',
          );
        if (error.reason === 'unsupported' || error.reason === 'policy')
          throw new ApiFailure(
            400,
            'OPERATION_NOT_ALLOWED',
            'Capacidad no admitida por la fuente',
          );
        throw new ApiFailure(
          503,
          'PROVIDER_UNAVAILABLE',
          error.reason === 'rate_limited'
            ? 'La fuente alcanzó su límite. Reintenta después de ' +
                Math.max(error.retryAfterSeconds, 1) +
                ' segundos.'
            : 'La fuente no respondió correctamente. La biblioteca local sigue disponible.',
        );
      }
      throw error;
    }
  }
  availability(id: unknown) {
    const adapter = this.registry.find(parseId(id)) as
      RemoteAdapter | undefined;
    if (!adapter?.settings)
      throw new ApiFailure(404, 'NOT_FOUND', 'Fuente externa no encontrada');
    const state = adapter.transport.status();
    return {
      provider: adapter.descriptor.id,
      enabled: adapter.settings.enabled,
      state: !adapter.settings.enabled
        ? 'disabled'
        : state.lastError
          ? 'unavailable'
          : state.lastSuccess
            ? 'available'
            : 'unverified',
      ...state,
      reason: adapter.settings.reason ?? null,
    };
  }
  listProviders() {
    return this.registry.list().flatMap((descriptor) => {
      const adapter = this.registry.find(descriptor.id) as RemoteAdapter;
      return adapter.settings
        ? [
            {
              ...descriptor,
              settings: adapter.settings,
              availability: this.availability(descriptor.id),
            },
          ]
        : [];
    });
  }
  async genres(provider: unknown, kind: unknown) {
    const adapter = this.adapter(provider),
      parsed = parseMediaKind(kind);
    if (!adapter.settings!.kinds.includes(parsed))
      throw new ContractError(
        'INVALID_PARAMETERS',
        'Tipo no admitido por la fuente',
      );
    return this.run(adapter, () =>
      adapter.metadata!.listGenres!(parsed, {
        signal: AbortSignal.timeout(10000),
      }),
    );
  }
  async search(provider: unknown, kind: unknown, params: unknown) {
    const query = parseExternalQuery(params, kind),
      adapter = this.adapter(provider);
    if (!adapter.settings!.kinds.includes(query.kind))
      throw new ContractError(
        'INVALID_PARAMETERS',
        'Tipo no admitido por la fuente',
      );
    return this.run(adapter, async () => {
      const page = await adapter.metadata!.searchCatalog!(query, {
        signal: AbortSignal.timeout(10000),
        language: query.language,
      });
      const items: ExternalTitle[] = [];
      for (const title of deduplicateTitles(page.items))
        items.push(await this.repository.save({ ...title, complete: false }));
      return { ...page, items };
    });
  }
  async detail(
    provider: unknown,
    kindValue: unknown,
    externalId: unknown,
    refresh = false,
  ): Promise<ExternalTitle> {
    const adapter = this.adapter(provider),
      kind = parseMediaKind(kindValue),
      id = parseExternalId(adapter.descriptor.id, externalId);
    if (!adapter.settings!.kinds.includes(kind))
      throw new ContractError(
        'INVALID_PARAMETERS',
        'Tipo no admitido por la fuente',
      );
    const cached = await this.repository.cached(
      adapter.descriptor.id,
      kind,
      id,
    );
    if (!refresh && cached?.complete && !cached.cache?.stale) return cached;
    try {
      return await this.run(adapter, async () => {
        const title = await adapter.metadata!.getCatalogTitle!(kind, id, {
          signal: AbortSignal.timeout(10000),
          region: refresh ? 'refresh' : undefined,
        });
        if (!title)
          throw new ApiFailure(404, 'NOT_FOUND', 'Obra no encontrada');
        return this.repository.save({ ...title, complete: true });
      });
    } catch (error) {
      await this.repository.failure(
        adapter.descriptor.id,
        kind,
        id,
        error instanceof ApiFailure ? error.code : 'INTERNAL_ERROR',
      );
      if (
        !refresh &&
        cached &&
        error instanceof ApiFailure &&
        error.code === 'PROVIDER_UNAVAILABLE'
      )
        return {
          ...cached,
          cache: {
            stale: true,
            expiresAt: cached.cache?.expiresAt ?? cached.source.fetchedAt,
          },
        };
      throw error;
    }
  }
  async releases(
    provider: unknown,
    kindValue: unknown,
    id: unknown,
    params: unknown,
    refresh = false,
  ): Promise<ExternalPage<ExternalRelease>> {
    const query = parseExternalQuery(params, kindValue),
      adapter = this.adapter(provider);
    const externalId = parseExternalId(adapter.descriptor.id, id);
    const cached = await this.repository.cachedReleases(
      adapter.descriptor.id,
      query.kind,
      externalId,
      query,
    );
    if (!refresh && cached && Date.parse(cached.expiresAt) > Date.now())
      return cached.page;
    const title = await this.detail(provider, query.kind, externalId);
    const method =
      query.kind === 'anime'
        ? adapter.episode_availability?.episodesPage
        : adapter.manga?.chaptersPage;
    if (!method)
      return {
        items: [],
        page: query.page,
        limit: query.limit,
        total: 0,
        hasNextPage: false,
        warnings: [
          'La fuente no enumera estas publicaciones. El total de episodios o capítulos no acredita disponibilidad.',
        ],
      };
    try {
      return await this.run(adapter, async () => {
        const result = await method(externalId, query, {
          signal: AbortSignal.timeout(10000),
          language: query.language,
          region: refresh ? 'refresh' : undefined,
        });
        result.items = result.items.map((item) => ({
          ...item,
          mediaId: title.id,
        }));
        await this.repository.releases(title, result.items);
        await this.repository.cacheReleases(title, query, result);
        return result;
      });
    } catch (error) {
      if (
        !refresh &&
        cached &&
        error instanceof ApiFailure &&
        error.code === 'PROVIDER_UNAVAILABLE'
      )
        return {
          ...cached.page,
          warnings: [
            ...cached.page.warnings,
            'La fuente está caída: se muestran publicaciones de la caché caducada.',
          ],
        };
      throw error;
    }
  }
  async cover(provider: unknown, kind: unknown, id: unknown) {
    const adapter = this.adapter(provider),
      mediaKind = parseMediaKind(kind),
      externalId = parseExternalId(adapter.descriptor.id, id);
    const title =
      (await this.repository.cached(
        adapter.descriptor.id,
        mediaKind,
        externalId,
      )) ?? (await this.detail(provider, kind, id));
    if (!title.coverUrl)
      throw new ApiFailure(404, 'NOT_FOUND', 'Portada no disponible');
    const cached = this.covers.get(title.coverUrl);
    if (cached && cached.expires > Date.now()) return cached;
    try {
      const result = await fetchProviderCover(
        title.coverUrl,
        AbortSignal.timeout(8000),
      );
      if (this.covers.size >= 32)
        this.covers.delete(this.covers.keys().next().value!);
      this.covers.set(title.coverUrl, {
        ...result,
        expires: Date.now() + 300000,
      });
      return result;
    } catch {
      throw new ApiFailure(
        503,
        'PROVIDER_UNAVAILABLE',
        'Portada temporalmente no disponible',
      );
    }
  }
  playback(provider: unknown, episodeId: unknown): PlaybackOffer {
    const adapter = this.adapter(provider);
    return {
      provider: adapter.descriptor.id,
      episodeId: parseId(episodeId),
      language: null,
      format: 'unknown',
      availability: 'unavailable',
      access: 'unavailable',
      mode: null,
      url: null,
      authorization: 'not_granted',
    };
  }
}
