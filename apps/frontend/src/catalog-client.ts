import {
  catalogRequest,
  type CatalogAction,
  type CatalogInput,
} from '@struchkai/contracts';

declare global {
  interface Window {
    struchkaiCatalog?: {
      run(
        action: CatalogAction,
        input?: CatalogInput,
      ): Promise<{ data?: unknown; error?: string; requestId?: string }>;
    };
  }
}
export async function catalog<T>(
  action: CatalogAction,
  input: CatalogInput = {},
): Promise<T> {
  if (window.struchkaiCatalog) {
    const reply = await window.struchkaiCatalog.run(action, input);
    if (reply.error)
      throw new Error(
        reply.error +
          (reply.requestId ? ' · Solicitud ' + reply.requestId : ''),
      );
    return reply.data as T;
  }
  const request = catalogRequest(action, input);
  const response = await fetch(request.path, {
    method: request.method,
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const error = (await response.json()) as {
      message?: string;
      requestId?: string;
    };
    throw new Error(
      (error.message ?? 'Fuente no disponible') +
        (error.requestId ? ' · Solicitud ' + error.requestId : ''),
    );
  }
  if (request.image) return URL.createObjectURL(await response.blob()) as T;
  return response.json() as Promise<T>;
}
