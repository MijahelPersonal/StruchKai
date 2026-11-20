import { ipcMain, type BrowserWindow } from 'electron';
import { catalogRequest } from '@struchkai/contracts';

export function registerCatalog(window: BrowserWindow, rendererUrl: string) {
  const api = new URL(process.env.STRUCHKAI_API_URL ?? 'http://127.0.0.1:3100');
  ipcMain.handle(
    'struchkai:catalog',
    async (event, action: unknown, input: unknown) => {
      if (
        event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame ||
        event.senderFrame.url !== rendererUrl
      )
        return { error: 'Operación no disponible' };
      try {
        const request = catalogRequest(action, input);
        const response = await fetch(new URL(request.path, api), {
          method: request.method,
          redirect: 'error',
          signal: AbortSignal.timeout(30000),
        });
        if (!response.ok) {
          const error = (await response.json().catch(() => null)) as {
            message?: unknown;
            requestId?: unknown;
          } | null;
          return {
            error:
              typeof error?.message === 'string'
                ? error.message.slice(0, 300)
                : 'No se pudo consultar la fuente',
            requestId:
              typeof error?.requestId === 'string'
                ? error.requestId
                : undefined,
          };
        }
        if (request.image) {
          const contentType = response.headers.get('content-type');
          if (
            !contentType ||
            !['image/jpeg', 'image/png', 'image/webp'].includes(contentType)
          )
            throw new Error('Formato de portada inválido');
          const data = Buffer.from(await response.arrayBuffer());
          if (data.length > 4 * 1024 * 1024)
            throw new Error('Portada demasiado grande');
          return {
            data: `data:${contentType};base64,${data.toString('base64')}`,
          };
        }
        return { data: (await response.json()) as unknown };
      } catch {
        return {
          error:
            'No se pudo consultar el catálogo. Comprueba el servicio local.',
        };
      }
    },
  );
}
