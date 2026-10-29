import { z } from 'zod';
import { randomUUID } from 'crypto';
import { authenticate } from '../middleware/auth.js';
import { Permission, hasPermission } from '../types.js';
import { forbiddenError, notFoundError, conflictError, validationError, } from '../utils/errors.js';
import { getGuildVoiceStates, broadcastToAllAuthenticated } from '../ws/handler.js';
const createGuildSchema = z.object({
    name: z.string().min(1).max(100),
});
const joinGuildSchema = z.object({
    inviteCode: z.string().min(1),
});
const createRoleSchema = z.object({
    name: z.string().min(1).max(100),
    permissions: z.number().int().min(0),
});
const updateMemberRoleSchema = z.object({
    roleId: z.string().min(1),
});
function generateInviteCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}
export default async function guildRoutes(fastify) {
    // All routes require auth
    fastify.addHook('preHandler', authenticate);
    // POST /api/guilds — Create a new guild
    fastify.post('/api/guilds', async (request, reply) => {
        const parsed = createGuildSchema.safeParse(request.body);
        if (!parsed.success) {
            throw validationError(parsed.error.errors.map((e) => e.message).join(', '));
        }
        const { name } = parsed.data;
        const userId = request.user.userId;
        const guildId = randomUUID();
        const inviteCode = generateInviteCode();
        const guild = fastify.guildsDb.createGuild(guildId, name, userId, inviteCode);
        // Create default roles
        const ownerRoleId = randomUUID();
        const adminRoleId = randomUUID();
        const memberRoleId = randomUUID();
        fastify.guildsDb.createRole(ownerRoleId, guildId, 'owner', Permission.ADMIN | Permission.MANAGE_CHANNELS | Permission.DELETE_MESSAGES);
        fastify.guildsDb.createRole(adminRoleId, guildId, 'admin', Permission.ADMIN | Permission.MANAGE_CHANNELS | Permission.DELETE_MESSAGES);
        fastify.guildsDb.createRole(memberRoleId, guildId, 'member', 0);
        // Add creator as member with owner role
        const memberId = randomUUID();
        fastify.guildsDb.addMember(memberId, guildId, userId, ownerRoleId);
        // Create default "general" channel
        const channelId = randomUUID();
        fastify.guildsDb.createChannel(channelId, guildId, 'general');
        reply.status(201);
        return { guild };
    });
    // GET /api/guilds — List user's guilds
    fastify.get('/api/guilds', async (request, _reply) => {
        const userId = request.user.userId;
        const guilds = fastify.guildsDb.getGuildsForUser(userId);
        return { guilds };
    });
    // GET /api/guilds/:guildId — Get guild details
    fastify.get('/api/guilds/:guildId', async (request, _reply) => {
        const { guildId } = request.params;
        const userId = request.user.userId;
        // Check membership
        const member = fastify.guildsDb.findMember(guildId, userId);
        if (!member) {
            throw forbiddenError('You are not a member of this guild');
        }
        const guild = fastify.guildsDb.findGuildById(guildId);
        if (!guild) {
            throw notFoundError('Guild not found');
        }
        return { guild };
    });
    // Helper for joining by invite code
    const handleJoinGuild = async (request, _reply) => {
        const parsed = joinGuildSchema.safeParse(request.body);
        if (!parsed.success) {
            throw validationError(parsed.error.errors.map((e) => e.message).join(', '));
        }
        const { inviteCode } = parsed.data;
        const userId = request.user.userId;
        const guild = fastify.guildsDb.findGuildByInviteCode(inviteCode);
        if (!guild) {
            throw notFoundError('Invalid invite code');
        }
        // Check if already a member
        const existingMember = fastify.guildsDb.findMember(guild.id, userId);
        if (existingMember) {
            throw conflictError('Already a member of this guild');
        }
        // Find the 'member' role for this guild
        const roles = fastify.guildsDb.getRolesByGuild(guild.id);
        const memberRole = roles.find((r) => r.name === 'member');
        if (!memberRole) {
            throw notFoundError('Default member role not found');
        }
        const memberId = randomUUID();
        fastify.guildsDb.addMember(memberId, guild.id, userId, memberRole.id);
        // Broadcast new member to all active clients for real-time MemberList reactivity
        const joinedUser = fastify.authDb.findUserById(userId);
        const enrichedNewMember = {
            id: memberId,
            guildId: guild.id,
            userId,
            roleId: memberRole.id,
            joinedAt: new Date().toISOString(),
            username: joinedUser?.username ?? 'Unknown',
            isOnline: joinedUser?.isOnline ?? true,
            roleName: memberRole.name,
            permissions: memberRole.permissions,
        };
        broadcastToAllAuthenticated({
            type: 'guild_member_joined',
            guildId: guild.id,
            member: enrichedNewMember,
        });
        return { guild };
    };
    // POST /api/guilds/join & POST /api/guilds/:guildId/join
    fastify.post('/api/guilds/join', handleJoinGuild);
    fastify.post('/api/guilds/:guildId/join', handleJoinGuild);
    // GET /api/guilds/:guildId/members — List guild members
    fastify.get('/api/guilds/:guildId/members', async (request, _reply) => {
        const { guildId } = request.params;
        const userId = request.user.userId;
        // Check membership
        const member = fastify.guildsDb.findMember(guildId, userId);
        if (!member) {
            throw forbiddenError('You are not a member of this guild');
        }
        const members = fastify.guildsDb.getMembersByGuild(guildId);
        // Enrich with user data from auth.db and role info from guilds.db
        const enrichedMembers = members.map((m) => {
            const user = fastify.authDb.findUserById(m.userId);
            const role = fastify.guildsDb.findRoleById(m.roleId);
            return {
                ...m,
                username: user?.username ?? 'Unknown',
                isOnline: user?.isOnline ?? false,
                roleName: role?.name ?? 'member',
                permissions: role?.permissions ?? 0,
            };
        });
        return { members: enrichedMembers };
    });
    // GET /api/guilds/:guildId/voice-states — Get active voice participants per channel
    fastify.get('/api/guilds/:guildId/voice-states', async (request, _reply) => {
        const { guildId } = request.params;
        const userId = request.user.userId;
        const member = fastify.guildsDb.findMember(guildId, userId);
        if (!member) {
            throw forbiddenError('You are not a member of this guild');
        }
        const voiceStates = getGuildVoiceStates(guildId);
        return { voiceStates };
    });
    // POST /api/guilds/:guildId/roles — Create a role
    fastify.post('/api/guilds/:guildId/roles', async (request, reply) => {
        const { guildId } = request.params;
        const userId = request.user.userId;
        // Check user is owner
        if (!fastify.guildsDb.isGuildOwner(guildId, userId)) {
            throw forbiddenError('Only the guild owner can create roles');
        }
        const parsed = createRoleSchema.safeParse(request.body);
        if (!parsed.success) {
            throw validationError(parsed.error.errors.map((e) => e.message).join(', '));
        }
        const { name, permissions } = parsed.data;
        const roleId = randomUUID();
        const role = fastify.guildsDb.createRole(roleId, guildId, name, permissions);
        reply.status(201);
        return { role };
    });
    // PATCH /api/guilds/:guildId/members/:userId/role — Update a member's role
    fastify.patch('/api/guilds/:guildId/members/:userId/role', async (request, _reply) => {
        const { guildId, userId: targetUserId } = request.params;
        const requesterId = request.user.userId;
        // Check requester is owner or admin
        const isOwner = fastify.guildsDb.isGuildOwner(guildId, requesterId);
        const requesterPerms = fastify.guildsDb.getMemberPermissions(guildId, requesterId);
        if (!isOwner && !hasPermission(requesterPerms, Permission.ADMIN)) {
            throw forbiddenError('Only owner or admin can change member roles');
        }
        // Cannot change owner's role
        if (fastify.guildsDb.isGuildOwner(guildId, targetUserId)) {
            throw forbiddenError('Cannot change the guild owner\'s role');
        }
        const parsed = updateMemberRoleSchema.safeParse(request.body);
        if (!parsed.success) {
            throw validationError(parsed.error.errors.map((e) => e.message).join(', '));
        }
        const { roleId } = parsed.data;
        // Verify role exists and belongs to this guild
        const role = fastify.guildsDb.findRoleById(roleId);
        if (!role || role.guildId !== guildId) {
            throw notFoundError('Role not found in this guild');
        }
        // Verify target member exists
        const targetMember = fastify.guildsDb.findMember(guildId, targetUserId);
        if (!targetMember) {
            throw notFoundError('Member not found');
        }
        fastify.guildsDb.updateMemberRole(guildId, targetUserId, roleId);
        const updatedMember = fastify.guildsDb.findMember(guildId, targetUserId);
        const targetUser = fastify.authDb.findUserById(targetUserId);
        const enrichedUpdated = {
            ...updatedMember,
            username: targetUser?.username ?? 'Unknown',
            isOnline: targetUser?.isOnline ?? false,
            roleName: role.name,
            permissions: role.permissions,
        };
        broadcastToAllAuthenticated({
            type: 'guild_member_updated',
            guildId,
            member: enrichedUpdated,
        });
        return { member: updatedMember };
    });
}
//# sourceMappingURL=guilds.js.map