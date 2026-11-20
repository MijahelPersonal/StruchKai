const text = { type: 'string' },
  nullableText = { type: 'string', nullable: true },
  number = { type: 'number', nullable: true };
const object = (
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) => ({ type: 'object', properties, required });
const array = (items: unknown) => ({ type: 'array', items });
const ref = (name: string) => ({ $ref: '#/components/schemas/' + name });
const parameter = (name: string, schema: unknown, where = 'query') => ({
  name,
  in: where,
  required: where === 'path',
  schema,
});
const provider = parameter(
  'provider',
  { type: 'string', enum: ['kitsu', 'mangadex', 'jikan', 'anilist'] },
  'path',
);
const kind = parameter(
  'kind',
  { type: 'string', enum: ['anime', 'manga'] },
  'path',
);
const id = parameter('id', text, 'path');
const paging = [
  parameter('page', { type: 'integer', minimum: 1, maximum: 400, default: 1 }),
  parameter('limit', { type: 'integer', minimum: 1, maximum: 25, default: 20 }),
];
const errors = {
  400: {
    description: 'Parámetro, filtro o paginación inválidos',
    content: { 'application/json': { schema: ref('ApiError') } },
  },
  403: {
    description: 'Proveedor no autorizado por su política',
    content: { 'application/json': { schema: ref('ApiError') } },
  },
  404: {
    description: 'Fuente u obra no encontrada',
    content: { 'application/json': { schema: ref('ApiError') } },
  },
  503: {
    description:
      'Fuente caída, timeout o límite; biblioteca local independiente',
    content: {
      'application/json': {
        schema: ref('ApiError'),
        example: {
          code: 'PROVIDER_UNAVAILABLE',
          message:
            'La fuente no respondió correctamente. La biblioteca local sigue disponible.',
          requestId: '55c58411-7f11-4000-8000-000000000000',
        },
      },
    },
  },
};
const operation = (
  summary: string,
  parameters: unknown[],
  schema: unknown,
) => ({
  summary,
  tags: ['Fuentes externas'],
  parameters,
  responses: {
    200: {
      description:
        'Resultado de la fuente, con procedencia y caché cuando corresponde',
      content: { 'application/json': { schema } },
    },
    ...errors,
  },
});
const page = (item: string) =>
  object({
    items: array(ref(item)),
    page: { type: 'integer' },
    limit: { type: 'integer' },
    total: { type: 'integer', nullable: true },
    hasNextPage: { type: 'boolean' },
    warnings: array(text),
  });
