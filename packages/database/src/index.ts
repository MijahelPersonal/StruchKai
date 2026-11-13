import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
export { sql, type SQL } from 'drizzle-orm';
export function createDatabase(connectionString: string) {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
    idleTimeoutMillis: 30000,
  });
  pool.on('error', () =>
    console.error('Conexión PostgreSQL inactiva interrumpida'),
  );
  return { pool, db: drizzle(pool) };
}
export function requireLocalAdminUrl(
  key: 'STRUCHKAI_MIGRATION_URL' | 'STRUCHKAI_TEST_DATABASE_URL',
): string {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Operación de desarrollo bloqueada en producción');
  const value = process.env[key];
  if (!value) throw new Error('Falta ' + key);
  const url = new URL(value);
  const allowedName =
    key === 'STRUCHKAI_TEST_DATABASE_URL'
      ? /^\/struchkai_test(?:_[a-z0-9_]+)?$/
      : /^\/struchkai_(?:db|test)(?:_[a-z0-9_]+)?$/;
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !allowedName.test(url.pathname) ||
    url.search ||
    url.hash
  )
    throw new Error('Destino PostgreSQL de desarrollo inválido');
  return value;
}
export { animeFixtures, mangaFixtures } from './fixtures.js';
