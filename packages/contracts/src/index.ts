export type EntityId = string;
export const mediaKinds = ['anime', 'manga'] as const;
export type MediaKind = (typeof mediaKinds)[number];
export const trackingStates = [
  'planned',
  'in_progress',
  'completed',
  'paused',
  'dropped',
] as const;
export type TrackingState = (typeof trackingStates)[number];
export const providerCapabilities = [
  'metadata',
  'episode_availability',
  'playback',
  'manga',
] as const;
export type ProviderCapability = (typeof providerCapabilities)[number];
export const errorCodes = [
  'NOT_FOUND',
  'INVALID_PARAMETERS',
  'INVALID_PAGINATION',
  'PROVIDER_UNAVAILABLE',
  'OPERATION_NOT_ALLOWED',
  'INTERNAL_ERROR',
] as const;
export type ErrorCode = (typeof errorCodes)[number];
export interface ApiError {
  code: ErrorCode;
  message: string;
  requestId: string;
}
export interface Genre {
  id: EntityId;
  name: string;
}
interface Title {
  id: EntityId;
  title: string;
  synopsis: string;
  genres: readonly Genre[];
  year: number;
}
export interface Episode {
  id: EntityId;
  animeId: EntityId;
  number: number;
  title: string;
}
export interface Chapter {
  id: EntityId;
  mangaId: EntityId;
  number: number;
  title: string;
}
export interface Anime extends Title {
  kind: 'anime';
  episodes: readonly Episode[];
}
export interface Manga extends Title {
  kind: 'manga';
  chapters: readonly Chapter[];
}
export type CatalogTitle = Anime | Manga;
export interface ProviderDescriptor {
  id: EntityId;
  name: string;
  version: string;
  capabilities: readonly ProviderCapability[];
  languages: readonly string[];
  status: 'available' | 'unavailable';
  usagePolicy: {
    simulation: boolean;
    termsUrl?: string;
    allowsCaching: boolean;
    allowsPolling: boolean;
    allowsPlayback: boolean;
    allowsRedistribution: boolean;
  };
}
export interface LibraryEntry {
  profileId: EntityId;
  kind: MediaKind;
  mediaId: EntityId;
  status: TrackingState;
  favorite: boolean;
}
export type Favorite = LibraryEntry & { favorite: true };
export type HistoryEntry = {
  id: EntityId;
  profileId: EntityId;
  occurredAt: string;
} & (
  | { kind: 'anime'; episodeId: EntityId; positionSeconds: number }
  | { kind: 'manga'; chapterId: EntityId; page: number }
);
export interface PageQuery {
  page: number;
  limit: number;
}
export interface CatalogQuery extends PageQuery {
  q?: string;
  genre?: EntityId;
}
export interface LibraryQuery extends PageQuery {
  kind?: MediaKind;
  status?: TrackingState;
}
export interface Page<T> extends PageQuery {
  items: T[];
  total: number;
  totalPages: number;
}
export interface LibraryUpdate {
  status?: TrackingState;
  favorite?: boolean;
}
export class ContractError extends Error {
  constructor(
    public readonly code: 'INVALID_PARAMETERS' | 'INVALID_PAGINATION',
    message: string,
  ) {
    super(message);
  }
}
export function parseId(value: unknown): EntityId {
  if (
    typeof value !== 'string' ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ||
    value.length > 80
  )
    throw new ContractError('INVALID_PARAMETERS', 'Identificador inválido');
  return value;
}
function fields(
  input: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new ContractError('INVALID_PARAMETERS', 'Se esperaba un objeto');
  for (const key of Object.keys(input))
    if (!keys.includes(key))
      throw new ContractError(
        'INVALID_PARAMETERS',
        'Campo no admitido: ' + key,
      );
  return input as Record<string, unknown>;
}
function integer(
  input: unknown,
  fallback: number,
  maximum: number,
  name: string,
): number {
  if (input === undefined) return fallback;
  if (
    typeof input !== 'string' ||
    !/^[1-9][0-9]*$/.test(input) ||
    Number(input) > maximum
  )
    throw new ContractError(
      'INVALID_PAGINATION',
      name + ' debe ser un entero entre 1 y ' + maximum,
    );
  return Number(input);
}
function pageOf(query: Record<string, unknown>): PageQuery {
  return {
    page: integer(query.page, 1, 1000000, 'page'),
    limit: integer(query.limit, 20, 100, 'limit'),
  };
}
function option<const T extends string>(
  value: unknown,
  allowed: readonly T[],
  name: string,
): T | undefined {
  if (value === undefined) return undefined;
  const match = allowed.find((item) => item === value);
  if (match === undefined)
    throw new ContractError(
      'INVALID_PARAMETERS',
      'Valor inválido para ' + name,
    );
  return match;
}
export function parseMediaKind(value: unknown): MediaKind {
  const kind = option(value, mediaKinds, 'kind');
  if (!kind) throw new ContractError('INVALID_PARAMETERS', 'Falta kind');
  return kind;
}
export function parseCatalogQuery(input: unknown): CatalogQuery {
  const query = fields(input, ['page', 'limit', 'q', 'genre']);
  const { q, genre } = query;
  if (q !== undefined && (typeof q !== 'string' || !q.trim() || q.length > 120))
    throw new ContractError(
      'INVALID_PARAMETERS',
      'q debe tener entre 1 y 120 caracteres',
    );
  return {
    ...pageOf(query),
    q: q?.trim(),
    genre: genre === undefined ? undefined : parseId(genre),
  };
}
export function parseLibraryQuery(input: unknown): LibraryQuery {
  const query = fields(input, ['page', 'limit', 'kind', 'status']);
  return {
    ...pageOf(query),
    kind: option(query.kind, mediaKinds, 'kind'),
    status: option(query.status, trackingStates, 'status'),
  };
}
export function parseLibraryUpdate(input: unknown): LibraryUpdate {
  const body = fields(input, ['status', 'favorite']);
  const status = option(body.status, trackingStates, 'status');
  const favorite = body.favorite;
  if (favorite !== undefined && typeof favorite !== 'boolean')
    throw new ContractError('INVALID_PARAMETERS', 'favorite debe ser booleano');
  if (status === undefined && favorite === undefined)
    throw new ContractError('INVALID_PARAMETERS', 'Indica status o favorite');
  return { status, favorite };
}
