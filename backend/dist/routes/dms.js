import { z } from 'zod';
import { randomUUID } from 'crypto';
import { authenticate } from '../middleware/auth.js';
import { notFoundError, badRequestError, validationError } from '../utils/errors.js';
const startDMSchema = z.object({
    targetUsername: z.string().min(1, 'Target username is required').max(32),
});
export async function dmRoutes(fastify) {
    // GET /api/dms — List current user's DM conversations
    fastify.get('/api/dms', { preHandler: [authenticate] }, async (request, _reply) => {
        const userId = request.user.userId;
        const dmChannels = fastify.guildsDb.listDMChannelsForUser(userId);
        const enriched = dmChannels.map((dm) => {
            const recipientId = dm.user1Id === userId ? dm.user2Id : dm.user1Id;
            const recipient = fastify.authDb.findUserById(recipientId);
            return {
                id: dm.id,
                recipientId,
                recipientUsername: recipient?.username ?? 'Bilinmeyen',
                isOnline: Boolean(recipient?.isOnline),
                createdAt: dm.createdAt,
            };
        });
        return { dmChannels: enriched };
    });
    // POST /api/dms — Start or get an existing DM conversation by username
    fastify.post('/api/dms', { preHandler: [authenticate] }, async (request, reply) => {
        const userId = request.user.userId;
        const parsed = startDMSchema.safeParse(request.body);
        if (!parsed.success) {
            throw validationError(parsed.error.errors.map((e) => e.message).join(', '));
        }
        const { targetUsername } = parsed.data;
        const targetUser = fastify.authDb.findUserByUsername(targetUsername);
        if (!targetUser) {
            throw notFoundError(`Kullanıcı bulunamadı: "${targetUsername}"`);
        }
        if (targetUser.id === userId) {
            throw badRequestError('Kendinize özel mesaj gönderemezsiniz');
        }
        // Check if a DM channel already exists between these users
        const existing = fastify.guildsDb.findDMChannelBetween(userId, targetUser.id);
        if (existing) {
            reply.status(200);
            return {
                dmChannel: {
                    id: existing.id,
                    recipientId: targetUser.id,
                    recipientUsername: targetUser.username,
                    isOnline: Boolean(targetUser.isOnline),
                    createdAt: existing.createdAt,
                },
            };
        }
        // Create new DM channel
        const channelId = randomUUID();
        const created = fastify.guildsDb.createDMChannel(channelId, userId, targetUser.id);
        reply.status(201);
        return {
            dmChannel: {
                id: created.id,
                recipientId: targetUser.id,
                recipientUsername: targetUser.username,
                isOnline: Boolean(targetUser.isOnline),
                createdAt: created.createdAt,
            },
        };
    });
}
//# sourceMappingURL=dms.js.map