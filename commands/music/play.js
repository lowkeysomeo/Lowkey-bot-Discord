module.exports.data = {
    name: "play",
    description: "Phát nhạc trong kênh voice",
    type: 1,

    options: [
        {
            name: "query",
            description: "Nhập tên bài hát hoặc link",
            type: 3,
            required: true
        }
    ],

    integration_types: [0],
    contexts: [0]
};

module.exports.execute = async (client, interaction) => {
    const query = interaction.options.getString("query");

    await interaction.reply({
        content: `🎵 Đã nhận yêu cầu phát: **${query}**`
    });
};