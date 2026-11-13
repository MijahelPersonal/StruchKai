import { Controller, Get, Module, Param, Query } from '@nestjs/common';
import { parseCatalogQuery, parseId } from '@struchkai/contracts';
import { CatalogModule } from '../catalog/catalog.module.js';
import { CatalogService } from '../catalog/catalog.service.js';
@Controller('v1/anime')
class AnimeController {
  constructor(private readonly catalog: CatalogService) {}
  @Get() list(@Query() query: unknown) {
    return this.catalog.list('anime', parseCatalogQuery(query));
  }
  @Get(':id') detail(@Param('id') id: unknown) {
    return this.catalog.detail('anime', parseId(id));
  }
}
@Module({ imports: [CatalogModule], controllers: [AnimeController] })
export class AnimeModule {}
