import { Controller, Get } from '@nestjs/common';
import {
  errorCodes,
  mediaKinds,
  providerCapabilities,
  trackingStates,
} from '@struchkai/contracts';
import { animeFixtures, mangaFixtures } from './modules/catalog/fixtures.js';
const string = { type: 'string' };
const integer = { type: 'integer' };
const boolean = { type: 'boolean' };
const id = { ...string, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 80 };
const object = (
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) => ({ type: 'object', properties, required });
const ref = (name: string) => ({ $ref: '#/components/schemas/' + name });
const array = (items: unknown) => ({ type: 'array', items });
const genre = object({ id, name: string });
const title = {
  id,
  title: string,
  synopsis: string,
  year: integer,
  genres: array(ref('Genre')),
};
const kind = { ...string, enum: mediaKinds };
const status = { ...string, enum: trackingStates };
const libraryExample = {
  profileId: 'demo-alex',
  kind: 'anime',
  mediaId: 'atlas-del-viento',
  status: 'planned',
  favorite: true,
};
const providerExample = {
  id: 'fixture-catalog',
  name: 'Catálogo simulado',
  version: '1.0.0',
  capabilities: ['metadata', 'episode_availability', 'manga'],
  languages: ['es'],
  status: 'available',
  usagePolicy: {
    simulation: true,
    allowsCaching: true,
    allowsPolling: false,
    allowsPlayback: false,
    allowsRedistribution: false,
  },
};
const page = (name: string) =>
  object({
    items: array(ref(name)),
    page: integer,
    limit: integer,
    total: integer,
    totalPages: integer,
  });
const pageExample = (item: unknown) => ({
  items: [item],
  page: 1,
  limit: 20,
  total: 1,
  totalPages: 1,
});
const parameter = (
  name: string,
  schema: unknown,
  example: unknown,
  where: 'query' | 'path' = 'query',
) => ({ name, in: where, required: where === 'path', schema, example });
const paging = [
  parameter(
    'page',
    { ...integer, minimum: 1, maximum: 1000000, default: 1 },
    1,
  ),
  parameter('limit', { ...integer, minimum: 1, maximum: 100, default: 20 }, 20),
];
const catalogQuery = [
  ...paging,
  parameter('q', { ...string, minLength: 1, maxLength: 120 }, 'Atlas'),
  parameter('genre', id, 'adventure'),
];
const profile = parameter('profileId', id, 'demo-alex', 'path');
const entry = [
  profile,
  parameter('kind', kind, 'anime', 'path'),
  parameter('id', id, 'atlas-del-viento', 'path'),
];
const libraryQuery = [
  profile,
  ...paging,
  parameter('kind', kind, 'anime'),
  parameter('status', status, 'planned'),
];
const response = (description: string, schema: unknown, example?: unknown) => ({
  description,
  headers: { 'X-Request-Id': { schema: { ...string, format: 'uuid' } } },
  content: { 'application/json': { schema, example } },
});
const error = (code: (typeof errorCodes)[number], message: string) =>
  response(message, ref('ApiError'), {
    code,
    message,
    requestId: '55c58411-7f11-43a6-8be4-e98232c02c39',
  });
