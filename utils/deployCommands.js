const { REST, Routes } = require('discord.js');

async function deployCommands(commands, restClient) {
  const { TOKEN, CLIENT_ID, GUILD_ID } = process.env;
  if (!TOKEN || !CLIENT_ID) throw new Error('Thiếu TOKEN hoặc CLIENT_ID.');
  const rest = restClient || new REST({ version: '10' }).setToken(TOKEN);
  const body = commands.map(command => {
    const data = typeof command.data.toJSON === 'function' ? command.data.toJSON() : command.data;
    // Các lệnh hiện tại đều dùng dữ liệu và thành viên trong server.
    return { ...data, contexts: [0], integration_types: [0], dm_permission: false };
  });

  // Đăng ký cho server chính (GUILD_ID) để hiển thị NGAY LẬP TỨC (loại bỏ type 4 PRIMARY_ENTRY_POINT)
  if (GUILD_ID) {
    try {
      const guildBody = body.filter(cmd => cmd.type !== 4);
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: guildBody });
      console.log(`[DEPLOY] Registered ${guildBody.length} guild commands for server ${GUILD_ID} (instant sync).`);
    } catch (error) {
      console.warn('[DEPLOY] Could not register guild commands:', error.message);
    }
  }

  if (process.env.CINEMA_ENABLED === 'true') body.push({
    name: 'cinema', description: 'Mở rạp phim VNL Cinema', type: 4, handler: 2,
    contexts: [0], integration_types: [0], dm_permission: false,
  });

  // Đăng ký lệnh toàn cục (global)
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body });
  console.log(`[DEPLOY] Registered ${body.length} global commands for all servers.`);
}

module.exports = { deployCommands };
