const IP_MESSAGE = '<:Partnered_Blurple:1555223539253121066> IP Server : legacymc.io.vn\n\n<:Partnered_Blurple:1555223539253121066> Port PE : 19132';

module.exports.data = {
    name: 'ip',
    description: 'Xem IP và Port của máy chủ Minecraft',
    type: 1,
    integration_types: [0, 1],
    contexts: [0, 1, 2]
};

module.exports.execute = async (interaction) => {
    await interaction.reply({
        content: IP_MESSAGE
    });
};

module.exports.IP_MESSAGE = IP_MESSAGE;
