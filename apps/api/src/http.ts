import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import {
  ContractError,
  type ApiError,
  type ErrorCode,
  type Page,
  type PageQuery,
} from '@struchkai/contracts';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}
export function requestIdMiddleware(
  _request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) {
  response.setHeader('X-Request-Id', randomUUID());
  next();
}
interface JsonResponse extends ServerResponse {
  status(code: number): JsonResponse;
  json(body: ApiError): void;
}
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<JsonResponse>();
    if (response.headersSent) return;
    const requestId = String(
      response.getHeader('X-Request-Id') ?? randomUUID(),
    );
    response.setHeader('X-Request-Id', requestId);
    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = 'INTERNAL_ERROR';
    let message = 'Error interno';
    if (error instanceof ContractError) {
      status = 400;
      code = error.code;
      message = error.message;
    } else if (error instanceof ApiFailure) {
      ({ status, code, message } = error);
    } else if (error instanceof HttpException && error.getStatus() < 500) {
      status = error.getStatus();
      if (status === 404) {
        code = 'NOT_FOUND';
        message = 'Recurso no encontrado';
      } else if ([401, 403, 405].includes(status)) {
        code = 'OPERATION_NOT_ALLOWED';
        message = 'Operación no permitida';
      } else {
        code = 'INVALID_PARAMETERS';
        message = 'Solicitud inválida';
      }
    }
    if (status >= 500 && code === 'INTERNAL_ERROR')
      console.error('Error de API', requestId);
    response.status(status).json({ code, message, requestId });
  }
}
export function paginate<T>(
  items: readonly T[],
  { page, limit }: PageQuery,
): Page<T> {
  const offset = (page - 1) * limit;
  return {
    items: items.slice(offset, offset + limit),
    page,
    limit,
    total: items.length,
    totalPages: Math.ceil(items.length / limit),
  };
}
