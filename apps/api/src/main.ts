import type { IncomingMessage, ServerResponse } from 'node:http';
import { Database } from './database.module.js';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ApiExceptionFilter, requestIdMiddleware } from './http.js';
import { AppModule } from './app.module.js';

const port = Number(
  process.env.STRUCHKAI_API_PORT ?? process.env.API_PORT ?? '3100',
);
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw new Error('API_PORT inválido');
const app = await NestFactory.create(AppModule, {
  logger: false,
  abortOnError: false,
});
app.use(requestIdMiddleware);
let bucketUntil = 0;
let privateRequests = 0;
app.use(
  (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const pathname = new URL(
      request.url ?? '/',
      'http://127.0.0.1',
    ).pathname.toLowerCase();
    if (!/^\/v1\/(account|admin|library)(\/|$)/.test(pathname)) {
      next();
      return;
    }
    const now = Date.now();
    if (now >= bucketUntil) {
      bucketUntil = now + 60000;
      privateRequests = 0;
    }
    if (++privateRequests <= 300) {
      next();
      return;
    }
    response.setHeader(
      'Retry-After',
      String(Math.ceil((bucketUntil - now) / 1000)),
    );
    response.writeHead(429, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({
        code: 'OPERATION_NOT_ALLOWED',
        message: 'Demasiadas solicitudes',
        requestId: response.getHeader('X-Request-Id'),
      }),
    );
  },
);
app.useGlobalFilters(new ApiExceptionFilter());
app.enableShutdownHooks();
try {
  await app
    .get(Database)
    .check()
    .catch(() => {
      throw new Error('PostgreSQL no disponible o migración pendiente');
    });
  await app.listen(port, '127.0.0.1');
  console.info('API local en ' + (await app.getUrl()));
} catch (error) {
  await app.close();
  throw error;
}
