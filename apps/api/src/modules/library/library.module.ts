import type { IncomingMessage } from 'node:http';
import { IdentityModule } from '../identity/identity.module.js';
import { IdentityService } from '../identity/identity.service.js';
import { Database } from '../../database.module.js';
import { PostgresLibraryRepository } from './postgres-library.js';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  Patch,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  parseId,
  parseLibraryQuery,
  parseLibraryUpdate,
  parseMediaKind,
} from '@struchkai/contracts';
import { CatalogModule } from '../catalog/catalog.module.js';
import {
  LibraryRepository,
  MemoryLibraryRepository,
} from './library.repository.js';
import { LibraryService } from './library.service.js';
@Controller('v1/library/:profileId')
class LibraryController {
  constructor(
    private readonly library: LibraryService,
    private readonly identity: IdentityService,
  ) {}
  @Get() async list(
    @Req() request: IncomingMessage,
    @Param('profileId') profileId: unknown,
    @Query() query: unknown,
  ) {
    await this.identity.authorizeProfile(request, parseId(profileId));
    return this.library.list(parseId(profileId), parseLibraryQuery(query));
  }
  @Get('favorites') async favorites(
    @Req() request: IncomingMessage,
    @Param('profileId') profileId: unknown,
    @Query() query: unknown,
  ) {
    await this.identity.authorizeProfile(request, parseId(profileId));
    return this.library.list(
      parseId(profileId),
      parseLibraryQuery(query),
      true,
    );
  }
  @Put(':kind/:id') async add(
    @Req() request: IncomingMessage,
    @Param('profileId') profileId: unknown,
    @Param('kind') kind: unknown,
    @Param('id') id: unknown,
  ) {
    await this.identity.authorizeProfile(request, parseId(profileId));
    return this.library.add(
      parseId(profileId),
      parseMediaKind(kind),
      parseId(id),
    );
  }
  @Patch(':kind/:id') async update(
    @Req() request: IncomingMessage,
    @Param('profileId') profileId: unknown,
    @Param('kind') kind: unknown,
    @Param('id') id: unknown,
    @Body() body: unknown,
  ) {
    await this.identity.authorizeProfile(request, parseId(profileId));
    return this.library.update(
      parseId(profileId),
      parseMediaKind(kind),
      parseId(id),
      parseLibraryUpdate(body),
    );
  }
  @Delete(':kind/:id') @HttpCode(204) async remove(
    @Req() request: IncomingMessage,
    @Param('profileId') profileId: unknown,
    @Param('kind') kind: unknown,
    @Param('id') id: unknown,
  ) {
    await this.identity.authorizeProfile(request, parseId(profileId));
    return this.library.remove(
      parseId(profileId),
      parseMediaKind(kind),
      parseId(id),
    );
  }
}
@Module({
  imports: [CatalogModule, IdentityModule],
  controllers: [LibraryController],
  providers: [
    LibraryService,
    {
      provide: LibraryRepository,
      inject: [Database],
      useFactory: (database: Database) =>
        database.connection
          ? new PostgresLibraryRepository(database)
          : new MemoryLibraryRepository(),
    },
  ],
})
export class LibraryModule {}
