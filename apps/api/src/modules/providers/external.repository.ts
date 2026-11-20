import { createDatabase, sql } from '@struchkai/database';
import { workIdentity } from '@struchkai/domain';
import type {
  ExternalTitle,
  ExternalRelease,
  ExternalQuery,
  ExternalPage,
  MediaKind,
} from '@struchkai/contracts';
import type { ProviderAdapter } from '@struchkai/providers';

type Connection = ReturnType<typeof createDatabase>;
type ReleaseCache = { page: ExternalPage<ExternalRelease>; expiresAt: string };
export class ExternalRepository {
  private readonly memory = new Map<string, ExternalTitle>();
  private readonly releaseMemory = new Map<string, ReleaseCache>();
  private readonly connection?: Connection;
  constructor(connection?: Connection) {
    this.connection = connection;
  }
  async provider(adapter: ProviderAdapter, error: string | null = null) {
    if (!this.connection) return;
    const descriptor = { ...adapter.descriptor, settings: adapter.settings };
    await this.connection.db.transaction(async (tx) => {
      const result = await tx.execute<{ id: string }>(
        sql`INSERT INTO providers(slug,name,version,enabled,descriptor,checked_at,last_error) VALUES(${adapter.descriptor.id},${adapter.descriptor.name},${adapter.descriptor.version},${adapter.settings?.enabled ?? false},${JSON.stringify(descriptor)}::jsonb,now(),${error}) ON CONFLICT(slug) DO UPDATE SET name=excluded.name,version=excluded.version,enabled=excluded.enabled,descriptor=excluded.descriptor,checked_at=now(),last_error=excluded.last_error RETURNING id`,
      );
      const id = result.rows[0].id;
      for (const capability of adapter.descriptor.capabilities)
        await tx.execute(
          sql`INSERT INTO provider_policies(provider_id,capability,revision,policy) VALUES(${id}::uuid,${capability},1,${JSON.stringify(adapter.descriptor.usagePolicy)}::jsonb) ON CONFLICT(provider_id,capability,revision) DO UPDATE SET policy=excluded.policy`,
        );
    });
  }
  async cached(
    provider: string,
    kind: MediaKind,
    id: string,
  ): Promise<ExternalTitle | null> {
    if (!this.connection) {
      const value = structuredClone(
        this.memory.get(`${provider}:${kind}:${id}`) ?? null,
      );
      if (value?.cache)
        value.cache.stale = Date.parse(value.cache.expiresAt) <= Date.now();
      return value;
    }
    const result = await this.connection.db.execute<{
      metadata: ExternalTitle;
      expires_at: string;
    }>(
      sql`SELECT m.metadata,m.expires_at FROM provider_mappings m JOIN providers p ON p.id=m.provider_id WHERE p.slug=${provider} AND m.namespace=${kind} AND m.external_id=${id}`,
    );
    const row = result.rows[0];
    if (!row || !row.metadata?.source) return null;
    return {
      ...row.metadata,
      cache: {
        stale: new Date(row.expires_at).getTime() <= Date.now(),
        expiresAt: new Date(row.expires_at).toISOString(),
      },
    };
  }
  async save(title: ExternalTitle, ttl = 300): Promise<ExternalTitle> {
    const key = `${title.source.provider}:${title.kind}:${title.source.externalId}`;
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
    if (!this.connection) {
      const value = { ...title, cache: { stale: false, expiresAt } };
      this.memory.set(key, value);
      return structuredClone(value);
    }
    const work = sql.identifier(title.kind),
      fk = sql.identifier(title.kind + '_id'),
      bridge = sql.identifier(title.kind + '_genres');
    return this.connection.db.transaction(async (tx) => {
      const identity = workIdentity(title);
      // Serializes the verified external identity, including cross-provider imports.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${identity},0))`,
      );
      const mapped = await tx.execute<{ id: string; slug: string }>(
        sql`SELECT w.id,w.slug FROM provider_mappings m JOIN ${work} w ON w.id=m.${fk} WHERE m.identity_key=${identity} LIMIT 1`,
      );
      let local = mapped.rows[0];
      if (!local) {
        const result = await tx.execute<{ id: string; slug: string }>(
          sql`INSERT INTO ${work}(slug,title,search_title,synopsis,year) VALUES(${title.id},${title.title},${title.title.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()},${title.synopsis ?? ''},${title.year}) ON CONFLICT(slug) DO UPDATE SET title=excluded.title,search_title=excluded.search_title,synopsis=excluded.synopsis,year=excluded.year RETURNING id,slug`,
        );
        local = result.rows[0];
      }
      const normalized: ExternalTitle = {
        ...title,
        id: local.slug,
        duplicateOf: local.slug === title.id ? undefined : local.slug,
        cache: { stale: false, expiresAt },
      };
      if (title.id === local.slug)
        await tx.execute(
          sql`UPDATE ${work} SET title=${title.title},search_title=${title.title.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()},synopsis=${title.synopsis ?? ''},year=${title.year} WHERE id=${local.id}::uuid`,
        );
      await tx.execute(
        sql`INSERT INTO provider_mappings(provider_id,namespace,external_id,${fk},identity_key,metadata,fetched_at,expires_at) SELECT id,${title.kind},${title.source.externalId},${local.id}::uuid,${identity},${JSON.stringify(normalized)}::jsonb,now(),${expiresAt}::timestamptz FROM providers WHERE slug=${title.source.provider} ON CONFLICT(provider_id,namespace,external_id) DO UPDATE SET metadata=excluded.metadata,identity_key=excluded.identity_key,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at,last_error=null`,
      );
      for (const genre of title.genres) {
        const slug = `${title.source.provider}-${genre.id}`
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 80);
        if (!slug) continue;
        const result = await tx.execute<{ id: string }>(
          sql`INSERT INTO genres(slug,name) VALUES(${slug},${genre.name}) ON CONFLICT(slug) DO UPDATE SET name=excluded.name RETURNING id`,
        );
        await tx.execute(
          sql`INSERT INTO ${bridge}(${fk},genre_id) VALUES(${local.id}::uuid,${result.rows[0].id}::uuid) ON CONFLICT DO NOTHING`,
        );
      }
      return normalized;
    });
  }
  async releases(title: ExternalTitle, items: ExternalRelease[]) {
    if (!this.connection) return;
    const kind = title.kind,
      work = sql.identifier(kind),
      fk = sql.identifier(kind + '_id'),
      delivery = sql.identifier(
        kind === 'anime' ? 'anime_episodes' : 'manga_chapters',
      ),
      releaseFk = sql.identifier(
        kind === 'anime' ? 'episode_id' : 'chapter_id',
      );
    await this.connection.db.transaction(async (tx) => {
      const result = await tx.execute<{ mapping: string; parent: string }>(
        sql`SELECT m.id AS mapping,w.id AS parent FROM provider_mappings m JOIN providers p ON p.id=m.provider_id JOIN ${work} w ON w.id=m.${fk} WHERE p.slug=${title.source.provider} AND m.namespace=${kind} AND m.external_id=${title.source.externalId}`,
      );
      const row = result.rows[0];
      if (!row) return;
      for (const item of items) {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${row.parent + ':' + (item.number ?? item.id)},0))`,
        );
        const existing = await tx.execute<{ id: string }>(
          sql`SELECT id FROM ${delivery} WHERE ${fk}=${row.parent}::uuid AND (slug=${item.id} OR number=${item.number}) LIMIT 1`,
        );
        let childId = existing.rows[0]?.id;
        if (!childId) {
          const child = await tx.execute<{ id: string }>(
            sql`INSERT INTO ${delivery}(slug,${fk},number,title) VALUES(${item.id},${row.parent}::uuid,${item.number},${item.title ?? ''}) RETURNING id`,
          );
          childId = child.rows[0].id;
        }
        await tx.execute(
          sql`INSERT INTO provider_releases(mapping_id,external_key,${releaseFk},language,metadata,availability,fetched_at,expires_at) VALUES(${row.mapping}::uuid,${item.source.externalId},${childId}::uuid,${item.language ?? 'und'},${JSON.stringify({ ...item, mediaId: title.id })}::jsonb,${item.availability},now(),now()+interval '5 minutes') ON CONFLICT(mapping_id,external_key) DO UPDATE SET metadata=excluded.metadata,availability=excluded.availability,fetched_at=now(),expires_at=excluded.expires_at`,
        );
      }
    });
  }
  async failure(provider: string, kind: MediaKind, id: string, error: string) {
    if (this.connection)
      await this.connection.db.execute(
        sql`UPDATE provider_mappings m SET last_error=${error} FROM providers p WHERE p.id=m.provider_id AND p.slug=${provider} AND m.namespace=${kind} AND m.external_id=${id}`,
      );
  }
  private pageKey(query: ExternalQuery) {
    return `${query.language ?? (query.kind === 'manga' ? 'es' : 'und')}:${query.page}:${query.limit}`;
  }
  async cachedReleases(
    provider: string,
    kind: MediaKind,
    id: string,
    query: ExternalQuery,
  ): Promise<ReleaseCache | null> {
    const key = this.pageKey(query);
    if (!this.connection)
      return structuredClone(
        this.releaseMemory.get(`${provider}:${kind}:${id}:${key}`) ?? null,
      );
    const result = await this.connection.db.execute<{
      entry: ReleaseCache | null;
    }>(
      sql`SELECT m.release_pages->${key} AS entry FROM provider_mappings m JOIN providers p ON p.id=m.provider_id WHERE p.slug=${provider} AND m.namespace=${kind} AND m.external_id=${id}`,
    );
    return result.rows[0]?.entry ?? null;
  }
  async cacheReleases(
    title: ExternalTitle,
    query: ExternalQuery,
    page: ExternalPage<ExternalRelease>,
  ) {
    const key = this.pageKey(query),
      entry = { page, expiresAt: new Date(Date.now() + 300000).toISOString() };
    if (!this.connection) {
      if (this.releaseMemory.size >= 100)
        this.releaseMemory.delete(this.releaseMemory.keys().next().value!);
      this.releaseMemory.set(
        `${title.source.provider}:${title.kind}:${title.source.externalId}:${key}`,
        entry,
      );
      return;
    }
    await this.connection.db.transaction(async (tx) => {
      const result = await tx.execute<{
        id: string;
        release_pages: Record<string, ReleaseCache>;
      }>(
        sql`SELECT m.id,m.release_pages FROM provider_mappings m JOIN providers p ON p.id=m.provider_id WHERE p.slug=${title.source.provider} AND m.namespace=${title.kind} AND m.external_id=${title.source.externalId} FOR UPDATE OF m`,
      );
      const row = result.rows[0];
      if (!row) return;
      const pages = row.release_pages;
      if (Object.keys(pages).length >= 10) delete pages[Object.keys(pages)[0]];
      pages[key] = entry;
      await tx.execute(
        sql`UPDATE provider_mappings SET release_pages=${JSON.stringify(pages)}::jsonb WHERE id=${row.id}::uuid`,
      );
    });
  }
}
