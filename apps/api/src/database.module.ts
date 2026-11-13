import {
  Global,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { createDatabase, sql } from '@struchkai/database';
@Injectable()
export class Database implements OnApplicationShutdown {
  readonly connection = process.env.STRUCHKAI_DATABASE_URL
    ? createDatabase(process.env.STRUCHKAI_DATABASE_URL)
    : undefined;
  constructor() {
    if (!this.connection && process.env.STRUCHKAI_STORAGE !== 'memory')
      throw new Error('Configura STRUCHKAI_DATABASE_URL');
    if (!this.connection && process.env.NODE_ENV === 'production')
      throw new Error('Almacenamiento de prueba bloqueado');
  }
  get db() {
    if (!this.connection) throw new Error('PostgreSQL no configurado');
    return this.connection.db;
  }
  async check() {
    if (this.connection)
      await this.db.execute(sql`select 1 from library_entries limit 0`);
  }
  async onApplicationShutdown() {
    await this.connection?.pool.end();
  }
}
@Global()
@Module({ providers: [Database], exports: [Database] })
export class DatabaseModule {}