const query = [
  ...paging,
  parameter('q', { type: 'string', maxLength: 120, example: 'Cowboy Bebop' }),
  parameter('genre', text),
  parameter('year', { type: 'integer', minimum: 1900, maximum: 2100 }),
  parameter('season', {
    type: 'string',
    enum: ['winter', 'spring', 'summer', 'fall'],
  }),
  parameter('status', {
    type: 'string',
    enum: ['announced', 'releasing', 'finished', 'hiatus', 'cancelled'],
  }),
  parameter('sort', {
    type: 'string',
    enum: ['relevance', 'title', 'year', 'updated'],
  }),
];
const releases = [
  provider,
  kind,
  id,
  ...paging,
  parameter('language', { type: 'string', enum: ['es', 'es-la', 'en', 'ja'] }),
];
export const externalOpenApi = {
  paths: {
    '/v1/external/providers': {
      get: operation(
        'Listar fuentes, condiciones, cuotas y estado observado sin consultas remotas',
        [],
        array(ref('ExternalProvider')),
      ),
    },
    '/v1/external/providers/{provider}/availability': {
      get: operation(
        'Último estado observado de una fuente; no es sondeo periódico',
        [provider],
        ref('ProviderAvailability'),
      ),
    },
    '/v1/external/{provider}/{kind}/genres': {
      get: operation(
        'Géneros/etiquetas; Kitsu devuelve una página de categorías',
        [provider, kind],
        array(ref('Genre')),
      ),
    },
    '/v1/external/{provider}/{kind}/search': {
      get: operation(
        'Buscar títulos y alternativas. Solo se aceptan filtros compatibles con la fuente.',
        [provider, kind, ...query],
        ref('ExternalTitlePage'),
      ),
    },
    '/v1/external/{provider}/{kind}/{id}': {
      get: operation(
        'Ficha por identidad externa; puede devolver caché caducada indicada explícitamente',
        [provider, kind, id],
        ref('ExternalTitle'),
      ),
    },
    '/v1/external/{provider}/{kind}/{id}/refresh': {
      post: operation(
        'Actualizar ficha bajo demanda respetando cuotas y permisos',
        [provider, kind, id],
        ref('ExternalTitle'),
      ),
    },
    '/v1/external/{provider}/{kind}/{id}/releases': {
      get: operation(
        'Publicaciones informadas, sin afirmar derechos de reproducción. Jikan fija páginas de 100 episodios.',
        releases,
        ref('ExternalReleasePage'),
      ),
    },
    '/v1/external/{provider}/{kind}/{id}/releases/refresh': {
      post: operation(
        'Actualizar una página de publicaciones, conservando el último dato válido ante errores',
        releases,
        ref('ExternalReleasePage'),
      ),
    },
    '/v1/external/{provider}/{kind}/{id}/cover': {
      get: {
        summary: 'Portada validada, sin URLs arbitrarias ni redirecciones',
        tags: ['Fuentes externas'],
        parameters: [provider, kind, id],
        responses: {
          200: {
            description: 'Imagen de hasta 4 MiB',
            content: {
              'image/jpeg': { schema: { type: 'string', format: 'binary' } },
              'image/png': { schema: { type: 'string', format: 'binary' } },
              'image/webp': { schema: { type: 'string', format: 'binary' } },
            },
          },
          ...errors,
        },
      },
    },
    '/v1/external/{provider}/playback/{episodeId}': {
      get: operation(
        'Contrato para el futuro reproductor. Fuentes actuales: sin reproducción autorizada.',
        [provider, parameter('episodeId', text, 'path')],
        ref('PlaybackOffer'),
      ),
    },
  },
  schemas: {
    ProviderAvailability: object({
      provider: text,
      enabled: { type: 'boolean' },
      state: {
        type: 'string',
        enum: ['disabled', 'unverified', 'available', 'unavailable'],
      },
      lastSuccess: nullableText,
      lastFailure: nullableText,
      lastError: nullableText,
      retryAfterSeconds: { type: 'integer' },
      reason: nullableText,
    }),
    ExternalProvider: {
      allOf: [
        ref('Provider'),
        object({
          settings: object(
            {
              kinds: array({ type: 'string', enum: ['anime', 'manga'] }),
              requestsPerMinute: { type: 'integer' },
              minimumIntervalMs: { type: 'integer' },
              cacheTtlSeconds: { type: 'integer' },
              baseUrl: text,
              enabled: { type: 'boolean' },
              reason: nullableText,
              attribution: text,
              filters: array(text),
            },
            [
              'kinds',
              'requestsPerMinute',
              'minimumIntervalMs',
              'cacheTtlSeconds',
              'baseUrl',
              'enabled',
              'attribution',
              'filters',
            ],
          ),
          availability: ref('ProviderAvailability'),
        }),
      ],
    },
    Provenance: object({
      provider: text,
      externalId: text,
      url: { type: 'string', format: 'uri' },
      fetchedAt: { type: 'string', format: 'date-time' },
    }),
    ExternalTitle: object(
      {
        id: text,
        kind: { type: 'string', enum: ['anime', 'manga'] },
        title: text,
        alternativeTitles: array(text),
        synopsis: nullableText,
        genres: array(ref('Genre')),
        coverUrl: nullableText,
        year: number,
        season: nullableText,
        status: {
          type: 'string',
          enum: [
            'announced',
            'releasing',
            'finished',
            'hiatus',
            'cancelled',
            'unknown',
          ],
        },
        episodeCount: number,
        chapterCount: number,
        languages: array(text),
        updatedAt: nullableText,
        externalIds: { type: 'object', additionalProperties: text },
        relations: array(
          object({
            type: text,
            title: nullableText,
            provider: text,
            externalId: text,
            kind: nullableText,
          }),
        ),
        source: ref('Provenance'),
        cache: object({
          stale: { type: 'boolean' },
          expiresAt: { type: 'string', format: 'date-time' },
        }),
        duplicateOf: text,
        complete: { type: 'boolean' },
      },
      [
        'id',
        'kind',
        'title',
        'alternativeTitles',
        'synopsis',
        'genres',
        'coverUrl',
        'year',
        'season',
        'status',
        'episodeCount',
        'chapterCount',
        'languages',
        'updatedAt',
        'externalIds',
        'relations',
        'source',
      ],
    ),
    ExternalRelease: object({
      id: text,
      mediaId: text,
      number,
      volume: nullableText,
      title: nullableText,
      language: nullableText,
      publishedAt: nullableText,
      updatedAt: nullableText,
      availability: {
        type: 'string',
        enum: ['announced', 'published', 'unknown'],
      },
      playback: { type: 'string', enum: ['unavailable'] },
      externalUrl: nullableText,
      credits: array(text),
      source: ref('Provenance'),
    }),
    ExternalTitlePage: page('ExternalTitle'),
    ExternalReleasePage: page('ExternalRelease'),
    PlaybackOffer: object({
      provider: text,
      episodeId: text,
      language: nullableText,
      format: { type: 'string', enum: ['hls', 'dash', 'mp4', 'unknown'] },
      availability: {
        type: 'string',
        enum: ['available', 'unavailable', 'region_restricted', 'unknown'],
      },
      access: {
        type: 'string',
        enum: ['free', 'subscription', 'purchase', 'unavailable'],
      },
      mode: {
        type: 'string',
        enum: ['external', 'embed', 'direct'],
        nullable: true,
      },
      url: nullableText,
      authorization: {
        type: 'string',
        enum: ['provider_granted', 'not_granted'],
      },
    }),
  },
};
