import {
  ContractError,
  parseId,
  parseMediaKind,
  type MediaKind,
  type Genre,
  type ProviderDescriptor,
} from './index.js';

export interface ExternalProviderSummary extends ProviderDescriptor {
  settings: {
    kinds: readonly MediaKind[];
    requestsPerMinute: number;
    minimumIntervalMs: number;
    cacheTtlSeconds: number;
    baseUrl: string;
    enabled: boolean;
    reason?: string;
    attribution: string;
    filters: readonly string[];
  };
  availability: {
    state: string;
    lastSuccess: string | null;
    lastError: string | null;
    retryAfterSeconds: number;
  };
}

export type PublicationStatus =
  'announced' | 'releasing' | 'finished' | 'hiatus' | 'cancelled' | 'unknown';
export interface ExternalQuery {
  kind: MediaKind;
  q?: string;
  genre?: string;
  year?: number;
  season?: 'winter' | 'spring' | 'summer' | 'fall';
  status?: PublicationStatus;
  sort: 'relevance' | 'title' | 'year' | 'updated';
  language?: string;
  page: number;
  limit: number;
}
export interface Provenance {
  provider: string;
  externalId: string;
  url: string;
  fetchedAt: string;
}
export interface ExternalTitle {
  complete?: boolean;
  id: string;
  kind: MediaKind;
  title: string;
  alternativeTitles: string[];
  synopsis: string | null;
  genres: Genre[];
  coverUrl: string | null;
  year: number | null;
  season: ExternalQuery['season'] | null;
  status: PublicationStatus;
  episodeCount: number | null;
  chapterCount: number | null;
  languages: string[];
  updatedAt: string | null;
  externalIds: {
    mal?: string;
    kitsu?: string;
    anilist?: string;
    mangadex?: string;
  };
  relations: Array<{
    type: string;
    title: string | null;
    provider: string;
    externalId: string;
    kind: MediaKind | null;
  }>;
  source: Provenance;
  cache?: { stale: boolean; expiresAt: string };
  duplicateOf?: string;
}
export interface ExternalRelease {
  id: string;
  mediaId: string;
  number: number | null;
  volume: string | null;
  title: string | null;
  language: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  availability: 'announced' | 'published' | 'unknown';
  playback: 'unavailable';
  externalUrl: string | null;
  credits: string[];
  source: Provenance;
}
export interface ExternalPage<T> {
  items: T[];
  page: number;
  limit: number;
  total: number | null;
  hasNextPage: boolean;
  warnings: string[];
}
export interface PlaybackOffer {
  provider: string;
  episodeId: string;
  language: string | null;
  format: 'hls' | 'dash' | 'mp4' | 'unknown';
  availability: 'available' | 'unavailable' | 'region_restricted' | 'unknown';
  access: 'free' | 'subscription' | 'purchase' | 'unavailable';
  mode: 'external' | 'embed' | 'direct' | null;
  url: string | null;
  authorization: 'provider_granted' | 'not_granted';
}
export function parseExternalQuery(
  input: unknown,
  kindValue: unknown,
): ExternalQuery {
  const kind = parseMediaKind(kindValue);
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new ContractError('INVALID_PARAMETERS', 'Consulta inválida');
  const value = input as Record<string, unknown>;
  const allowed = [
    'q',
    'genre',
    'year',
    'season',
    'status',
    'sort',
    'language',
    'page',
    'limit',
  ];
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new ContractError('INVALID_PARAMETERS', 'Filtro no admitido');
  const integer = (key: string, fallback: number, max: number) => {
    const raw = value[key];
    if (raw === undefined) return fallback;
    if (
      typeof raw !== 'string' ||
      !/^[1-9][0-9]*$/.test(raw) ||
      Number(raw) > max
    )
      throw new ContractError('INVALID_PAGINATION', key + ' inválido');
    return Number(raw);
  };
  const text = (key: string, max: number) => {
    const raw = value[key];
    if (raw === undefined) return undefined;
    if (typeof raw !== 'string' || !raw.trim() || raw.length > max)
      throw new ContractError('INVALID_PARAMETERS', key + ' inválido');
    return raw.trim();
  };
  const choice = <T extends string>(
    key: string,
    options: readonly T[],
  ): T | undefined => {
    const raw = text(key, 40);
    if (raw === undefined) return undefined;
    if (!options.includes(raw as T))
      throw new ContractError('INVALID_PARAMETERS', key + ' inválido');
    return raw as T;
  };
  const year = value.year === undefined ? undefined : integer('year', 0, 2100);
  if (year !== undefined && year < 1900)
    throw new ContractError('INVALID_PARAMETERS', 'Año inválido');
  return {
    kind,
    q: text('q', 120),
    genre: text('genre', 80),
    year,
    season: choice('season', ['winter', 'spring', 'summer', 'fall']),
    status: choice('status', [
      'announced',
      'releasing',
      'finished',
      'hiatus',
      'cancelled',
      'unknown',
    ]),
    sort:
      choice('sort', ['relevance', 'title', 'year', 'updated']) ?? 'relevance',
    language: choice('language', ['es', 'es-la', 'en', 'ja']),
    page: integer('page', 1, 400),
    limit: integer('limit', 20, 25),
  };
}
export function parseExternalId(provider: string, value: unknown): string {
  const id = parseId(value);
  if (
    provider === 'mangadex'
      ? !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)
      : !/^[1-9][0-9]{0,9}$/.test(id)
  )
    throw new ContractError(
      'INVALID_PARAMETERS',
      'Identificador externo inválido',
    );
  return id;
}
