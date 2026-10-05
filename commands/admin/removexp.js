const {
    PermissionFlagsBits
} = require("discord.js");

const {
    removeXp
} = require("../../utils/levelSystem");

const {
    updateLevelRole
} = require("../../utils/levelRoles");

module.exports.data = {
    name: "removexp",
    description: "Trừ XP chat của một thành viên",
    type: 1,

    default_member_permissions:
        PermissionFlagsBits.ManageGuild.toString(),

    options: [
        {
            name: "user",
            description: "Thành viên muốn trừ XP",
            type: 6,
            required: true
        },
        {
            name: "amount",
            description: "Số XP muốn trừ",
            type: 4,
            required: true,
            min_value: 1
        }
    ],

    integration_types: [0],
    contexts: [0]
};

module.exports.execute = async (interaction) => {
    const user =
        interaction.options.getUser("user");

    const amount =
        interaction.options.getInteger("amount");

    const member =
        await interaction.guild.members
            .fetch(user.id)
            .catch(() => null);

    if (!member) {
        return interaction.reply({
            content: "❌ Không tìm thấy thành viên.",
            ephemeral: true
        });
    }

    const result = removeXp(
        interaction.guild.id,
        user.id,
        amount
    );

    await updateLevelRole(
        member,
        result.level
    );

    await interaction.reply({
        content:
            `✅ Đã trừ **${amount.toLocaleString()} XP** của ${user}.\n` +
            `🏆 Level hiện tại: **${result.level}**\n` +
            `✨ Tổng XP: **${result.totalXp.toLocaleString()}**`
    });
};