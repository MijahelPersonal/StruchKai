import type {
  CatalogTitle,
  ExternalTitle,
  ExternalQuery,
  ExternalPage,
  ExternalRelease,
  Genre,
  MediaKind,
  PublicationStatus,
} from '@struchkai/contracts';
import { parseExternalId, ContractError } from '@struchkai/contracts';
import type { ProviderAdapter, ProviderContext } from './index.js';
import { ProviderError, ProviderTransport, type Wire } from './transport.js';

export const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const list = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];
export const string = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
const number = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
const numericText = (value: unknown): number | null =>
  typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)
    ? Number(value)
    : number(value);
const text = (value: unknown) =>
  string(value)
    ?.replace(/<[^>]*>/g, '')
    .slice(0, 30000) ?? null;
const unique = (values: (string | null)[]) => [
  ...new Set(values.filter((value): value is string => Boolean(value))),
];
const timestamp = (value: unknown) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
const localized = (value: unknown, language = 'es') => {
  const values = object(value);
  return (
    string(values[language]) ??
    string(values.en) ??
    string(values['ja-ro']) ??
    Object.values(values).map(string).find(Boolean) ??
    null
  );
};
export function imageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      [
        'cdn.myanimelist.net',
        'uploads.mangadex.org',
        'media.kitsu.app',
        'media.kitsu.io',
        's4.anilist.co',
      ].includes(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}
