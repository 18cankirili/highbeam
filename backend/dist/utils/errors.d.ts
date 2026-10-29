export declare class AppError extends Error {
    statusCode: number;
    code: string;
    constructor(statusCode: number, code: string, message: string);
}
export declare function errorResponse(code: string, message: string): {
    error: {
        code: string;
        message: string;
    };
};
export declare function validationError(msg: string): AppError;
export declare function badRequestError(msg: string): AppError;
export declare function unauthorizedError(msg: string): AppError;
export declare function forbiddenError(msg: string): AppError;
export declare function notFoundError(msg: string): AppError;
export declare function conflictError(msg: string): AppError;
//# sourceMappingURL=errors.d.ts.map