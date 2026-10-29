// FILE: backend/src/config.ts
export const config = {
    PORT: parseInt(process.env.PORT || '3001', 10),
    JWT_SECRET: process.env.JWT_SECRET || 'highbeam-dev-secret',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
    DB_PATH: process.env.DB_PATH || './data',
    CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
};
//# sourceMappingURL=config.js.map