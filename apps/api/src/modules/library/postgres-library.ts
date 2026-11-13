import { Injectable } from '@nestjs/common';
import { sql } from '@struchkai/database';
import type {
  LibraryEntry,
  LibraryQuery,
  LibraryUpdate,
  MediaKind,
} from '@struchkai/contracts';
import { Database } from '../../database.module.js';
import { LibraryRepository } from './library.repository.js';
import { ApiFailure } from '../../http.js';
type LibraryRow = { [K in keyof LibraryEntry]: LibraryEntry[K] };
const joins = sql`from library_entries e join user_profiles p on p.id=e.profile_id left join anime a on a.id=e.anime_id left join manga m on m.id=e.manga_id left join user_favorites f on f.entry_id=e.id`;
const fields = sql`p.slug as "profileId",case when a.id is not null then 'anime' else 'manga' end as kind,coalesce(a.slug,m.slug) as "mediaId",e.status,(f.entry_id is not null) as favorite`;
const entryFilter = (profile: string, kind: MediaKind, id: string) =>
  sql`p.slug=${profile} and ${kind === 'anime' ? sql`a.slug=${id}` : sql`m.slug=${id}`}`;
@Injectable()
export class PostgresLibraryRepository extends LibraryRepository {
  constructor(private readonly database: Database) {
    super();
  }
  async list(profileId: string, query: LibraryQuery, favorites: boolean) {
    const { page, limit, kind, status } = query;
    const result = await this.database.db.execute<
      LibraryRow & { total: number }
    >(sql`
   with matches as (select ${fields},e.created_at,e.id ${joins} where p.slug=${profileId}
   and (${status ?? null}::text is null or e.status=${status ?? null})
   and (${kind ?? null}::text is null or (${kind ?? null}='anime' and e.anime_id is not null) or (${kind ?? null}='manga' and e.manga_id is not null))
   and (not ${favorites} or f.entry_id is not null)),
   page_rows as (select * from matches order by created_at,id limit ${limit} offset ${(page - 1) * limit})
   select r."profileId",r.kind,r."mediaId",r.status,r.favorite,c.total
   from (select count(*)::int as total from matches) c left join page_rows r on true order by r.created_at,r.id
  `);
    const total = result.rows[0]?.total ?? 0;
    const items = result.rows
      .filter((row) => row.mediaId !== null)
      .map(({ profileId, kind, mediaId, status, favorite }) => ({
        profileId,
        kind,
        mediaId,
        status,
        favorite,
      }));
    return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
  }
  async add(entry: LibraryEntry) {
    const { profileId, kind, mediaId, status } = entry;
    const column = sql.identifier(kind === 'anime' ? 'anime_id' : 'manga_id');
    return this.database.db.transaction(async (tx) => {
      await tx.execute(
        sql`insert into library_entries(profile_id,${column},status) select p.id,w.id,${status} from user_profiles p cross join ${sql.identifier(kind)} w where p.slug=${profileId} and w.slug=${mediaId} on conflict(profile_id,${column}) do nothing`,
      );
      const { rows } = await tx.execute<LibraryRow>(
        sql`select ${fields} ${joins} where ${entryFilter(profileId, kind, mediaId)} for update of e`,
      );
      if (!rows[0])
        throw new ApiFailure(
          404,
          'NOT_FOUND',
          'Perfil u obra no disponible en PostgreSQL',
        );
      return rows[0];
    });
  }
  async update(
    profileId: string,
    kind: MediaKind,
    id: string,
    patch: LibraryUpdate,
  ) {
    return this.database.db.transaction(async (tx) => {
      const { rows } = await tx.execute<{ id: string }>(
        sql`select e.id ${joins} where ${entryFilter(profileId, kind, id)} for update of e`,
      );
      const key = rows[0]?.id;
      if (!key) return undefined;
      if (patch.status !== undefined)
        await tx.execute(
          sql`update library_entries set status=${patch.status} where id=${key}`,
        );
      if (patch.favorite === true)
        await tx.execute(
          sql`insert into user_favorites(entry_id) values(${key}) on conflict do nothing`,
        );
      if (patch.favorite === false)
        await tx.execute(sql`delete from user_favorites where entry_id=${key}`);
      return (
        await tx.execute<LibraryRow>(
          sql`select ${fields} ${joins} where e.id=${key}`,
        )
      ).rows[0];
    });
  }
  async remove(profileId: string, kind: MediaKind, id: string) {
    const result = await this.database.db.execute(
      sql`delete from library_entries where id in (select e.id ${joins} where ${entryFilter(profileId, kind, id)})`,
    );
    return Boolean(result.rowCount);
  }
}
