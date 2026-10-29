import { z } from 'zod';
import { randomUUID } from 'crypto';
import { authenticate } from '../middleware/auth.js';
import { Permission, hasPermission } from '../types.js';
import { forbiddenError, validationError, } from '../utils/errors.js';
const createChannelSchema = z.object({
    name: z.string().min(1).max(100),
    type: z.enum(['text', 'voice']).default('text'),
});
export default async function channelRoutes(fastify) {
    // All routes require auth
    fastify.addHook('preHandler', authenticate);
    // POST /api/guilds/:guildId/channels — Create a channel
    fastify.post('/api/guilds/:guildId/channels', async (request, reply) => {
        const { guildId } = request.params;
        const userId = request.user.userId;
        // Check membership
        const member = fastify.guildsDb.findMember(guildId, userId);
        if (!member) {
            throw forbiddenError('You are not a member of this guild');
        }
        // Check MANAGE_CHANNELS permission or owner
        const isOwner = fastify.guildsDb.isGuildOwner(guildId, userId);
        const perms = fastify.guildsDb.getMemberPermissions(guildId, userId);
        if (!isOwner && !hasPermission(perms, Permission.MANAGE_CHANNELS)) {
            throw forbiddenError('You do not have permission to manage channels');
        }
        const parsed = createChannelSchema.safeParse(request.body);
        if (!parsed.success) {
            throw validationError(parsed.error.errors.map((e) => e.message).join(', '));
        }
        const { name, type } = parsed.data;
        const channelId = randomUUID();
        const channel = fastify.guildsDb.createChannel(channelId, guildId, name, type);
        reply.status(201);
        return { channel };
    });
    // GET /api/guilds/:guildId/channels — List channels
    fastify.get('/api/guilds/:guildId/channels', async (request, _reply) => {
        const { guildId } = request.params;
        const userId = request.user.userId;
        // Check membership
        const member = fastify.guildsDb.findMember(guildId, userId);
        if (!member) {
            throw forbiddenError('You are not a member of this guild');
        }
        const channels = fastify.guildsDb.getChannelsByGuild(guildId);
        return { channels };
    });
}
//# sourceMappingURL=channels.js.map