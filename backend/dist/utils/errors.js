// FILE: backend/src/utils/errors.ts
export class AppError extends Error {
    statusCode;
    code;
    constructor(statusCode, code, message) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
    }
}
export function errorResponse(code, message) {
    return { error: { code, message } };
}
export function validationError(msg) {
    return new AppError(400, 'VALIDATION_ERROR', msg);
}
export function badRequestError(msg) {
    return new AppError(400, 'BAD_REQUEST', msg);
}
export function unauthorizedError(msg) {
    return new AppError(401, 'UNAUTHORIZED', msg);
}
export function forbiddenError(msg) {
    return new AppError(403, 'FORBIDDEN', msg);
}
export function notFoundError(msg) {
    return new AppError(404, 'NOT_FOUND', msg);
}
export function conflictError(msg) {
    return new AppError(409, 'CONFLICT', msg);
}
//# sourceMappingURL=errors.js.map