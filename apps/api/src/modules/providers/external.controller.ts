import { Controller, Get, Post, Param, Query, Res } from '@nestjs/common';
import { ExternalService } from './external.service.js';

@Controller('v1/external')
export class ExternalController {
  constructor(private readonly service: ExternalService) {}
  @Get('providers') providers() {
    return this.service.listProviders();
  }
  @Get('providers/:provider/availability') availability(
    @Param('provider') provider: unknown,
  ) {
    return this.service.availability(provider);
  }
  @Get(':provider/:kind/search') search(
    @Param('provider') provider: unknown,
    @Param('kind') kind: unknown,
    @Query() query: unknown,
  ) {
    return this.service.search(provider, kind, query);
  }
  @Get(':provider/:kind/genres') genres(
    @Param('provider') provider: unknown,
    @Param('kind') kind: unknown,
  ) {
    return this.service.genres(provider, kind);
  }
  @Get(':provider/:kind/:id') detail(
    @Param('provider') provider: unknown,
    @Param('kind') kind: unknown,
    @Param('id') id: unknown,
  ) {
    return this.service.detail(provider, kind, id);
  }
  @Post(':provider/:kind/:id/refresh') refresh(
    @Param('provider') provider: unknown,
    @Param('kind') kind: unknown,
    @Param('id') id: unknown,
  ) {
    return this.service.detail(provider, kind, id, true);
  }
  @Get(':provider/:kind/:id/releases') releases(
    @Param('provider') provider: unknown,
    @Param('kind') kind: unknown,
    @Param('id') id: unknown,
    @Query() query: unknown,
  ) {
    return this.service.releases(provider, kind, id, query);
  }
  @Post(':provider/:kind/:id/releases/refresh') refreshReleases(
    @Param('provider') provider: unknown,
    @Param('kind') kind: unknown,
    @Param('id') id: unknown,
    @Query() query: unknown,
  ) {
    return this.service.releases(provider, kind, id, query, true);
  }
  @Get(':provider/:kind/:id/cover') async cover(
    @Param('provider') provider: unknown,
    @Param('kind') kind: unknown,
    @Param('id') id: unknown,
    @Res()
    response: {
      setHeader(name: string, value: string): void;
      end(data: Buffer): void;
    },
  ) {
    const result = await this.service.cover(provider, kind, id);
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Cache-Control', 'private, max-age=300');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(result.bytes);
  }
  @Get(':provider/playback/:episodeId') playback(
    @Param('provider') provider: unknown,
    @Param('episodeId') id: unknown,
  ) {
    return this.service.playback(provider, id);
  }
}