const status = (value: unknown): PublicationStatus => {
  const key = String(value).toLowerCase();
  if (
    [
      'airing',
      'publishing',
      'releasing',
      'current',
      'ongoing',
      'currently airing',
    ].includes(key)
  )
    return 'releasing';
  if (
    [
      'finished',
      'completed',
      'finished airing',
      'finished publishing',
    ].includes(key)
  )
    return 'finished';
  if (
    [
      'not_yet_released',
      'not yet aired',
      'upcoming',
      'unreleased',
      'tba',
    ].includes(key)
  )
    return 'announced';
  if (['hiatus', 'on hiatus'].includes(key)) return 'hiatus';
  if (['cancelled', 'discontinued'].includes(key)) return 'cancelled';
  return 'unknown';
};
const source = (provider: string, externalId: string, url: string) => ({
  provider,
  externalId,
  url,
  fetchedAt: new Date().toISOString(),
});
function base(
  provider: string,
  kind: MediaKind,
  externalId: string,
  url: string,
): ExternalTitle {
  parseExternalId(provider, externalId);
  return {
    id: `${provider}-${kind}-${externalId}`,
    kind,
    title: '',
    alternativeTitles: [],
    synopsis: null,
    genres: [],
    coverUrl: null,
    year: null,
    season: null,
    status: 'unknown',
    episodeCount: null,
    chapterCount: null,
    languages: [],
    updatedAt: null,
    externalIds: {},
    relations: [],
    source: source(provider, externalId, url),
  };
}
export function normalizeJikan(raw: unknown, kind: MediaKind): ExternalTitle {
  const item = object(raw);
  if (!Number.isSafeInteger(item.mal_id) || !string(item.title))
    throw new ProviderError('invalid_response');
  const id = String(item.mal_id),
    title = base('jikan', kind, id, `https://myanimelist.net/${kind}/${id}`);
  title.title = String(item.title);
  title.alternativeTitles = unique([
    string(item.title_english),
    string(item.title_japanese),
    ...list(item.title_synonyms).map(string),
    ...list(item.titles).map((value) => string(object(value).title)),
  ]);
  title.synopsis = text(item.synopsis);
  title.genres = list(item.genres)
    .map((raw) => {
      const genre = object(raw);
      return { id: String(genre.mal_id), name: string(genre.name) ?? '' };
    })
    .filter((g) => /^\d+$/.test(g.id) && g.name);
  title.coverUrl = imageUrl(object(object(item.images).jpg).image_url);
  title.year =
    number(item.year) ??
    number(
      object(object(item.aired ?? item.published).prop).from &&
        object(object(object(item.aired ?? item.published).prop).from).year,
    );
  if (['winter', 'spring', 'summer', 'fall'].includes(String(item.season)))
    title.season = item.season as ExternalQuery['season'];
  title.status = status(item.status);
  title.episodeCount = number(item.episodes);
  title.chapterCount = number(item.chapters);
  title.externalIds.mal = id;
  title.relations = list(item.relations).flatMap((raw) => {
    const relation = object(raw);
    return list(relation.entry).flatMap((entry) => {
      const value = object(entry);
      return Number.isSafeInteger(value.mal_id)
        ? [
            {
              type: string(relation.relation) ?? 'related',
              title: string(value.name),
              provider: 'jikan',
              externalId: String(value.mal_id),
              kind:
                value.type === 'anime' || value.type === 'manga'
                  ? value.type
                  : null,
            },
          ]
        : [];
    });
  });
  return title;
}
export function normalizeMangaDex(
  raw: unknown,
  language?: string,
): ExternalTitle {
  const item = object(raw),
    attr = object(item.attributes);
  if (!string(item.id) || !localized(attr.title, language))
    throw new ProviderError('invalid_response');
  const id = String(item.id),
    title = base('mangadex', 'manga', id, `https://mangadex.org/title/${id}`);
  title.title = localized(attr.title, language)!;
  title.alternativeTitles = unique(
    list(attr.altTitles).flatMap((value) =>
      Object.values(object(value)).map(string),
    ),
  );
  title.synopsis = text(localized(attr.description, language));
  title.year = number(attr.year);
  title.status = status(attr.status);
  title.updatedAt = timestamp(attr.updatedAt);
  title.languages = unique(list(attr.availableTranslatedLanguages).map(string));
  title.genres = list(attr.tags)
    .map((raw) => {
      const tag = object(raw);
      return {
        id: String(tag.id),
        name: localized(object(tag.attributes).name, 'en') ?? '',
      };
    })
    .filter((g) => g.name);
  const cover = list(item.relationships)
    .map(object)
    .find((value) => value.type === 'cover_art');
  const filename = string(object(cover?.attributes).fileName);
  if (filename && /^[a-zA-Z0-9._-]+$/.test(filename))
    title.coverUrl = `https://uploads.mangadex.org/covers/${id}/${filename}.256.jpg`;
  title.externalIds.mangadex = id;
  const mal = string(object(attr.links).mal);
  if (mal && /^[1-9]\d*$/.test(mal)) title.externalIds.mal = mal;
  title.relations = list(item.relationships)
    .map(object)
    .filter((value) => value.type === 'manga')
    .map((value) => ({
      type: string(value.related) ?? 'related',
      title: null,
      provider: 'mangadex',
      externalId: String(value.id),
      kind: 'manga',
    }));
  return title;
}
export function normalizeKitsu(
  raw: unknown,
  kind: MediaKind,
  included: unknown[] = [],
): ExternalTitle {
  const item = object(raw),
    attr = object(item.attributes);
  if (!string(item.id) || !string(attr.canonicalTitle))
    throw new ProviderError('invalid_response');
  const id = String(item.id),
    title = base(
      'kitsu',
      kind,
      id,
      `https://kitsu.app/${kind}/${string(attr.slug) ?? id}`,
    );
  title.title = String(attr.canonicalTitle);
  title.alternativeTitles = unique([
    ...Object.values(object(attr.titles)).map(string),
    ...list(attr.abbreviatedTitles).map(string),
  ]);
  title.synopsis = text(attr.synopsis ?? attr.description);
  title.coverUrl = imageUrl(
    object(attr.posterImage).small ?? object(attr.posterImage).original,
  );
  const start = timestamp(attr.startDate);
  title.year = start ? Number(start.slice(0, 4)) : null;
  title.updatedAt = timestamp(attr.updatedAt);
  title.status = status(attr.status);
  title.episodeCount = number(attr.episodeCount);
  title.chapterCount = number(attr.chapterCount);
  title.externalIds.kitsu = id;
  const refs = list(object(object(item.relationships).categories).data)
    .map(object)
    .map((value) => value.id);
  title.genres = included
    .map(object)
    .filter((value) => value.type === 'categories' && refs.includes(value.id))
    .map((value) => ({
      id: String(object(value.attributes).slug),
      name: string(object(value.attributes).title) ?? '',
    }))
    .filter((g) => g.name);
  return title;
}
function legacy(title: ExternalTitle): CatalogTitle {
  const value = {
    id: title.id,
    title: title.title,
    synopsis: title.synopsis ?? '',
    year: title.year,
    genres: title.genres,
  };
  return title.kind === 'anime'
    ? { ...value, kind: 'anime', episodes: [] }
    : { ...value, kind: 'manga', chapters: [] };
}
export interface RemoteAdapter extends ProviderAdapter {
  transport: ProviderTransport;
}
export function createRemoteProvider(
  provider: 'jikan' | 'mangadex' | 'kitsu' | 'anilist',
  options: {
    wire?: Wire;
    anilistApproved?: boolean;
    minimumIntervalMs?: number;
    timeoutMs?: number;
  } = {},
): RemoteAdapter {
  const urls = {
    jikan: 'https://api.jikan.moe/v4',
    mangadex: 'https://api.mangadex.org',
    kitsu: 'https://kitsu.app/api/edge',
    anilist: 'https://graphql.anilist.co',
  };
  const interval =
    provider === 'anilist' ? 2100 : provider === 'jikan' ? 1100 : 400;
  const transport = new ProviderTransport(
    options.minimumIntervalMs ?? interval,
    provider === 'anilist' ? 25 : provider === 'jikan' ? 50 : 100,
    options.wire,
    options.timeoutMs,
  );
  const enabled = provider !== 'anilist' || options.anilistApproved === true;
  const contextUrl = (
    path: string,
    params: Record<string, string | number | undefined> = {},
  ) => {
    const url = new URL(urls[provider] + path);
    for (const [key, value] of Object.entries(params))
      if (value !== undefined) url.searchParams.set(key, String(value));
    return url.href;
  };
  const call = async (
    path: string,
    context: ProviderContext,
    params: Record<string, string | number | undefined> = {},
    body?: unknown,
  ) => {
    if (!enabled) throw new ProviderError('policy');
    return object(
      await transport.json(
        contextUrl(path, params),
        context.signal,
        body,
        300,
        context.region === 'refresh',
      ),
    );
  };
  const check = (kind: MediaKind, query?: ExternalQuery) => {
    if (provider === 'mangadex' && kind !== 'manga')
      throw new ProviderError('unsupported');
    if (query?.season && (provider === 'mangadex' || kind === 'manga'))
      throw new ContractError(
        'INVALID_PARAMETERS',
        'La fuente no permite filtrar temporada para esta consulta',
      );
    if (query?.sort === 'updated' && provider === 'jikan')
      throw new ContractError(
        'INVALID_PARAMETERS',
        'Jikan no permite ordenar por actualización',
      );
    if (query?.year && provider === 'mangadex')
      throw new ContractError(
        'INVALID_PARAMETERS',
        'MangaDex no permite filtrar año en su búsqueda',
      );
    if (query?.year && provider === 'kitsu' && kind === 'manga')
      throw new ContractError(
        'INVALID_PARAMETERS',
        'El filtro anual de Kitsu se limita a anime',
      );
    if (query?.status === 'unknown')
      throw new ContractError(
        'INVALID_PARAMETERS',
        'Filtra por un estado conocido',
      );
  };
  const page = <T>(
    items: T[],
    query: ExternalQuery,
    total: number | null,
    more: boolean,
  ): ExternalPage<T> => ({
    items,
    page: query.page,
    limit: query.limit,
    total,
    hasNextPage: more,
    warnings: [],
  });
  const search = async (
    query: ExternalQuery,
    context: ProviderContext,
  ): Promise<ExternalPage<ExternalTitle>> => {
    check(query.kind, query);
    if (provider === 'jikan') {
      const states = {
        announced: query.kind === 'anime' ? 'upcoming' : 'upcoming',
        releasing: query.kind === 'anime' ? 'airing' : 'publishing',
        finished: 'complete',
        hiatus: 'hiatus',
        cancelled: 'discontinued',
        unknown: undefined,
      };
      const params: Record<string, string | number | undefined> = {
        q: query.q,
        page: query.page,
        limit: query.limit,
        sfw: 'true',
        genres: query.genre,
        status: query.status ? states[query.status] : undefined,
        order_by:
          query.sort === 'title'
            ? 'title'
            : query.sort === 'year'
              ? 'start_date'
              : undefined,
        sort: query.sort === 'year' ? 'desc' : 'asc',
      };
      if (query.year) {
        params.start_date = `${query.year}-01-01`;
        params.end_date = `${query.year}-12-31`;
      }
      const path = query.season
        ? `/seasons/${query.year ?? new Date().getFullYear()}/${query.season}`
        : `/${query.kind}`;
      if (query.season && (query.q || query.genre || query.status))
        throw new ContractError(
          'INVALID_PARAMETERS',
          'La ruta de temporadas de Jikan no combina búsqueda, género o estado',
        );
      const result = await call(path, context, params);
      if (!Array.isArray(result.data))
        throw new ProviderError('invalid_response');
      const pagination = object(result.pagination);
      return page(
        result.data.map((raw) => normalizeJikan(raw, query.kind)),
        query,
        number(object(pagination.items).total),
        pagination.has_next_page === true,
      );
    }
    if (provider === 'mangadex') {
      const states = {
        announced: undefined,
        releasing: 'ongoing',
        finished: 'completed',
        hiatus: 'hiatus',
        cancelled: 'cancelled',
        unknown: undefined,
      };
      if (query.status === 'announced')
        throw new ContractError(
          'INVALID_PARAMETERS',
          'MangaDex no ofrece el filtro anunciado',
        );
      const params: Record<string, string | number | undefined> = {
        title: query.q,
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
        'includes[]': 'cover_art',
        'contentRating[]': 'safe',
        'includedTags[]': query.genre,
        'status[]': query.status ? states[query.status] : undefined,
        'availableTranslatedLanguage[]': query.language,
      };
      params[
        `order[${query.sort === 'title' ? 'title' : query.sort === 'year' ? 'year' : query.sort === 'updated' ? 'updatedAt' : 'relevance'}]`
      ] = query.sort === 'title' || query.sort === 'relevance' ? 'asc' : 'desc';
      const result = await call('/manga', context, params);
      if (!Array.isArray(result.data))
        throw new ProviderError('invalid_response');
      const total = number(result.total);
      return page(
        result.data.map((raw) => normalizeMangaDex(raw, query.language)),
        query,
        total,
        total !== null && query.page * query.limit < Math.min(total, 10000),
      );
    }
    if (provider === 'kitsu') {
      const states = {
        announced: 'upcoming',
        releasing: 'current',
        finished: 'finished',
        hiatus: undefined,
        cancelled: undefined,
        unknown: undefined,
      };
      if (query.status && !states[query.status])
        throw new ContractError(
          'INVALID_PARAMETERS',
          'Kitsu no admite ese estado',
        );
      const params = {
        'filter[text]': query.q,
        'filter[categories]': query.genre,
        'filter[seasonYear]': query.year,
        'filter[season]': query.season,
        'filter[status]': query.status ? states[query.status] : undefined,
        'page[limit]': query.limit,
        'page[offset]': (query.page - 1) * query.limit,
        include: 'categories',
        sort:
          query.sort === 'title'
            ? 'id'
            : query.sort === 'year'
              ? '-startDate'
              : query.sort === 'updated'
                ? '-updatedAt'
                : undefined,
      };
      const result = await call('/' + query.kind, context, params);
      if (!Array.isArray(result.data))
        throw new ProviderError('invalid_response');
      const normalized = result.data.map((raw) =>
        normalizeKitsu(raw, query.kind, list(result.included)),
      );
      if (query.sort === 'title')
        normalized.sort((a, b) => a.title.localeCompare(b.title));
      const output = page(
        normalized,
        query,
        number(object(result.meta).count),
        Boolean(object(result.links).next),
      );
      if (query.sort === 'title')
        output.warnings.push(
          'Kitsu: orden por título aplicado solo a esta página; paginación estable por identificador.',
        );
      return output;
    }
    const gql =
      'query($search:String,$type:MediaType,$page:Int,$perPage:Int,$genre:String,$season:MediaSeason,$year:Int,$status:MediaStatus,$sort:[MediaSort]){Page(page:$page,perPage:$perPage){pageInfo{total hasNextPage} media(search:$search,type:$type,genre:$genre,season:$season,seasonYear:$year,status:$status,sort:$sort,isAdult:false){' +
      anilistFields +
      '}}}';
    const statusMap = {
      announced: 'NOT_YET_RELEASED',
      releasing: 'RELEASING',
      finished: 'FINISHED',
      hiatus: 'HIATUS',
      cancelled: 'CANCELLED',
      unknown: undefined,
    };
    const result = await call(
      '',
      context,
      {},
      {
        query: gql,
        variables: {
          search: query.q,
          type: query.kind.toUpperCase(),
          page: query.page,
          perPage: query.limit,
          genre: query.genre,
          season: query.season?.toUpperCase(),
          year: query.year,
          status: query.status ? statusMap[query.status] : undefined,
          sort:
            query.sort === 'title'
              ? ['TITLE_ROMAJI']
              : query.sort === 'year'
                ? ['START_DATE_DESC']
                : query.sort === 'updated'
                  ? ['UPDATED_AT_DESC']
                  : ['SEARCH_MATCH'],
        },
      },
    );
    if (result.errors) throw new ProviderError('invalid_response');
    const data = object(object(result.data).Page),
      info = object(data.pageInfo);
    if (!Array.isArray(data.media)) throw new ProviderError('invalid_response');
    return page(
      data.media.map((raw) => normalizeAniList(raw, query.kind)),
      query,
      number(info.total),
      info.hasNextPage === true,
    );
  };
  const detail = async (
    kind: MediaKind,
    id: string,
    context: ProviderContext,
  ): Promise<ExternalTitle | null> => {
    check(kind);
    parseExternalId(provider, id);
    try {
      if (provider === 'jikan')
        return normalizeJikan(
          (await call(`/${kind}/${id}/full`, context)).data,
          kind,
        );
      if (provider === 'mangadex')
        return normalizeMangaDex(
          (await call(`/manga/${id}`, context, { 'includes[]': 'cover_art' }))
            .data,
          context.language,
        );
      if (provider === 'kitsu') {
        const result = await call(`/${kind}/${id}`, context, {
          include: 'categories',
        });
        return normalizeKitsu(result.data, kind, list(result.included));
      }
      const result = await call(
        '',
        context,
        {},
        {
          query: 'query($id:Int){Media(id:$id){' + anilistFields + '}}',
          variables: { id: Number(id) },
        },
      );
      if (result.errors) throw new ProviderError('invalid_response');
      return normalizeAniList(object(result.data).Media, kind);
    } catch (error) {
      if (error instanceof ProviderError && error.reason === 'not_found')
        return null;
      throw error;
    }
  };
  const releases = async (
    id: string,
    query: ExternalQuery,
    context: ProviderContext,
  ): Promise<ExternalPage<ExternalRelease>> => {
    parseExternalId(provider, id);
    if (provider === 'jikan' && query.kind === 'anime') {
      const result = await call(`/anime/${id}/episodes`, context, {
        page: query.page,
      });
      if (!Array.isArray(result.data))
        throw new ProviderError('invalid_response');
      // Jikan fixes episode pages at 100; its contract must not pretend a different upstream size.
      const items = result.data.map((raw) => {
        const item = object(raw);
        const episode = String(item.mal_id);
        parseExternalId('jikan', episode);
        const aired = timestamp(item.aired);
        return {
          id: `jikan-episode-${id}-${episode}`,
          mediaId: `jikan-anime-${id}`,
          number: numericText(item.mal_id),
          volume: null,
          title: string(item.title),
          language: null,
          publishedAt: aired,
          updatedAt: null,
          availability: aired
            ? Date.parse(aired) > Date.now()
              ? 'announced'
              : 'published'
            : 'unknown',
          playback: 'unavailable',
          externalUrl: null,
          credits: [],
          source: source(
            'jikan',
            episode,
            `https://myanimelist.net/anime/${id}`,
          ),
        } satisfies ExternalRelease;
      });
      return {
        ...page(
          items,
          { ...query, limit: 100 },
          null,
          object(result.pagination).has_next_page === true,
        ),
        warnings: [
          'Jikan informa publicaciones, no disponibilidad de reproducción. Páginas de 100 fijadas por la fuente.',
        ],
      };
    }
    if (provider === 'mangadex' && query.kind === 'manga') {
      const result = await call(`/manga/${id}/feed`, context, {
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
        'translatedLanguage[]': query.language ?? 'es',
        'order[chapter]': 'asc',
        'includes[]': 'scanlation_group',
        includeFutureUpdates: '0',
        includeFuturePublishAt: '0',
      });
      if (!Array.isArray(result.data))
        throw new ProviderError('invalid_response');
      const items = result.data.map((raw) => {
        const item = object(raw),
          attr = object(item.attributes),
          chapter = String(item.id);
        parseExternalId('mangadex', chapter);
        const published = timestamp(attr.publishAt);
        return {
          id: `mangadex-chapter-${chapter}`,
          mediaId: `mangadex-manga-${id}`,
          number: numericText(attr.chapter),
          volume: string(attr.volume),
          title: string(attr.title),
          language: string(attr.translatedLanguage),
          publishedAt: published,
          updatedAt: timestamp(attr.updatedAt),
          availability: published
            ? Date.parse(published) > Date.now()
              ? 'announced'
              : 'published'
            : 'unknown',
          playback: 'unavailable',
          externalUrl: `https://mangadex.org/chapter/${chapter}`,
          credits: list(item.relationships)
            .map(object)
            .filter((value) => value.type === 'scanlation_group')
            .flatMap((value) => string(object(value.attributes).name) ?? []),
          source: source(
            'mangadex',
            chapter,
            `https://mangadex.org/chapter/${chapter}`,
          ),
        } satisfies ExternalRelease;
      });
      const total = number(result.total);
      return page(
        items,
        query,
        total,
        total !== null && query.page * query.limit < Math.min(total, 10000),
      );
    }
    if (provider === 'kitsu' && query.kind === 'anime') {
      const result = await call('/episodes', context, {
        'filter[mediaType]': 'Anime',
        'filter[mediaId]': id,
        'page[limit]': query.limit,
        'page[offset]': (query.page - 1) * query.limit,
        sort: 'number',
      });
      if (!Array.isArray(result.data))
        throw new ProviderError('invalid_response');
      const items = result.data.map((raw) => {
        const item = object(raw),
          attr = object(item.attributes),
          episode = String(item.id);
        parseExternalId('kitsu', episode);
        const aired = timestamp(attr.airdate);
        return {
          id: `kitsu-episode-${episode}`,
          mediaId: `kitsu-anime-${id}`,
          number: number(attr.number),
          volume: null,
          title: string(attr.canonicalTitle),
          language: null,
          publishedAt: aired,
          updatedAt: timestamp(attr.updatedAt),
          availability: aired
            ? Date.parse(aired) > Date.now()
              ? 'announced'
              : 'published'
            : 'unknown',
          playback: 'unavailable',
          externalUrl: null,
          credits: [],
          source: source('kitsu', episode, `https://kitsu.app/anime/${id}`),
        } satisfies ExternalRelease;
      });
      return {
        ...page(
          items,
          query,
          number(object(result.meta).count),
          Boolean(object(result.links).next),
        ),
        warnings: [
          'Fechas de emisión de Kitsu; no concede derechos de reproducción.',
        ],
      };
    }
    return {
      ...page([], query, 0, false),
      warnings: [
        'La fuente no proporciona publicaciones enumeradas para este tipo de obra.',
      ],
    };
  };
  const genres = async (
    kind: MediaKind,
    context: ProviderContext,
  ): Promise<Genre[]> => {
    check(kind);
    if (provider === 'jikan') {
      const result = await call('/genres/' + kind, context);
      if (!Array.isArray(result.data))
        throw new ProviderError('invalid_response');
      return result.data.map((raw) => ({
        id: String(object(raw).mal_id),
        name: String(object(raw).name),
      }));
    }
    if (provider === 'mangadex') {
      const result = await call('/manga/tag', context);
      return list(result.data).map((raw) => ({
        id: String(object(raw).id),
        name: localized(object(object(raw).attributes).name, 'en') ?? '',
      }));
    }
    if (provider === 'kitsu') {
      const result = await call('/categories', context, {
        'page[limit]': 20,
        sort: 'title',
      });
      return list(result.data).map((raw) => ({
        id: String(object(object(raw).attributes).slug),
        name: String(object(object(raw).attributes).title),
      }));
    }
    return [];
  };
  const episodes = provider === 'jikan' || provider === 'kitsu';
  const manga = provider === 'mangadex';
  return {
    transport,
    descriptor: {
      id: provider,
      name: {
        jikan: 'Jikan / MyAnimeList',
        mangadex: 'MangaDex',
        kitsu: 'Kitsu',
        anilist: 'AniList',
      }[provider],
      version: '1.0.0',
      capabilities: [
        'metadata',
        ...(episodes ? ['episode_availability' as const] : []),
        ...(manga ? ['manga' as const] : []),
      ],
      languages: provider === 'mangadex' ? ['es', 'es-la', 'en'] : [],
      status: 'unavailable',
      usagePolicy: {
        simulation: false,
        termsUrl: {
          jikan: 'https://jikan.moe/terms',
          mangadex: 'https://api.mangadex.org/docs/',
          kitsu: 'https://hummingbird-me.github.io/api-docs/',
          anilist: 'https://docs.anilist.co/guide/terms-of-use',
        }[provider],
        allowsCaching: provider !== 'anilist',
        allowsPolling: false,
        allowsPlayback: false,
        allowsRedistribution: false,
      },
    },
    settings: {
      kinds: provider === 'mangadex' ? ['manga'] : ['anime', 'manga'],
      requestsPerMinute: transport.requestsPerMinute,
      minimumIntervalMs: transport.minimumIntervalMs,
      cacheTtlSeconds: 300,
      baseUrl: urls[provider],
      enabled,
      reason: enabled
        ? undefined
        : 'Requiere autorización específica de AniList para servicios de seguimiento.',
      attribution:
        provider === 'jikan'
          ? 'Datos MyAnimeList mediante Jikan'
          : provider === 'mangadex'
            ? 'Datos MangaDex; capítulos acreditados a sus grupos'
            : 'Datos ' + provider,
      filters:
        provider === 'mangadex'
          ? ['q', 'genre', 'status', 'language', 'sort']
          : ['q', 'genre', 'year', 'season', 'status', 'sort'],
    },
    metadata: {
      searchCatalog: search,
      getCatalogTitle: detail,
      listGenres: genres,
      search: async (q, context) =>
        (
          await search(
            {
              kind: provider === 'mangadex' ? 'manga' : 'anime',
              q,
              page: 1,
              limit: 20,
              sort: 'relevance',
            },
            context,
          )
        ).items.map(legacy),
      getTitle: async (id, context) => {
        const match =
          /^(?:jikan|mangadex|kitsu|anilist)-(anime|manga)-(.+)$/.exec(id);
        if (!match) return null;
        const title = await detail(match[1] as MediaKind, match[2], context);
        return title ? legacy(title) : null;
      },
    },
    ...(episodes
      ? {
          episode_availability: {
            episodesPage: releases,
            listEpisodes: async (id, context) =>
              (
                await releases(
                  id.replace(/^(jikan|kitsu)-anime-/, ''),
                  { kind: 'anime', page: 1, limit: 25, sort: 'relevance' },
                  context,
                )
              ).items
                .filter((value) => value.number !== null)
                .map((value) => ({
                  id: value.id,
                  animeId: value.mediaId,
                  number: value.number!,
                  title: value.title ?? '',
                })),
          },
        }
      : {}),
    ...(manga
      ? {
          manga: {
            chaptersPage: releases,
            listChapters: async (id, context) =>
              (
                await releases(
                  id.replace(/^mangadex-manga-/, ''),
                  { kind: 'manga', page: 1, limit: 25, sort: 'relevance' },
                  context,
                )
              ).items
                .filter((value) => value.number !== null)
                .map((value) => ({
                  id: value.id,
                  mangaId: value.mediaId,
                  number: value.number!,
                  title: value.title ?? '',
                })),
          },
        }
      : {}),
  };
}
const anilistFields =
  'id idMal title{romaji english native} synonyms description(asHtml:false) genres coverImage{large} startDate{year} season status episodes chapters siteUrl';
