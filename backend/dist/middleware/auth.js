import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { unauthorizedError } from '../utils/errors.js';
export async function authenticate(request, _reply) {
    let token;
    // Try Authorization header first
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7);
    }
    // Fall back to cookie
    if (!token) {
        token = request.cookies?.highbeam_token;
    }
    if (!token) {
        throw unauthorizedError('Authentication required');
    }
    try {
        const decoded = jwt.verify(token, config.JWT_SECRET);
        request.user = {
            userId: decoded.userId,
            username: decoded.username,
        };
    }
    catch {
        throw unauthorizedError('Invalid or expired token');
    }
}
//# sourceMappingURL=auth.js.map