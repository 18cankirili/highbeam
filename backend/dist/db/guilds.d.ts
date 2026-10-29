import type { Guild, Channel, Role, Member, ChannelType, DMChannel } from '../types.js';
export declare class GuildsDB {
    private db;
    constructor(dbPath?: string);
    private migrate;
    createGuild(id: string, name: string, ownerId: string, inviteCode: string): Guild;
    findGuildById(id: string): Guild | undefined;
    findGuildByInviteCode(code: string): Guild | undefined;
    getGuildsForUser(userId: string): Guild[];
    createChannel(id: string, guildId: string, name: string, type?: ChannelType): Channel;
    getChannelsByGuild(guildId: string): Channel[];
    findChannelById(id: string): Channel | undefined;
    deleteChannel(id: string): void;
    createRole(id: string, guildId: string, name: string, permissions: number): Role;
    getRolesByGuild(guildId: string): Role[];
    findRoleById(id: string): Role | undefined;
    addMember(id: string, guildId: string, userId: string, roleId: string): Member;
    findMember(guildId: string, userId: string): Member | undefined;
    getMembersByGuild(guildId: string): Member[];
    updateMemberRole(guildId: string, userId: string, roleId: string): void;
    getMemberPermissions(guildId: string, userId: string): number;
    isGuildOwner(guildId: string, userId: string): boolean;
    createDMChannel(id: string, userAId: string, userBId: string): DMChannel;
    findDMChannelById(id: string): DMChannel | undefined;
    findDMChannelBetween(userAId: string, userBId: string): DMChannel | undefined;
    listDMChannelsForUser(userId: string): DMChannel[];
    close(): void;
}
//# sourceMappingURL=guilds.d.ts.map