export function normalizeAniList(raw: unknown, kind: MediaKind): ExternalTitle {
  const item = object(raw);
  if (!Number.isSafeInteger(item.id))
    throw new ProviderError('invalid_response');
  const id = String(item.id),
    title = base('anilist', kind, id, `https://anilist.co/${kind}/${id}`),
    names = object(item.title);
  title.title =
    string(names.romaji) ?? string(names.english) ?? string(names.native) ?? '';
  if (!title.title) throw new ProviderError('invalid_response');
  title.alternativeTitles = unique([
    ...Object.values(names).map(string),
    ...list(item.synonyms).map(string),
  ]);
  title.synopsis = text(item.description);
  title.genres = list(item.genres).flatMap((value) =>
    typeof value === 'string'
      ? [{ id: value.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: value }]
      : [],
  );
  title.coverUrl = imageUrl(object(item.coverImage).large);
  title.year = number(object(item.startDate).year);
  const season = String(item.season).toLowerCase();
  if (['winter', 'spring', 'summer', 'fall'].includes(season))
    title.season = season as ExternalQuery['season'];
  title.status = status(item.status);
  title.episodeCount = number(item.episodes);
  title.chapterCount = number(item.chapters);
  title.externalIds.anilist = id;
  if (Number.isSafeInteger(item.idMal) && Number(item.idMal) > 0)
    title.externalIds.mal = String(item.idMal);
  return title;
}
