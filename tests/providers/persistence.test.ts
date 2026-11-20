import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createDatabase, requireLocalAdminUrl } from '@struchkai/database';
import {
  createRemoteProvider,
  normalizeMangaDex,
  normalizeJikan,
} from '@struchkai/providers';
import type { ExternalRelease, ExternalQuery } from '@struchkai/contracts';
import { ExternalRepository } from '../../apps/api/src/modules/providers/external.repository.ts';

test(
  'PostgreSQL conserva metadatos, asociaciones verificadas, publicaciones y caché tras reconectar',
  { skip: !process.env.STRUCHKAI_TEST_DATABASE_URL, timeout: 15000 },
  async () => {
    const ownerUrl = requireLocalAdminUrl('STRUCHKAI_TEST_DATABASE_URL');
    execFileSync(
      process.execPath,
      ['packages/database/dist/migrate.js', 'apply'],
      {
        env: { ...process.env, STRUCHKAI_MIGRATION_URL: ownerUrl },
        stdio: 'pipe',
      },
    );
    const owner = createDatabase(ownerUrl);
    let app: ReturnType<typeof createDatabase> | undefined;
    try {
      await owner.pool.query(
        await readFile(
          new URL('../../infra/postgres-provider-grants.sql', import.meta.url),
          'utf8',
        ),
      );
      app = createDatabase(process.env.STRUCHKAI_TEST_APP_URL ?? ownerUrl);
      const repository = new ExternalRepository(app);
      await repository.provider(createRemoteProvider('mangadex'));
      const externalId = randomUUID();
      const title = normalizeMangaDex({
        id: externalId,
        attributes: {
          title: { en: 'Persistencia de prueba' },
          status: 'ongoing',
          availableTranslatedLanguages: ['en'],
          tags: [],
        },
      });
      const mal = String(parseInt(externalId.slice(0, 8), 16));
      title.externalIds.mal = mal;
      const saved = await repository.save({ ...title, complete: true });
      await repository.provider(createRemoteProvider('jikan'));
      const related = await repository.save(
        normalizeJikan(
          {
            mal_id: Number(mal),
            title: 'Título alternativo de la misma obra',
            status: 'Publishing',
          },
          'manga',
        ),
      );
      assert.equal(related.id, saved.id);
      assert.equal(related.duplicateOf, saved.id);
      // A link learned later must not move an existing library identity.
      const second = normalizeMangaDex({
        id: randomUUID(),
        attributes: {
          title: { en: 'Asociación conocida más tarde' },
          status: 'ongoing',
        },
      });
      const before = await repository.save(second);
      const secondMal = String(Number(mal) + 1);
      const independentlyStored = await repository.save(
        normalizeJikan(
          { mal_id: Number(secondMal), title: 'Referencia independiente' },
          'manga',
        ),
      );
      second.externalIds.mal = secondMal;
      const after = await repository.save(second);
      assert.equal(after.id, before.id);
      assert.equal(after.duplicateOf, independentlyStored.id);
      assert.equal(
        (await repository.cached('mangadex', 'manga', second.source.externalId))
          ?.id,
        before.id,
      );
      assert.equal(saved.year, null);
      const release: ExternalRelease = {
        id: 'mangadex-chapter-' + randomUUID(),
        mediaId: saved.id,
        number: null,
        volume: null,
        title: null,
        language: 'en',
        publishedAt: '2026-01-01T00:00:00.000Z',
        updatedAt: null,
        availability: 'published',
        playback: 'unavailable',
        externalUrl: null,
        credits: ['Grupo de prueba'],
        source: {
          provider: 'mangadex',
          externalId: randomUUID(),
          url: 'https://mangadex.org',
          fetchedAt: new Date().toISOString(),
        },
      };
      await repository.releases(saved, [release]);
      await repository.releases(saved, [release]);
      const query: ExternalQuery = {
        kind: 'manga',
        page: 1,
        limit: 5,
        sort: 'relevance',
        language: 'en',
      };
      await repository.cacheReleases(saved, query, {
        items: [release],
        page: 1,
        limit: 5,
        total: 1,
        hasNextPage: false,
        warnings: [],
      });
      await app.pool.end();
      app = createDatabase(process.env.STRUCHKAI_TEST_APP_URL ?? ownerUrl);
      const reopened = new ExternalRepository(app);
      const cached = await reopened.cached('mangadex', 'manga', externalId);
      assert.equal(cached?.id, saved.id);
      assert.equal(cached?.complete, true);
      assert.equal(cached?.cache?.stale, false);
      const page = await reopened.cachedReleases(
        'mangadex',
        'manga',
        externalId,
        query,
      );
      assert.equal(page?.page.items[0].number, null);
      assert.equal(page?.page.items[0].playback, 'unavailable');
      const count = await owner.pool.query(
        'SELECT count(*)::int n FROM provider_releases WHERE external_key=$1',
        [release.source.externalId],
      );
      assert.equal(count.rows[0].n, 1);
    } finally {
      await app?.pool.end();
      await owner.pool.end();
    }
  },
);
