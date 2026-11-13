import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { createDatabase, requireLocalAdminUrl } from './index.js';
const migrationsFolder = fileURLToPath(
  new URL('../migrations', import.meta.url),
);
const options = { migrationsFolder, migrationsSchema: 'struchkai_migrations' };
const command = process.argv[2];
try {
  const migrations = readMigrationFiles(options);
  if (
    !migrations.length ||
    new Set(migrations.map((item) => item.folderMillis)).size !==
      migrations.length
  )
    throw new Error('Diario inválido');
  if (command === 'check')
    console.info('Migraciones SQL verificadas: ' + migrations.length);
  else if (command === 'apply') {
    const { db, pool } = createDatabase(
      requireLocalAdminUrl('STRUCHKAI_MIGRATION_URL'),
    );
    try {
      const lock = await pool.connect();
      try {
        await lock.query('select pg_advisory_lock(946239151)');
        await lock.query('create schema if not exists struchkai_migrations');
        await lock.query(
          'create table if not exists struchkai_migrations.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)',
        );
        const applied = await lock.query<{ hash: string; created_at: string }>(
          'select hash,created_at from struchkai_migrations.__drizzle_migrations order by created_at',
        );
        if (
          applied.rows.some(
            (row, index) =>
              row.hash !== migrations[index]?.hash ||
              Number(row.created_at) !== migrations[index]?.folderMillis,
          )
        )
          throw new Error('Historial de migraciones incompatible');
        await migrate(db, options);
        console.info('Migraciones de StruchKai aplicadas');
      } finally {
        lock.release(true);
      }
    } finally {
      await pool.end();
    }
  } else throw new Error('Comando de migración desconocido');
} catch (error) {
  console.error(
    'Falló la comprobación o aplicación de migraciones',
    error instanceof Error &&
      ['Diario inválido', 'Historial de migraciones incompatible'].includes(
        error.message,
      )
      ? error.message
      : 'Revisa configuración y permisos PostgreSQL',
  );
  process.exitCode = 1;
}
