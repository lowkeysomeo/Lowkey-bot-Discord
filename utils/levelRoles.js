const { syncRewards } = require('./customization');

// syncLevelRole: API chính mà index.js và các command dùng
const syncLevelRole = (member, level) => syncRewards(member, level, 'chat');

// Danh sách level Chat có role thưởng — dùng cho botconfig.js
const CHAT_ROLE_LEVELS = [1, 10, 20, 40, 65, 80, 95, 100];

// ─── Legacy hard-coded table (dùng biến môi trường) ───────────────────────
const LEVEL_ROLES = [
    {
        level: 1,
        roleId: () => process.env.LEVEL_ROLE_1
    },
    {
        level: 10,
        roleId: () => process.env.LEVEL_ROLE_10
    },
    {
        level: 20,
        roleId: () => process.env.LEVEL_ROLE_20
    },
    {
        level: 40,
        roleId: () => process.env.LEVEL_ROLE_40
    },
    {
        level: 65,
        roleId: () => process.env.LEVEL_ROLE_65
    },
    {
        level: 80,
        roleId: () => process.env.LEVEL_ROLE_80
    },
    {
        level: 95,
        roleId: () => process.env.LEVEL_ROLE_95
    },
    {
        level: 100,
        roleId: () => process.env.LEVEL_ROLE_100
    }
];

async function updateLevelRole(member, level) {
    try {
        // Tìm role cao nhất mà member đủ level
        const eligibleRoles = LEVEL_ROLES
            .filter(item => level >= item.level)
            .sort((a, b) => b.level - a.level);

        if (eligibleRoles.length === 0) return null;

        const target = eligibleRoles[0];
        const targetRoleId = target.roleId();

        if (!targetRoleId) {
            console.log(
                `⚠️ Chưa cấu hình role cho Level ${target.level}`
            );
            return null;
        }

        const targetRole =
            member.guild.roles.cache.get(targetRoleId);

        if (!targetRole) {
            console.log(
                `❌ Không tìm thấy role Level ${target.level}`
            );
            return null;
        }

        // Lấy tất cả role level đã cấu hình
        const allLevelRoleIds = LEVEL_ROLES
            .map(item => item.roleId())
            .filter(Boolean);

        // Những role level cũ member đang có
        const oldRoles = member.roles.cache.filter(role =>
            allLevelRoleIds.includes(role.id) &&
            role.id !== targetRoleId
        );

        // Gỡ rank cũ
        if (oldRoles.size > 0) {
            await member.roles.remove(oldRoles);
        }

        // Thêm rank mới
        if (!member.roles.cache.has(targetRoleId)) {
            await member.roles.add(targetRole);
        }

        return {
            level: target.level,
            role: targetRole
        };

    } catch (error) {
        console.error(
            `Lỗi cập nhật role level cho ${member.user.tag}:`,
            error
        );

        return null;
    }
}

module.exports = {
    syncLevelRole,
    updateLevelRole,
    CHAT_ROLE_LEVELS,
};
