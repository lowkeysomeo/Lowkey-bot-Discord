const {
    AttachmentBuilder
} = require("discord.js");

const {
    getLeaderboard
} = require("../../utils/levelSystem");

const {
    createLeaderboardCard
} = require("../../utils/createLeaderboardCard");

module.exports.data = {
    name: "leaderboard",
    description:
        "Xem bảng xếp hạng hoạt động của server",
    type: 1,
    options: [],
    integration_types: [0],
    contexts: [0]
};

module.exports.execute =
    async (interaction) => {

        await interaction.deferReply();

        const leaderboard =
            getLeaderboard(
                interaction.guild.id,
                10
            );

        if (leaderboard.length === 0) {
            return interaction.editReply({
                content:
                    "🌱 Bảng xếp hạng hiện vẫn đang trống."
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
                    data.totalXp
            });
        }

        const card =
            await createLeaderboardCard(
                rows,
                interaction.guild.name
            );

        const attachment =
            new AttachmentBuilder(
                card,
                {
                    name:
                        "leaderboard.png"
                }
            );

        await interaction.editReply({
            files: [attachment]
        });
    };