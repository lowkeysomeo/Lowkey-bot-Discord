const {
    PermissionFlagsBits
} = require("discord.js");

const {
    setLevel
} = require("../../utils/levelSystem");

const {
    updateLevelRole
} = require("../../utils/levelRoles");

module.exports.data = {
    name: "setlevel",
    description: "Đặt level chat cho một thành viên",
    type: 1,

    default_member_permissions:
        PermissionFlagsBits.ManageGuild.toString(),

    options: [
        {
            name: "user",
            description: "Thành viên muốn chỉnh",
            type: 6,
            required: true
        },
        {
            name: "level",
            description: "Level muốn đặt",
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

    const level =
        interaction.options.getInteger("level");

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

    const result = setLevel(
        interaction.guild.id,
        user.id,
        level
    );

    await updateLevelRole(
        member,
        result.level
    );

    await interaction.reply({
        content:
            `✅ Đã đặt level của ${user} thành **Level ${result.level}**.\n` +
            `✨ Tổng XP được đồng bộ thành **${result.totalXp.toLocaleString()} XP**.`
    });
};