const { EmbedBuilder } = require("discord.js");

module.exports.data = {
    name: "avatar",
    description: "Xem ảnh đại diện của một thành viên",
    type: 1,

    options: [
        {
            name: "user",
            description: "Chọn thành viên muốn xem",
            type: 6,
            required: false
        }
    ],

    integration_types: [0, 1],
    contexts: [0, 1, 2]
};

module.exports.execute = async (interaction) => {
    const user =
        interaction.options.getUser("user") ||
        interaction.user;

    const avatar = user.displayAvatarURL({
        size: 1024,
        extension: "png"
    });

    await interaction.reply({
        content: avatar
    });
};