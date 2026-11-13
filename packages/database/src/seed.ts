import {
  sql,
  createDatabase,
  requireLocalAdminUrl,
  animeFixtures,
  mangaFixtures,
} from './index.js';
try {
  const { db, pool } = createDatabase(
    requireLocalAdminUrl('STRUCHKAI_MIGRATION_URL'),
  );
  try {
    await db.transaction(async (tx) => {
      for (const work of [...animeFixtures, ...mangaFixtures]) {
        const table = sql.identifier(work.kind),
          fk = sql.identifier(work.kind + '_id');
        const search = work.title
          .normalize('NFD')
          .replace(/\p{M}/gu, '')
          .toLowerCase();
        await tx.execute(
          sql`insert into ${table}(slug,title,search_title,synopsis,year) values(${work.id},${work.title},${search},${work.synopsis},${work.year}) on conflict(slug) do nothing`,
        );
        for (const genre of work.genres) {
          await tx.execute(
            sql`insert into genres(slug,name) values(${genre.id},${genre.name}) on conflict do nothing`,
          );
          await tx.execute(
            sql`insert into ${sql.identifier(work.kind + '_genres')}(${fk},genre_id) select w.id,g.id from ${table} w cross join genres g where w.slug=${work.id} and g.slug=${genre.id} on conflict do nothing`,
          );
        }
        for (const item of work.kind === 'anime'
          ? work.episodes
          : work.chapters)
          await tx.execute(
            sql`insert into ${sql.identifier(work.kind === 'anime' ? 'anime_episodes' : 'manga_chapters')}(slug,${fk},number,title) select ${item.id},id,${item.number},${item.title} from ${table} where slug=${work.id} on conflict(slug) do nothing`,
          );
      }
      for (const profile of ['demo-alex', 'demo-rio']) {
        await tx.execute(
          sql`insert into users(issuer,subject) values('struchkai-demo',${profile}) on conflict do nothing`,
        );
        await tx.execute(
          sql`insert into user_profiles(user_id,slug,display_name) select id,${profile},${profile} from users where issuer='struchkai-demo' and subject=${profile} on conflict do nothing`,
        );
      }
      await tx.execute(
        sql`with added as (insert into library_entries(profile_id,manga_id,status) select p.id,m.id,'in_progress' from user_profiles p cross join manga m where p.slug='demo-rio' and m.slug='jardin-de-cometas' on conflict do nothing returning id) insert into user_favorites(entry_id) select id from added`,
      );
    });
    console.info('Datos ficticios preparados');
  } finally {
    await pool.end();
  }
} catch {
  console.error(
    'No se pudo cargar el seed. Revisa el destino, las migraciones y los permisos.',
  );
  process.exitCode = 1;
}
