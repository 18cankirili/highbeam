// FILE: backend/src/utils/errors.ts
export class AppError extends Error {
  public statusCode: number;
  public code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function errorResponse(code: string, message: string) {
  return { error: { code, message } };
}

export function validationError(msg: string): AppError {
  return new AppError(400, 'VALIDATION_ERROR', msg);
}

export function badRequestError(msg: string): AppError {
  return new AppError(400, 'BAD_REQUEST', msg);
}

export function unauthorizedError(msg: string): AppError {
  return new AppError(401, 'UNAUTHORIZED', msg);
}

export function forbiddenError(msg: string): AppError {
  return new AppError(403, 'FORBIDDEN', msg);
}

export function notFoundError(msg: string): AppError {
  return new AppError(404, 'NOT_FOUND', msg);
}

export function conflictError(msg: string): AppError {
  return new AppError(409, 'CONFLICT', msg);
}
