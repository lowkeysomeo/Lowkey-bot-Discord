const {
    PermissionFlagsBits
} = require("discord.js");

const {
    setVoiceLevel
} = require("../../utils/voiceLevelSystem");

const {
    updateVoiceRole
} = require("../../utils/voiceRoles");

module.exports.data = {
    name: "setvoicelevel",
    description: "Đặt Voice Level cho một thành viên",
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
            description: "Voice Level muốn đặt",
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

    const result = setVoiceLevel(
        interaction.guild.id,
        user.id,
        level
    );

    await updateVoiceRole(
        member,
        result.level
    );

    await interaction.reply({
        content:
            `✅ Đã đặt Voice Level của ${user} thành **Level ${result.level}**.\n` +
            `🎙️ Tổng Voice XP: **${result.totalXp.toLocaleString()} XP**.`
    });
};