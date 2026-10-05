module.exports.data = {
    name: "ping",
    description: "Xem ping của bot",
    type: 1,
    options: [],
    integration_types: [0],
    contexts: [0]
};

module.exports.execute = async (interaction) => {
    const ping = interaction.client.ws.ping;

    await interaction.reply({
        content: `🏓 Pong! Ping của bot: **${ping}ms**`
    });
};