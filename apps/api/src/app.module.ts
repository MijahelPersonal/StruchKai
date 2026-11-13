import { DatabaseModule, Database } from './database.module.js';
import { ApiFailure } from './http.js';
import { AnimeModule } from './modules/anime/anime.module.js';
import { MangaModule } from './modules/manga/manga.module.js';
import { OpenApiController } from './openapi.controller.js';
import { Controller, Get, Module } from '@nestjs/common';
import { IdentityModule } from './modules/identity/identity.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { ProvidersModule } from './modules/providers/providers.module.js';
import { LibraryModule } from './modules/library/library.module.js';
import { AutomationModule } from './modules/automation/automation.module.js';
import { AdministrationModule } from './modules/administration/administration.module.js';

@Controller()
class HealthController {
  constructor(private readonly database: Database) {}
  @Get('health/database')
  async databaseHealth() {
    if (!this.database.connection)
      throw new ApiFailure(503, 'INTERNAL_ERROR', 'PostgreSQL no configurado');
    try {
      await this.database.check();
    } catch {
      throw new ApiFailure(503, 'INTERNAL_ERROR', 'PostgreSQL no disponible');
    }
    return { status: 'ok' };
  }
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}

@Module({
  imports: [
    DatabaseModule,
    IdentityModule,
    UsersModule,
    CatalogModule,
    AnimeModule,
    MangaModule,
    ProvidersModule,
    LibraryModule,
    AutomationModule,
    AdministrationModule,
  ],
  controllers: [HealthController, OpenApiController],
})
export class AppModule {}
