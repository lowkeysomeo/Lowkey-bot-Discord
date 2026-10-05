const { AttachmentBuilder } = require("discord.js");

const {
    getProfile,
    getRequiredXp,
    getLeaderboard
} = require("../../utils/levelSystem");

const {
    createRankCard
} = require("../../utils/createRankCard");

module.exports.data = {
    name: "rank",
    description: "Xem level và tiến độ hoạt động của bạn hoặc thành viên khác",
    type: 1,

    options: [
        {
            name: "user",
            description: "Chọn thành viên muốn xem",
            type: 6,
            required: false
        }
    ],

    integration_types: [0],
    contexts: [0]
};

module.exports.execute = async (interaction) => {
    const user =
        interaction.options.getUser("user") ||
        interaction.user;

    const member =
        await interaction.guild.members
            .fetch(user.id)
            .catch(() => null);

    const profile = getProfile(
        interaction.guild.id,
        user.id
    );

    const requiredXp = getRequiredXp(profile.level);

    const leaderboard = getLeaderboard(
        interaction.guild.id,
        9999
    );

    const rankIndex = leaderboard.findIndex(
        data => data.userId === user.id
    );

    const serverRank =
        rankIndex === -1 ? 0 : rankIndex + 1;

    const cardBuffer = await createRankCard({
        avatarURL: user.displayAvatarURL({
            extension: "png",
            size: 256
        }),
        username: user.username,
        displayName: member?.displayName || user.username,
        level: profile.level,
        rank: serverRank,
        totalXp: profile.totalXp,
        currentXp: profile.xp,
        requiredXp
    });

    const attachment = new AttachmentBuilder(cardBuffer, {
        name: "rank-card.png"
    });

    await interaction.reply({
        files: [attachment]
    });
};