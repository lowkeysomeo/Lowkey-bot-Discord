const { REST, Routes } = require('discord.js');

async function deployCommands(commands, restClient) {
  const { TOKEN, CLIENT_ID, GUILD_ID } = process.env;
  if (!TOKEN || !CLIENT_ID) throw new Error('Thiếu TOKEN hoặc CLIENT_ID.');
  const rest = restClient || new REST({ version: '10' }).setToken(TOKEN);
  const body = commands.map(command => {
    const data = typeof command.data.toJSON === 'function' ? command.data.toJSON() : command.data;
    // All existing commands operate on server members and server data.
    return { ...data, contexts: [0], integration_types: [0], dm_permission: false };
  });
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body });
  console.log(`[DEPLOY] Registered ${body.length} global commands for all servers.`);
  // Remove the legacy server-only copies only after global registration succeeds.
  if (GUILD_ID) {
    try {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });
    } catch (error) {
      console.warn('[DEPLOY] Global commands registered; could not clear legacy guild commands:', error.message);
    }
  }
}

module.exports = { deployCommands };
