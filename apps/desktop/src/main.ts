import { registerAuth } from './auth.js';
import { app, BrowserWindow, session } from 'electron';
import { fileURLToPath } from 'node:url';
app.setName('StruchKai');
if (process.platform === 'win32')
  app.setAppUserModelId('com.struchkai.desktop');

const smoke = process.argv.includes('--smoke');
const dev = !app.isPackaged && !smoke && process.argv.includes('--dev');
const localUrl = 'http://127.0.0.1:5173';
const renderer = fileURLToPath(
  new URL('../../frontend/dist/index.html', import.meta.url),
);
app.on('window-all-closed', () => app.quit());
async function start() {
  await app.whenReady();
  const browserSession = session.fromPartition('struchkai-renderer');
  browserSession.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  browserSession.setPermissionCheckHandler(() => false);
  browserSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (details, callback) => {
      const url = new URL(details.url);
      callback({
        cancel:
          !dev ||
          url.host !== '127.0.0.1:5173' ||
          !['http:', 'ws:'].includes(url.protocol),
      });
    },
  );
  browserSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    headers['Content-Security-Policy'] = [
      dev
        ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:5173; object-src 'none'; base-uri 'none'"
        : "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'",
    ];
    callback({ responseHeaders: headers });
  });
  const window = new BrowserWindow({
    width: 1050,
    height: 720,
    webPreferences: {
      session: browserSession,
      preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  registerAuth(
    window,
    dev
      ? localUrl + '/'
      : new URL('../../frontend/dist/index.html', import.meta.url).href,
    smoke,
  );
  if (dev) await window.loadURL(localUrl);
  else await window.loadFile(renderer);
  if (smoke) {
    const heading: unknown = await window.webContents.executeJavaScript(
      "new Promise(resolve => { const deadline=Date.now()+5000; const timer=setInterval(() => { const heading=document.querySelector('h1')?.textContent; if(heading || Date.now()>=deadline){ clearInterval(timer); resolve(window.desktopInfo?.platform ? heading : null); } },25); })",
    );
    if (heading !== 'StruchKai')
      throw new Error('El renderer o el preload no cargaron');
    console.info('Ventana Electron, renderer React y preload verificados');
    app.exit(0);
  }
}

void start().catch((error: unknown) => {
  console.error(error);
  app.exit(1);
});
