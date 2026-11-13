import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  Patch,
  Req,
} from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { ApiFailure } from '../../http.js';
import { IdentityService } from './identity.service.js';
@Controller('v1')
class IdentityController {
  constructor(private readonly identity: IdentityService) {}
  @Get('account') async account(@Req() req: IncomingMessage) {
    const actor = await this.identity.authenticate(req);
    return this.identity.profile(actor.userId);
  }
  @Patch('account') async update(
    @Req() req: IncomingMessage,
    @Body() value: unknown,
  ) {
    const actor = await this.identity.authenticate(req);
    const bad = () =>
      new ApiFailure(400, 'INVALID_PARAMETERS', 'Perfil inválido');
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw bad();
    const { displayName, avatarUrl, locale } = value as Record<string, unknown>;
    if (
      typeof displayName !== 'string' ||
      !displayName.trim() ||
      displayName.length > 80 ||
      typeof locale !== 'string' ||
      !['es', 'en'].includes(locale) ||
      !(
        avatarUrl === null ||
        (typeof avatarUrl === 'string' && avatarUrl.length <= 512)
      )
    )
      throw bad();
    if (avatarUrl) {
      const url = URL.parse(avatarUrl);
      if (!url || url.protocol !== 'https:' || url.username || url.password)
        throw bad();
    }
    return this.identity.updateProfile(
      actor.userId,
      displayName.trim(),
      avatarUrl,
      locale,
    );
  }
  @Get('account/sessions') async sessions(@Req() req: IncomingMessage) {
    return this.identity.sessions(await this.identity.authenticate(req));
  }
  @Delete('account/sessions/current') @HttpCode(204) async logout(
    @Req() req: IncomingMessage,
  ) {
    const actor = await this.identity.authenticate(req);
    await this.identity.revoke(actor, actor.sessionId);
  }
  @Delete('account/sessions/:id') @HttpCode(204) async revoke(
    @Req() req: IncomingMessage,
    @Param('id') id: string,
  ) {
    const actor = await this.identity.authenticate(req);
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))
      throw new ApiFailure(400, 'INVALID_PARAMETERS', 'Sesión inválida');
    await this.identity.revoke(actor, id);
  }
  @Get('admin/access') async admin(@Req() req: IncomingMessage) {
    if (!(await this.identity.authenticate(req)).admin)
      throw new ApiFailure(
        403,
        'OPERATION_NOT_ALLOWED',
        'Operación no permitida',
      );
    return { role: 'admin' };
  }
}
@Module({
  controllers: [IdentityController],
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
