import { app, ipcMain, safeStorage, shell, type BrowserWindow } from 'electron';
import * as oidc from 'openid-client';
import { createServer } from 'node:http';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
const redirect = 'http://127.0.0.1:43821/oidc/callback';
const clientId = 'struchkai-desktop';
type Action =
  | 'login'
  | 'register'
  | 'recover'
  | 'verify'
  | 'account'
  | 'sessions'
  | 'update'
  | 'revoke'
  | 'logout'
  | 'manage'
  | 'library'
  | 'favorite'
  | 'add';
export function registerAuth(
  window: BrowserWindow,
  rendererUrl: string,
  smoke = false,
) {
  const issuer = new URL(
    process.env.STRUCHKAI_OIDC_ISSUER ??
      'http://127.0.0.1:8080/realms/struchkai',
  );
  const api = new URL(process.env.STRUCHKAI_API_URL ?? 'http://127.0.0.1:3100');
  const local = (url: URL) =>
    ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  for (const url of [issuer, api])
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !(
        url.protocol === 'https:' ||
        (!app.isPackaged && local(url) && url.protocol === 'http:')
      )
    )
      throw new Error('Configuración de acceso inválida');
  const file = join(app.getPath('userData'), 'oidc-session.bin');
  const canStore = () =>
    safeStorage.isEncryptionAvailable() &&
    (process.platform !== 'linux' ||
      safeStorage.getSelectedStorageBackend() !== 'basic_text');
  let tokens: { access_token: string; refresh_token?: string } | undefined;
  let config: oidc.Configuration | undefined;
  let running = false;
  async function configuration() {
    return (config ??= await oidc.discovery(
      issuer,
      clientId,
      undefined,
      oidc.None(),
      issuer.protocol === 'http:'
        ? { execute: [oidc.allowInsecureRequests], timeout: 8 }
        : { timeout: 8 },
    ));
  }
  async function remember() {
    if (tokens?.refresh_token && canStore())
      await writeFile(file, safeStorage.encryptString(tokens.refresh_token), {
        mode: 0o600,
      });
  }
  async function grant(mode: 'login' | 'register' | 'recover') {
    const cfg = await configuration();
    const verifier = oidc.randomPKCECodeVerifier(),
      state = oidc.randomState(),
      nonce = oidc.randomNonce();
    const authorization = oidc.buildAuthorizationUrl(cfg, {
      redirect_uri: redirect,
      scope: 'openid profile email',
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
      state,
      nonce,
      prompt: 'login',
    });
    if (mode === 'register') {
      authorization.pathname = authorization.pathname.replace(
        /\/auth$/,
        '/registrations',
      );
      authorization.searchParams.delete('prompt');
    }
    const server = createServer();
    const abort = AbortSignal.timeout(180000);
    try {
      const callback = await new Promise<URL>((resolve, reject) => {
        server.once('error', reject);
        abort.addEventListener(
          'abort',
          () => reject(new Error('Acceso vencido')),
          { once: true },
        );
        server.on('request', (request, response) => {
          const url = new URL('http://127.0.0.1:43821' + (request.url ?? '/'));
          if (
            request.method !== 'GET' ||
            request.headers.host !== '127.0.0.1:43821' ||
            url.pathname !== '/oidc/callback' ||
            url.searchParams.get('state') !== state
          ) {
            response.writeHead(404).end();
            return;
          }
          response
            .writeHead(200, {
              'Content-Type': 'text/plain; charset=utf-8',
              'Cache-Control': 'no-store',
              Connection: 'close',
            })
            .end('Vuelve a StruchKai para ver el resultado.');
          resolve(url);
        });
        server.listen(43821, '127.0.0.1', () => {
          void shell.openExternal(authorization.href).catch(reject);
        });
      });
      tokens = await oidc.authorizationCodeGrant(cfg, callback, {
        pkceCodeVerifier: verifier,
        expectedState: state,
        expectedNonce: nonce,
        idTokenExpected: true,
      });
      await remember();
    } finally {
      server.close();
      server.closeAllConnections();
    }
  }
  async function refresh() {
    let refreshToken = tokens?.refresh_token;
    if (!refreshToken && canStore()) {
      const data = await readFile(file).catch(() => undefined);
      if (data) refreshToken = safeStorage.decryptString(data);
    }
    if (!refreshToken) return false;
    try {
      tokens = await oidc.refreshTokenGrant(
        await configuration(),
        refreshToken,
      );
      tokens.refresh_token ??= refreshToken;
      await remember();
      return true;
    } catch {
      tokens = undefined;
      await rm(file, { force: true });
      return false;
    }
  }
  async function call(route: string, method = 'GET', body?: unknown) {
    if (!tokens && !(await refresh())) return null;
    const send = () =>
      fetch(new URL('/v1/' + route, api), {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
        headers: {
          Authorization: 'Bearer ' + tokens?.access_token,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    let response = await send();
    if (response.status === 401 && (await refresh())) response = await send();
    if (response.status === 401) {
      tokens = undefined;
      await rm(file, { force: true });
      return null;
    }
    if (response.status === 403)
      throw new Error('Verifica tu correo o revisa los permisos de la cuenta');
    if (!response.ok) throw new Error('No se pudo completar la operación');
    return response.status === 204
      ? true
      : (response.json() as Promise<unknown>);
  }
  ipcMain.handle(
    'struchkai:auth',
    async (event, action: Action, value: unknown) => {
      if (
        event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame ||
        event.senderFrame.url !== rendererUrl ||
        running
      )
        return { error: 'Operación no disponible' };
      if (smoke)
        return action === 'account'
          ? { data: null }
          : { error: 'Operación no disponible' };
      running = true;
      try {
        switch (action) {
          case 'login':
          case 'register':
            await grant(action);
            return { data: await call('account') };
          case 'recover':
            await grant('recover');
            return { data: await call('account') };
          case 'verify':
            await grant('login');
            return { data: await call('account') };
          case 'manage': {
            const url = new URL(issuer.href + '/account/');
            await shell.openExternal(url.href);
            return { data: true };
          }
          case 'account':
            return { data: await call('account') };
          case 'library':
          case 'favorite':
          case 'add': {
            const account = (await call('account')) as { slug?: string } | null;
            if (!account?.slug || !/^profile-[0-9a-f-]{36}$/.test(account.slug))
              return { data: null };
            const base = 'library/' + account.slug;
            if (action === 'library')
              return { data: await call(base + '?limit=100') };
            if (!value || typeof value !== 'object')
              throw new Error('Entrada inválida');
            const { kind, id, favorite } = value as Record<string, unknown>;
            if (
              (kind !== 'anime' && kind !== 'manga') ||
              typeof id !== 'string' ||
              id.length > 80 ||
              !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)
            )
              throw new Error('Entrada inválida');
            if (action === 'add')
              return { data: await call(base + '/' + kind + '/' + id, 'PUT') };
            if (typeof favorite !== 'boolean')
              throw new Error('Favorito inválido');
            return {
              data: await call(base + '/' + kind + '/' + id, 'PATCH', {
                favorite,
              }),
            };
          }
          case 'sessions':
            return { data: await call('account/sessions') };
          case 'update':
            if (
              !value ||
              typeof value !== 'object' ||
              JSON.stringify(value).length > 1500
            )
              throw new Error('Perfil inválido');
            return { data: await call('account', 'PATCH', value) };
          case 'revoke':
            if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value))
              throw new Error('Sesión inválida');
            return { data: await call('account/sessions/' + value, 'DELETE') };
          case 'logout': {
            try {
              await call('account/sessions/current', 'DELETE');
            } finally {
              const refreshToken = tokens?.refresh_token;
              tokens = undefined;
              await rm(file, { force: true });
              if (refreshToken)
                await oidc.tokenRevocation(
                  await configuration(),
                  refreshToken,
                  { token_type_hint: 'refresh_token' },
                );
            }
            return { data: true };
          }
        }
        return { error: 'Operación desconocida' };
      } catch {
        return {
          error:
            'La operación falló. Revisa el servicio local, tu correo o el estado de la sesión.',
        };
      } finally {
        running = false;
      }
    },
  );
}
