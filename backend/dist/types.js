export var Permission;
(function (Permission) {
    Permission[Permission["MANAGE_CHANNELS"] = 1] = "MANAGE_CHANNELS";
    Permission[Permission["DELETE_MESSAGES"] = 2] = "DELETE_MESSAGES";
    Permission[Permission["ADMIN"] = 4] = "ADMIN";
})(Permission || (Permission = {}));
export function hasPermission(userPerms, perm) {
    if ((userPerms & Permission.ADMIN) === Permission.ADMIN)
        return true;
    return (userPerms & perm) === perm;
}
//# sourceMappingURL=types.js.map