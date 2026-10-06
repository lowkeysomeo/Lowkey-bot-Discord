require('dotenv').config();

const { REST, Routes } = require('discord.js');
const { loadCommands } = require('./utils/loadCommands');

async function main() {
  if (!process.env.TOKEN || !process.env.CLIENT_ID || !process.env.GUILD_ID) {
    throw new Error('Thiếu TOKEN, CLIENT_ID hoặc GUILD_ID.');
  }

  const commands = loadCommands();
  const body = commands.map((command) =>
    typeof command.data.toJSON === 'function'
      ? command.data.toJSON()
      : command.data,
  );

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID,
    ),
    { body },
  );

  console.log(`Successfully reloaded ${body.length} application [/] commands.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
