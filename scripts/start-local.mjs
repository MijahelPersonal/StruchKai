import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { createConnection } from 'node:net';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
if (existsSync('.env')) process.loadEnvFile('.env');
const issuer = new URL(
  process.env.STRUCHKAI_OIDC_ISSUER ?? 'http://127.0.0.1:8083/realms/struchkai',
);
const api = new URL(process.env.STRUCHKAI_API_URL ?? 'http://127.0.0.1:3100');
for (const url of [issuer, api]) {
  if (
    url.hostname !== '127.0.0.1' ||
    url.protocol !== 'http:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      'El lanzador local requiere URLs HTTP de 127.0.0.1 sin credenciales.',
    );
}
const apiPort = process.env.STRUCHKAI_API_PORT ?? '3100';
if (Number(api.port || 80) !== Number(apiPort))
  throw new Error('STRUCHKAI_API_URL y STRUCHKAI_API_PORT no coinciden.');
mkdirSync('.struchkai-local', { recursive: true });
const healthy = async (url) =>
  fetch(url, { signal: AbortSignal.timeout(2000) })
    .then((r) => r.ok)
    .catch(() => false);
const listening = (port) =>
  new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port: Number(port) });
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(1500, () => done(false));
  });
async function ready(url, name) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (await healthy(url)) {
      console.info(name + ' disponible');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(name + ': no respondió; revisa .struchkai-local/local-*.log');
}
function background(command, args, name, cwd = root, extra = {}) {
  console.info('Iniciando ' + name + '…');
  const fd = openSync(
    join(root, '.struchkai-local', 'local-' + name + '.log'),
    'a',
  );
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...extra },
    detached: !command.toLowerCase().endsWith('powershell.exe'),
    windowsHide: true,
    stdio: ['ignore', fd, fd],
  });
  child.once('error', () => console.error('No se pudo iniciar ' + name));
  child.unref();
  closeSync(fd);
}
try {
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('Ejecuta npm run start:local desde la raíz.');
  console.info('Compilando StruchKai…');
  const build = spawnSync(process.execPath, [npm, 'run', 'build'], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (build.status !== 0) throw new Error('La compilación falló.');

  // pg_ctl preserves the existing dedicated cluster; this command never initializes a database.
  console.info('Comprobando servicios locales…');
  if (!(await listening(55433))) {
    const pg =
      process.env.STRUCHKAI_POSTGRES_BIN ??
      'C:/Program Files/PostgreSQL/18/bin';
    const start = spawnSync(
      join(pg, 'pg_ctl.exe'),
      [
        'start',
        '-D',
        resolve('.struchkai-local/pgdata'),
        '-l',
        resolve('.struchkai-local/local-postgres.log'),
        '-o',
        '-h 127.0.0.1 -p 55433',
      ],
      { stdio: 'inherit', windowsHide: true },
    );
    if (start.status !== 0)
      throw new Error(
        'No se pudo iniciar el clúster PostgreSQL local existente.',
      );
  }
  const discovery = issuer.href + '/.well-known/openid-configuration';
  if (!(await healthy(discovery))) {
    if (await listening(issuer.port || 80))
      throw new Error(
        'Keycloak escucha, pero el realm configurado no está disponible. No se inicia otra instancia.',
      );
    const kc = resolve('.struchkai-local/keycloak-26.8.2');
    if (!existsSync(join(kc, 'bin/kc.bat')))
      throw new Error('Falta la instalación local de Keycloak.');
    const java = process.env.JAVA_HOME ?? 'C:/Program Files/Java/latest/jdk-26';
    background(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-File',
        resolve('scripts/start-keycloak.ps1'),
        '-KeycloakHome',
        kc,
        '-Port',
        issuer.port || '80',
      ],
      'keycloak',
      kc,
      { JAVA_HOME: java },
    );
  }
  await ready(discovery, 'Keycloak');
  const metadata = await fetch(discovery).then((r) => r.json());
  if (metadata.issuer !== issuer.href)
    throw new Error('El issuer publicado por Keycloak no coincide.');
  if (!(await listening(api.port || 80)))
    background(
      process.execPath,
      [
        '--env-file-if-exists=apps/api/.env',
        '--env-file-if-exists=.env',
        'apps/api/dist/main.js',
      ],
      'api',
      root,
      { STRUCHKAI_API_PORT: apiPort, STRUCHKAI_OIDC_ISSUER: issuer.href },
    );
  await ready(new URL('/health/database', api), 'NestJS y PostgreSQL');
  if (!(await listening(5173)))
    background(
      process.execPath,
      [
        resolve('node_modules/vite/bin/vite.js'),
        '--host',
        '127.0.0.1',
        '--port',
        '5173',
        '--strictPort',
      ],
      'frontend',
      resolve('apps/frontend'),
    );
  await ready('http://127.0.0.1:5173', 'React');
  background(
    resolve('node_modules/electron/dist/electron.exe'),
    ['apps/desktop', '--dev'],
    'electron',
  );
  console.info(
    'StruchKai abierto. Los servicios quedan activos. Vuelve a ejecutar este comando para reabrirlo.',
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
