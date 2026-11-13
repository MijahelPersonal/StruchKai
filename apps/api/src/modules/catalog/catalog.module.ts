import { Database } from '../../database.module.js';
import { PostgresCatalogRepository } from './postgres-catalog.js';
import { Module } from '@nestjs/common';
import {
  CatalogRepository,
  MemoryCatalogRepository,
} from './catalog.repository.js';
import { CatalogService } from './catalog.service.js';
@Module({
  providers: [
    CatalogService,
    {
      provide: CatalogRepository,
      inject: [Database],
      useFactory: (database: Database) =>
        database.connection
          ? new PostgresCatalogRepository(database)
          : new MemoryCatalogRepository(),
    },
  ],
  exports: [CatalogService],
})
export class CatalogModule {}
