const {
    AttachmentBuilder
} = require("discord.js");

const {
    getVoiceProfile,
    getRequiredVoiceXp,
    getVoiceLeaderboard
} = require("../../utils/voiceLevelSystem");

const {
    createVoiceRankCard
} = require("../../utils/createVoiceRankCard");


module.exports.data = {
    name: "voicerank",
    description:
        "Xem Voice Level của bạn hoặc thành viên khác",
    type: 1,

    options: [
        {
            name: "user",
            description:
                "Chọn thành viên muốn xem",
            type: 6,
            required: false
        }
    ],

    integration_types: [0],
    contexts: [0]
};


module.exports.execute =
    async (interaction) => {

        const user =
            interaction.options.getUser(
                "user"
            ) ||
            interaction.user;


        const member =
            await interaction.guild.members
                .fetch(user.id)
                .catch(() => null);


        // ================================
        // PROFILE VOICE
        // ================================

        const profile =
            getVoiceProfile(
                interaction.guild.id,
                user.id
            );


        const requiredXp =
            getRequiredVoiceXp(
                profile.level
            );


        // ================================
        // HẠNG VOICE SERVER
        // ================================

        const leaderboard =
            getVoiceLeaderboard(
                interaction.guild.id,
                9999
            );


        const rankIndex =
            leaderboard.findIndex(
                data =>
                    data.userId ===
                    user.id
            );


        const voiceRank =
            rankIndex === -1
                ? 0
                : rankIndex + 1;


        // ================================
        // TẠO CARD
        // ================================

        const cardBuffer =
            await createVoiceRankCard({
                avatarURL:
                    user.displayAvatarURL({
                        extension: "png",
                        size: 256
                    }),

                username:
                    user.username,

                displayName:
                    member?.displayName ||
                    user.username,

                level:
                    profile.level,

                rank:
                    voiceRank,

                totalXp:
                    profile.totalXp,

                currentXp:
                    profile.xp,

                requiredXp,

                minutes:
                    profile.minutes
            });


        // ================================
        // GỬI ẢNH
        // ================================

        const attachment =
            new AttachmentBuilder(
                cardBuffer,
                {
                    name:
                        "voice-rank-card.png"
                }
            );


        await interaction.reply({
            files: [attachment]
        });
    };