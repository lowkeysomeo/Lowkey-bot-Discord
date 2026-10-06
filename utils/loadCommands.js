const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');

function loadCommands() {
  const commands = new Collection();
  const commandsPath = path.join(process.cwd(), 'commands');

  if (!fs.existsSync(commandsPath)) {
    throw new Error('Không tìm thấy thư mục commands/.');
  }

  const folders = fs.readdirSync(commandsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory());

  for (const folder of folders) {
    const folderPath = path.join(commandsPath, folder.name);
    const commandFiles = fs.readdirSync(folderPath)
      .filter((file) => file.endsWith('.js'));

    for (const file of commandFiles) {
      const filePath = path.join(folderPath, file);
      delete require.cache[require.resolve(filePath)];
      const command = require(filePath);

      if (!command?.data?.name || typeof command.execute !== 'function') {
        console.warn(`[COMMAND] Bỏ qua file không hợp lệ: ${filePath}`);
        continue;
      }

      commands.set(command.data.name, command);
    }
  }

  return commands;
}

module.exports = { loadCommands };
