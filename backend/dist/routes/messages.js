import { z } from 'zod';
import { randomUUID } from 'crypto';
import { authenticate } from '../middleware/auth.js';
import { Permission, hasPermission } from '../types.js';
import { forbiddenError, notFoundError, validationError, } from '../utils/errors.js';
import { broadcastToChannel } from '../ws/handler.js';
const getMessagesQuerySchema = z.object({
    cursor: z.string().regex(/^\d+$/).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
});
const createMessageSchema = z.object({
    content: z.string().min(1).max(2000),
});
const updateMessageSchema = z.object({
    content: z.string().min(1).max(2000),
});
export default async function messageRoutes(fastify) {
    // All routes require auth
    fastify.addHook('preHandler', authenticate);
    // GET /api/channels/:channelId/messages — Get messages for a channel
    fastify.get('/api/channels/:channelId/messages', async (request, _reply) => {
        const { channelId } = request.params;
        const userId = request.user.userId;
        // Find channel and check membership or DM participation
        const channel = fastify.guildsDb.findChannelById(channelId);
        if (channel) {
            const member = fastify.guildsDb.findMember(channel.guildId, userId);
            if (!member) {
                throw forbiddenError('You are not a member of this guild');
            }
            if (channel.type === 'voice') {
                return { messages: [], nextCursor: null };
            }
        }
        else {
            const dm = fastify.guildsDb.findDMChannelById(channelId);
            if (!dm) {
                throw notFoundError('Channel not found');
            }
            if (dm.user1Id !== userId && dm.user2Id !== userId) {
                throw forbiddenError('You are not a participant in this DM channel');
            }
        }
        const parsed = getMessagesQuerySchema.safeParse(request.query);
        if (!parsed.success) {
            throw validationError(parsed.error.errors.map((e) => e.message).join(', '));
        }
        const { cursor, limit } = parsed.data;
        const { messages, nextCursor } = fastify.messagesDb.getMessagesByChannel(channelId, cursor, limit);
        // Enrich with author names
        const enrichedMessages = messages.map((msg) => {
            const author = fastify.authDb.findUserById(msg.authorId);
            return {
                ...msg,
                authorName: author?.username ?? 'Unknown',
            };
        });
        return { messages: enrichedMessages, nextCursor };
    });
    // POST /api/channels/:channelId/messages — Send a message
    fastify.post('/api/channels/:channelId/messages', async (request, reply) => {
        const { channelId } = request.params;
        const userId = request.user.userId;
        const username = request.user.username;
        // Find channel and check membership or DM participation
        const channel = fastify.guildsDb.findChannelById(channelId);
        if (channel) {
            const member = fastify.guildsDb.findMember(channel.guildId, userId);
            if (!member) {
                throw forbiddenError('You are not a member of this guild');
            }
            if (channel.type === 'voice') {
                throw validationError('Cannot send text messages in voice channels');
            }
        }
        else {
            const dm = fastify.guildsDb.findDMChannelById(channelId);
            if (!dm) {
                throw notFoundError('Channel not found');
            }
            if (dm.user1Id !== userId && dm.user2Id !== userId) {
                throw forbiddenError('You are not a participant in this DM channel');
            }
        }
        const parsed = createMessageSchema.safeParse(request.body);
        if (!parsed.success) {
            throw validationError(parsed.error.errors.map((e) => e.message).join(', '));
        }
        const { content } = parsed.data;
        const messageId = randomUUID();
        const message = fastify.messagesDb.createMessage(messageId, channelId, userId, content);
        const enrichedMessage = {
            ...message,
            authorName: username,
            guildId: channel ? channel.guildId : null,
        };
        // Broadcast to channel subscribers via WebSocket
        broadcastToChannel(channelId, {
            type: 'new_message',
            channelId,
            guildId: channel ? channel.guildId : null,
            message: enrichedMessage,
        });
        reply.status(201);
        return { message: enrichedMessage };
    });
    // PATCH /api/messages/:messageId — Edit a message
    fastify.patch('/api/messages/:messageId', async (request, _reply) => {
        const { messageId } = request.params;
        const userId = request.user.userId;
        const existingMessage = fastify.messagesDb.findMessageById(messageId);
        if (!existingMessage) {
            throw notFoundError('Message not found');
        }
        // Only author can edit
        if (existingMessage.authorId !== userId) {
            throw forbiddenError('You can only edit your own messages');
        }
        if (existingMessage.isDeleted) {
            throw forbiddenError('Cannot edit a deleted message');
        }
        const parsed = updateMessageSchema.safeParse(request.body);
        if (!parsed.success) {
            throw validationError(parsed.error.errors.map((e) => e.message).join(', '));
        }
        const { content } = parsed.data;
        const updatedMessage = fastify.messagesDb.updateMessage(messageId, content);
        if (updatedMessage) {
            const author = fastify.authDb.findUserById(updatedMessage.authorId);
            const enriched = { ...updatedMessage, authorName: author?.username ?? 'Unknown' };
            broadcastToChannel(existingMessage.channelId, {
                type: 'message_updated',
                message: enriched,
            });
            return { message: enriched };
        }
        throw notFoundError('Message not found');
    });
    // DELETE /api/messages/:messageId — Delete a message
    fastify.delete('/api/messages/:messageId', async (request, _reply) => {
        const { messageId } = request.params;
        const userId = request.user.userId;
        const existingMessage = fastify.messagesDb.findMessageById(messageId);
        if (!existingMessage) {
            throw notFoundError('Message not found');
        }
        // Check: author OR has DELETE_MESSAGES permission in the channel's guild
        const isAuthor = existingMessage.authorId === userId;
        if (!isAuthor) {
            const channel = fastify.guildsDb.findChannelById(existingMessage.channelId);
            if (!channel) {
                throw notFoundError('Channel not found');
            }
            const isOwner = fastify.guildsDb.isGuildOwner(channel.guildId, userId);
            const perms = fastify.guildsDb.getMemberPermissions(channel.guildId, userId);
            if (!isOwner && !hasPermission(perms, Permission.DELETE_MESSAGES)) {
                throw forbiddenError('You do not have permission to delete this message');
            }
        }
        fastify.messagesDb.softDeleteMessage(messageId);
        broadcastToChannel(existingMessage.channelId, {
            type: 'message_deleted',
            messageId: messageId,
            channelId: existingMessage.channelId,
        });
        return { success: true };
    });
}
//# sourceMappingURL=messages.js.map