const invalid = error('INVALID_PARAMETERS', 'Parámetros inválidos');
const pagination = error('INVALID_PAGINATION', 'Paginación inválida');
const notFound = error('NOT_FOUND', 'Recurso no encontrado');
const forbidden = error(
  'OPERATION_NOT_ALLOWED',
  'Perfil de prueba no permitido',
);
const internal = error('INTERNAL_ERROR', 'Error interno');
const invalidList = {
  description: 'Parámetros o paginación inválidos',
  content: {
    'application/json': {
      schema: ref('ApiError'),
      examples: {
        parameters: { value: invalid.content['application/json'].example },
        pagination: { value: pagination.content['application/json'].example },
      },
    },
  },
  headers: invalid.headers,
};
const operation = (
  summary: string,
  parameters: unknown[],
  responses: Record<number, unknown>,
) => ({ summary, parameters, responses: { ...responses, 500: internal } });
function catalogPaths(
  name: 'Anime' | 'Manga',
  example: (typeof animeFixtures)[number] | (typeof mangaFixtures)[number],
) {
  const segment = name.toLowerCase();
  const query = catalogQuery.map((p) =>
    p.name === 'q'
      ? { ...p, example: example.title.split(' ')[0] }
      : p.name === 'genre'
        ? { ...p, example: example.genres[0]?.id }
        : p,
  );
  return {
    ['/v1/' + segment]: {
      get: operation('Buscar y listar ' + segment, query, {
        200: response('Página', ref(name + 'Page'), pageExample(example)),
        400: invalidList,
      }),
    },
    ['/v1/' + segment + '/{id}']: {
      get: operation(
        'Detalle de ' + segment,
        [parameter('id', id, example.id, 'path')],
        {
          200: response('Detalle', ref(name), example),
          400: invalid,
          404: notFound,
        },
      ),
    },
  };
}
const library = '/v1/library/{profileId}';
const document = {
  openapi: '3.0.3',
  info: {
    title: 'StruchKai · API local',
    version: '1.0.0',
    description:
      'Proveedores simulados. Catálogo y biblioteca respaldados por PostgreSQL. Los perfiles demo-alex y demo-rio son selectores de prueba. API exclusiva de desarrollo.',
  },
  paths: {
    ...catalogPaths('Anime', animeFixtures[0]),
    ...catalogPaths('Manga', mangaFixtures[0]),
    '/v1/providers': {
      get: operation('Listar proveedores simulados', [], {
        200: response('Proveedores', array(ref('Provider')), [providerExample]),
      }),
    },
    '/v1/providers/{id}': {
      get: operation(
        'Consultar proveedor',
        [parameter('id', id, 'fixture-catalog', 'path')],
        {
          200: response('Proveedor', ref('Provider'), providerExample),
          400: invalid,
          404: notFound,
          503: error('PROVIDER_UNAVAILABLE', 'Proveedor no disponible'),
        },
      ),
    },
    [library]: {
      get: operation('Listar biblioteca de prueba', libraryQuery, {
        200: response(
          'Biblioteca',
          ref('LibraryPage'),
          pageExample(libraryExample),
        ),
        400: invalidList,
        403: forbidden,
      }),
    },
    [library + '/favorites']: {
      get: operation('Listar favoritos de prueba', libraryQuery, {
        200: response(
          'Favoritos',
          ref('LibraryPage'),
          pageExample(libraryExample),
        ),
        400: invalidList,
        403: forbidden,
      }),
    },
    [library + '/{kind}/{id}']: {
      put: operation('Añadir a biblioteca', entry, {
        200: response('Entrada', ref('LibraryEntry'), {
          ...libraryExample,
          favorite: false,
        }),
        400: invalid,
        403: forbidden,
        404: notFound,
      }),
      patch: {
        ...operation('Actualizar seguimiento o favorito', entry, {
          200: response('Entrada', ref('LibraryEntry'), libraryExample),
          400: invalid,
          403: forbidden,
          404: notFound,
        }),
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: ref('LibraryUpdate'),
              example: { favorite: true },
            },
          },
        },
      },
      delete: operation('Eliminar de biblioteca', entry, {
        204: { description: 'Entrada eliminada', headers: invalid.headers },
        400: invalid,
        403: forbidden,
        404: notFound,
      }),
    },
  },
  components: {
    schemas: {
      Genre: genre,
      Episode: object({
        id,
        animeId: id,
        number: { type: 'number' },
        title: string,
      }),
      Chapter: object({
        id,
        mangaId: id,
        number: { type: 'number' },
        title: string,
      }),
      Anime: object({
        ...title,
        kind: { ...string, enum: ['anime'] },
        episodes: array(ref('Episode')),
      }),
      Manga: object({
        ...title,
        kind: { ...string, enum: ['manga'] },
        chapters: array(ref('Chapter')),
      }),
      AnimePage: page('Anime'),
      MangaPage: page('Manga'),
      LibraryPage: page('LibraryEntry'),
      LibraryEntry: object({
        profileId: id,
        kind,
        mediaId: id,
        status,
        favorite: boolean,
      }),
      LibraryUpdate: {
        ...object({ status, favorite: boolean }, []),
        minProperties: 1,
        additionalProperties: false,
      },
      Provider: object({
        id,
        name: string,
        version: string,
        capabilities: array({ ...string, enum: providerCapabilities }),
        languages: array(string),
        status: { ...string, enum: ['available', 'unavailable'] },
        usagePolicy: object(
          {
            simulation: boolean,
            termsUrl: { ...string, format: 'uri' },
            allowsCaching: boolean,
            allowsPolling: boolean,
            allowsPlayback: boolean,
            allowsRedistribution: boolean,
          },
          [
            'simulation',
            'allowsCaching',
            'allowsPolling',
            'allowsPlayback',
            'allowsRedistribution',
          ],
        ),
      }),
      ApiError: object({
        code: { ...string, enum: errorCodes },
        message: string,
        requestId: { ...string, format: 'uuid' },
      }),
    },
  },
};
@Controller('v1')
export class OpenApiController {
  @Get('openapi.json') specification() {
    return document;
  }
}
