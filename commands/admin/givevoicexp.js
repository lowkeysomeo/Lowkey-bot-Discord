const {
    PermissionFlagsBits
} = require("discord.js");

const {
    giveVoiceXp
} = require("../../utils/voiceLevelSystem");

const {
    updateVoiceRole
} = require("../../utils/voiceRoles");

module.exports.data = {
    name: "givevoicexp",
    description: "Cộng Voice XP cho một thành viên",
    type: 1,

    default_member_permissions:
        PermissionFlagsBits.ManageGuild.toString(),

    options: [
        {
            name: "user",
            description: "Thành viên muốn cộng Voice XP",
            type: 6,
            required: true
        },
        {
            name: "amount",
            description: "Số Voice XP muốn cộng",
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

    const result = giveVoiceXp(
        interaction.guild.id,
        user.id,
        amount
    );

    await updateVoiceRole(
        member,
        result.level
    );

    await interaction.reply({
        content:
            `🎙️ Đã cộng **${amount.toLocaleString()} Voice XP** cho ${user}.\n` +
            `🏆 Voice Level: **${result.level}**\n` +
            `✨ Tổng Voice XP: **${result.totalXp.toLocaleString()}**`
    });
};