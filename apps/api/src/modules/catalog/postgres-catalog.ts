import { Injectable } from '@nestjs/common';
import { sql } from '@struchkai/database';
import type {
  Anime,
  Manga,
  CatalogQuery,
  MediaKind,
  Page,
} from '@struchkai/contracts';
import { Database } from '../../database.module.js';
import {
  CatalogRepository,
  type Titles,
  normalize,
} from './catalog.repository.js';
type CatalogRow = Omit<Anime, 'kind' | 'episodes'> & {
  deliveries: Array<{ id: string; number: number; title: string }>;
  total: number;
};
const names = {
  anime: {
    work: 'anime',
    genres: 'anime_genres',
    fk: 'anime_id',
    delivery: 'anime_episodes',
  },
  manga: {
    work: 'manga',
    genres: 'manga_genres',
    fk: 'manga_id',
    delivery: 'manga_chapters',
  },
} as const;
@Injectable()
export class PostgresCatalogRepository extends CatalogRepository {
  constructor(private readonly database: Database) {
    super();
  }
  private async query<K extends MediaKind>(
    kind: K,
    query: CatalogQuery,
    id?: string,
  ): Promise<Page<Titles[K]>> {
    const n = names[kind];
    const work = sql.identifier(n.work),
      bridge = sql.identifier(n.genres),
      parent = sql.identifier(n.fk),
      delivery = sql.identifier(n.delivery);
    const term = query.q ? normalize(query.q) : null;
    const genre = query.genre ?? null;
    const result = await this.database.db.execute<CatalogRow>(sql`
   WITH matches AS (SELECT w.* FROM ${work} w
      WHERE (${id ?? null}::text IS NULL OR w.slug=${id ?? null})
        AND (${term}::text IS NULL OR strpos(w.search_title,${term})>0)
        AND (${genre}::text IS NULL OR EXISTS (SELECT 1 FROM ${bridge} b JOIN genres g ON g.id=b.genre_id WHERE b.${parent}=w.id AND g.slug=${genre}))),
   page_rows AS (SELECT * FROM matches ORDER BY slug LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit})
   SELECT w.slug AS id,w.title,w.synopsis,w.year,
     coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.slug,'name',g.name) ORDER BY g.slug) FROM ${bridge} b JOIN genres g ON g.id=b.genre_id WHERE b.${parent}=w.id),'[]') AS genres,
     coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.slug,'number',d.number,'title',d.title) ORDER BY d.number,d.slug) FROM ${delivery} d WHERE d.${parent}=w.id),'[]') AS deliveries,
     counts.total FROM (SELECT count(*)::int AS total FROM matches) counts LEFT JOIN page_rows w ON true ORDER BY w.slug
  `);
    const total = result.rows[0]?.total ?? 0;
    const items = result.rows
      .filter((row) => row.id !== null)
      .map(({ id, title, synopsis, year, genres, deliveries }) => {
        const base = { id, title, synopsis, year, genres };
        const item: Anime | Manga =
          kind === 'anime'
            ? {
                ...base,
                kind,
                episodes: deliveries.map((d) => ({ ...d, animeId: id })),
              }
            : {
                ...base,
                kind,
                chapters: deliveries.map((d) => ({ ...d, mangaId: id })),
              };
        return item as Titles[K];
      });
    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    };
  }
  list<K extends MediaKind>(kind: K, query: CatalogQuery) {
    return this.query(kind, query);
  }
  async find<K extends MediaKind>(kind: K, id: string) {
    return (await this.query(kind, { page: 1, limit: 1 }, id)).items[0];
  }
}
