const {
    PermissionFlagsBits
} = require("discord.js");

const {
    addXp
} = require("../../utils/levelSystem");

const {
    updateLevelRole
} = require("../../utils/levelRoles");

module.exports.data = {
    name: "givexp",
    description: "Cộng XP chat cho một thành viên",
    type: 1,

    default_member_permissions:
        PermissionFlagsBits.ManageGuild.toString(),

    options: [
        {
            name: "user",
            description: "Thành viên muốn cộng XP",
            type: 6,
            required: true
        },
        {
            name: "amount",
            description: "Số XP muốn cộng",
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
            content: "❌ Không tìm thấy thành viên này.",
            ephemeral: true
        });
    }

    const result = addXp(
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
            `✅ Đã cộng **${amount.toLocaleString()} XP** cho ${user}.\n` +
            `🏆 Level hiện tại: **${result.level}**\n` +
            `✨ Tổng XP: **${result.totalXp.toLocaleString()}**`
    });
};