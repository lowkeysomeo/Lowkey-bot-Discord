const {
    AttachmentBuilder
} = require("discord.js");

const {
    getVoiceLeaderboard
} = require("../../utils/voiceLevelSystem");

const {
    createVoiceLeaderboardCard
} = require("../../utils/createVoiceLeaderboardCard");

module.exports.data = {
    name: "voiceleaderboard",
    description:
        "Xem bảng xếp hạng Voice của server",
    type: 1,
    options: [],
    integration_types: [0],
    contexts: [0]
};

module.exports.execute =
    async (interaction) => {

        await interaction.deferReply();

        const leaderboard =
            getVoiceLeaderboard(
                interaction.guild.id,
                10
            );

        if (leaderboard.length === 0) {
            return interaction.editReply({
                content:
                    "🎙️ Bảng xếp hạng Voice hiện vẫn đang trống."
            });
        }

        const rows = [];

        for (const data of leaderboard) {
            const member =
                await interaction.guild.members
                    .fetch(data.userId)
                    .catch(() => null);

            if (!member) continue;

            rows.push({
                displayName:
                    member.displayName,

                avatarURL:
                    member.user.displayAvatarURL({
                        extension: "png",
                        size: 128
                    }),

                level:
                    data.level,

                totalXp:
                    data.totalXp,

                minutes:
                    data.minutes || 0
            });
        }

        const card =
            await createVoiceLeaderboardCard(
                rows,
                interaction.guild.name
            );

        const attachment =
            new AttachmentBuilder(
                card,
                {
                    name:
                        "voice-leaderboard.png"
                }
            );

        await interaction.editReply({
            files: [attachment]
        });
    };