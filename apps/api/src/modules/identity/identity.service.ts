import { Injectable } from '@nestjs/common';
import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose';
import { createHash } from 'node:crypto';
import { Database } from '../../database.module.js';
import { ApiFailure } from '../../http.js';
import { sql } from '@struchkai/database';
import type { IncomingMessage } from 'node:http';
export const unauthenticated = () =>
  new ApiFailure(401, 'OPERATION_NOT_ALLOWED', 'Inicia sesión de nuevo');
const denied = () =>
  new ApiFailure(403, 'OPERATION_NOT_ALLOWED', 'Operación no permitida');
export function demoEnabled() {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.STRUCHKAI_DEMO_PROFILES === 'true'
  );
}
export interface Identity {
  userId: string;
  sessionId: string;
  admin: boolean;
}
type Account = {
  id: string;
  email: string;
  createdAt: string;
  profileId: string;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  preferences: unknown;
};
@Injectable()
export class IdentityService {
  private readonly issuer = process.env.STRUCHKAI_OIDC_ISSUER;
  private readonly audience =
    process.env.STRUCHKAI_OIDC_AUDIENCE ?? 'struchkai-api';
  private readonly client =
    process.env.STRUCHKAI_OIDC_CLIENT_ID ?? 'struchkai-desktop';
  private readonly jwks?: ReturnType<typeof createRemoteJWKSet>;
  constructor(private readonly database: Database) {
    if (!this.issuer) {
      if (process.env.NODE_ENV === 'production')
        throw new Error('Configura STRUCHKAI_OIDC_ISSUER');
      return;
    }
    const url = new URL(this.issuer);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.href.endsWith('/') ||
      (url.protocol !== 'https:' &&
        !(
          process.env.NODE_ENV !== 'production' &&
          local &&
          url.protocol === 'http:'
        ))
    )
      throw new Error('Emisor OIDC inválido');
    this.jwks = createRemoteJWKSet(
      new URL(this.issuer + '/protocol/openid-connect/certs'),
      {
        timeoutDuration: 3000,
        [customFetch]: async (url, options) => {
          const response = await fetch(url, options).catch(() => {
            throw new ApiFailure(
              503,
              'INTERNAL_ERROR',
              'Identidad temporalmente no disponible',
            );
          });
          if (!response.ok)
            throw new ApiFailure(
              503,
              'INTERNAL_ERROR',
              'Identidad temporalmente no disponible',
            );
          return response;
        },
      },
    );
  }
  async authenticate(req: IncomingMessage): Promise<Identity> {
    const header = req.headers.authorization;
    if (
      !header?.startsWith('Bearer ') ||
      header.length > 16384 ||
      !this.issuer ||
      !this.jwks ||
      !this.database.connection
    )
      throw unauthenticated();
    const payload = await jwtVerify(header.slice(7), this.jwks, {
      issuer: this.issuer,
      audience: this.audience,
      algorithms: ['RS256'],
      requiredClaims: ['sub', 'exp', 'iat', 'sid'],
    })
      .then((result) => result.payload)
      .catch((error: unknown) => {
        if (error instanceof ApiFailure) throw error;
        throw unauthenticated();
      });
    const { sub, sid, email } = payload;
    if (
      !sub ||
      typeof sid !== 'string' ||
      !sid ||
      payload.typ !== 'Bearer' ||
      payload.azp !== this.client
    )
      throw unauthenticated();
    if (
      payload.email_verified !== true ||
      typeof email !== 'string' ||
      !email ||
      email.length > 254
    )
      throw new ApiFailure(
        403,
        'OPERATION_NOT_ALLOWED',
        'Verifica tu correo en el proveedor de identidad',
      );
    const sessionRef = createHash('sha256')
      .update(JSON.stringify([this.issuer, sub, sid]))
      .digest('hex');
    const identity = await this.database.db.transaction(async (tx) => {
      const {
        rows: [user],
      } = await tx.execute<{ id: string }>(
        sql`insert into users(issuer,subject,email,email_verified_at) values(${this.issuer},${sub},${email},now()) on conflict(issuer,subject) do update set email=excluded.email,email_verified_at=case when users.email is distinct from excluded.email then now() else coalesce(users.email_verified_at,now()) end returning id`,
      );
      await tx.execute(
        sql`insert into user_profiles(user_id,slug,display_name) values(${user.id},${'profile-' + user.id},'Mi perfil') on conflict(slug) do nothing`,
      );
      const inserted = await tx.execute<{ id: string }>(
        sql`insert into user_sessions(user_id,session_ref,expires_at) values(${user.id},${sessionRef},now()+interval '12 hours') on conflict(session_ref) do nothing returning id`,
      );
      const {
        rows: [session],
      } = await tx.execute<{ id: string; active: boolean }>(
        sql`select id,revoked_at is null and expires_at>now() as active from user_sessions where session_ref=${sessionRef} and user_id=${user.id}`,
      );
      if (!session?.active) throw unauthenticated();
      if (inserted.rowCount)
        await tx.execute(
          sql`insert into audit_logs(actor_id,action,outcome) values(${user.id},'session_started','success')`,
        );
      const {
        rows: [role],
      } = await tx.execute<{ admin: boolean }>(
        sql`select exists(select 1 from user_roles ur join roles r on r.id=ur.role_id where ur.user_id=${user.id} and r.code='admin') as admin`,
      );
      return { userId: user.id, sessionId: session.id, admin: role.admin };
    });
    return identity;
  }
  async authorizeProfile(req: IncomingMessage, slug: string) {
    if (
      !req.headers.authorization &&
      demoEnabled() &&
      ['demo-alex', 'demo-rio'].includes(slug)
    )
      return;
    if (!req.headers.authorization && demoEnabled()) throw denied();
    const { userId } = await this.authenticate(req);
    const { rows } = await this.database.db.execute(
      sql`select 1 from user_profiles where slug=${slug} and user_id=${userId}`,
    );
    if (!rows.length) throw denied();
  }
  async profile(userId: string) {
    const {
      rows: [account],
    } = await this.database.db.execute<Account>(
      sql`select u.id,u.email,u.created_at as "createdAt",p.id as "profileId",p.slug,p.display_name as "displayName",p.avatar_url as "avatarUrl",p.preferences from users u join user_profiles p on p.user_id=u.id and p.slug='profile-'||u.id::text where u.id=${userId}`,
    );
    return account;
  }
  async updateProfile(
    userId: string,
    name: string,
    avatar: string | null,
    locale: string,
  ) {
    await this.database.db.execute(
      sql`update user_profiles set display_name=${name},avatar_url=${avatar},preferences=jsonb_set(preferences,'{locale}',to_jsonb(${locale}::text)) where user_id=${userId} and slug='profile-'||user_id::text`,
    );
    return this.profile(userId);
  }
  async sessions(identity: Identity) {
    const { rows } = await this.database.db.execute(
      sql`select id,created_at as "createdAt",expires_at as "expiresAt",id=${identity.sessionId}::uuid as current from user_sessions where user_id=${identity.userId} and revoked_at is null and expires_at>now() order by created_at desc`,
    );
    return rows;
  }
  async revoke(identity: Identity, id: string) {
    await this.database.db.transaction(async (tx) => {
      const result = await tx.execute(
        sql`update user_sessions set revoked_at=now() where id=${id} and user_id=${identity.userId} and revoked_at is null`,
      );
      if (!result.rowCount)
        throw new ApiFailure(404, 'NOT_FOUND', 'Sesión no encontrada');
      await tx.execute(
        sql`insert into audit_logs(actor_id,action,outcome) values(${identity.userId},'session_revoked','success')`,
      );
    });
  }
}
