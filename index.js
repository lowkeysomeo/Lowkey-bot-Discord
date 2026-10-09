require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Events,
  MessageFlags,
} = require('discord.js');

const { isXpExcluded } = require('./utils/xpExclusions');
const { sendLevelUp } = require('./utils/sendLevelUp');
const { initializeDatabase, getDatabasePath } = require('./utils/database');
const { loadCommands } = require('./utils/loadCommands');
const { handleConfessionButton } = require('./utils/confessionSystem');
const { addChatXp } = require('./utils/levelSystem');
const { voiceXpTick } = require('./utils/voiceXpTick');
const { deployCommands } = require('./utils/deployCommands');
const { applyBooster, hasBoosterRole } = require('./utils/xpBoost');
const { syncLevelRole } = require('./utils/levelRoles');
const { startMonthlySystem } = require('./utils/monthlySystem');
const { formatXp } = require('./utils/levelMath');
const { getOptions } = require('./utils/customization');
const { music } = require('./utils/musicSystem');
const giveaway = require('./utils/giveawaySystem');


// ==============================
// KIỂM TRA TOKEN
// ==============================

if (!process.env.TOKEN) {
  console.error('[LOGIN] Thiếu TOKEN. Hãy kiểm tra file .env (TOKEN=...).');
  process.exit(1);
}


initializeDatabase();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.commands = loadCommands();

const chatCooldowns = new Map();
let voiceTimer = null;
let cooldownCleanupTimer = null;


// ==============================
// CLIENT EVENTS (MUSIC / LOG)
// ==============================

client.on(Events.Error, (error) => {
  console.error('[CLIENT] Error:', error);
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  try {
    await music.handleVoiceState(oldState, newState);
  } catch (error) {
    console.error('[MUSIC] VoiceStateUpdate error:', error);
  }
});

client.on(Events.GuildDelete, (guild) => {
  try {
    const session = music.session(guild.id);
    if (session) music.destroy(session);
  } catch (error) {
    console.error('[MUSIC] GuildDelete error:', error);
  }
});

// Dashboard lỗi thì không được làm sập cả bot
try {
  Promise.resolve(require('./dashboard/server').startDashboard(client))
    .catch((error) => console.error('[DASHBOARD] Không thể khởi động:', error));
} catch (error) {
  console.error('[DASHBOARD] Không thể khởi động:', error);
}


// ==============================
// HELPER: TRẢ LỜI LỖI AN TOÀN
// ==============================

async function replyError(interaction, content) {
  try {
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply({ content });
    } else if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  } catch {
    // Interaction đã hết hạn hoặc đã bị xử lý, bỏ qua
  }
}


// ==============================
// BOT READY
// ==============================

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
  console.log(`[DB] ${getDatabasePath()}`);

  // Giveaway
  try {
    giveaway.start(client);
  } catch (error) {
    console.error('[GIVEAWAY] Không thể khởi động Giveaway System:', error);
  }

  // Deploy slash commands
  try {
    await deployCommands(client.commands);
  } catch (error) {
    console.error('[DEPLOY] Lỗi reload slash commands:', error);
  }

  // Monthly system
  try {
    await startMonthlySystem(client);
  } catch (error) {
    console.error('[MONTHLY] Không thể khởi động Monthly System:', error);
  }

  // Voice XP system
  if (voiceTimer) clearInterval(voiceTimer);

  voiceTimer = setInterval(() => {
    voiceXpTick(client).catch((error) =>
      console.error('[VOICE XP] Tick error:', error)
    );
  }, 60_000);

  // Dọn cooldown cũ để Map không phình to theo thời gian
  if (cooldownCleanupTimer) clearInterval(cooldownCleanupTimer);

  cooldownCleanupTimer = setInterval(() => {
    const limit = Date.now() - 60 * 60_000;
    for (const [key, last] of chatCooldowns) {
      if (last < limit) chatCooldowns.delete(key);
    }
  }, 30 * 60_000);

  console.log('Voice XP System đã hoạt động.');
});


// ==============================
// CHAT XP SYSTEM
// ==============================

client.on(Events.MessageCreate, async (message) => {
  // Bỏ qua DM, bot, webhook và tin nhắn hệ thống (join, boost, pin...)
  if (!message.guild || message.author.bot || message.system) return;

  try {
    const options = getOptions(message.guild.id);
    if (!options.chatEnabled) return;

    // Không cộng Chat XP trong channel/category bị chặn
    if (isXpExcluded(message.guild.id, message.channel)) return;

    const key = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const last = chatCooldowns.get(key) || 0;

    if (now - last < options.chatCooldown * 1000) return;

    chatCooldowns.set(key, now);

    const member =
      message.member ||
      (await message.guild.members.fetch(message.author.id));

    const baseXp =
      Math.floor(Math.random() * (options.chatMax - options.chatMin + 1)) +
      options.chatMin;

    const gainedXp = applyBooster(baseXp, member);

    const result = addChatXp(
      message.guild.id,
      message.author.id,
      gainedXp,
      { countMonthly: true }
    );

    // Lỗi gán role (thiếu quyền, role cao hơn bot...) không được chặn thông báo lên level
    try {
      await syncLevelRole(member, result.newLevel);
    } catch (error) {
      console.error('[LEVEL ROLE] Sync error:', error);
    }

    if (result.leveledUp) {
      await sendLevelUp(client, member, 'chat', result.profile);
    }

    const boosterText = hasBoosterRole(member) ? ' [BOOSTER]' : '';

    console.log(
      `[CHAT XP] ${message.author.username} +${formatXp(gainedXp)} XP${boosterText} | Level ${result.profile.level}`
    );
  } catch (error) {
    console.error('[CHAT XP] Error:', error);
  }
});


// ==============================
// INTERACTION ROUTES (BUTTON / MODAL)
// ==============================

const interactionRoutes = [
  {
    tag: 'REACTION ROLES',
    test: (i) => i.isButton() && i.customId.startsWith('rr:'),
    run: (i) => require('./utils/reactionRoles').handleButton(i),
    errorMessage: 'Chưa xử lý được role. Vui lòng thử lại.',
  },
  {
    tag: 'CONFESSION',
    test: (i) => i.isModalSubmit() && i.customId.startsWith('confession:submit:'),
    run: (i) => require('./utils/confessionPanel').submitForm(i),
    errorMessage: 'Chưa gửi được confession. Vui lòng mở lại ô viết và thử lại.',
  },
  {
    tag: 'GIVEAWAY',
    test: (i) => i.isButton() && i.customId.startsWith('giveaway:'),
    run: (i) => giveaway.handleButton(i),
    errorMessage: 'Chưa xử lý được lượt tham gia. Vui lòng thử lại sau.',
  },
  {
    tag: 'CONFESSION',
    test: (i) => i.isButton() && i.customId.startsWith('confession:'),
    run: (i) => handleConfessionButton(i),
    errorMessage: 'Có lỗi khi xử lý nút confession.',
  },
];


// ==============================
// INTERACTION HANDLER
// ==============================

client.on(Events.InteractionCreate, async (interaction) => {
  // Button / modal
  const route = interactionRoutes.find((r) => r.test(interaction));

  if (route) {
    try {
      await route.run(interaction);
    } catch (error) {
      console.error(`[${route.tag}] Interaction error:`, error);
      await replyError(interaction, route.errorMessage);
    }
    return;
  }

  // Autocomplete (nếu command có hỗ trợ)
  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (!command || typeof command.autocomplete !== 'function') return;

    try {
      await command.autocomplete(interaction);
    } catch (error) {
      console.error(`[AUTOCOMPLETE] /${interaction.commandName}:`, error);
    }
    return;
  }

  // Slash command
  if (!interaction.isChatInputCommand()) return;

  if (!interaction.inGuild()) {
    return interaction
      .reply({
        content: 'Lệnh này chỉ dùng trong server.',
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
  }

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`[COMMAND] /${interaction.commandName}:`, error);
    await replyError(interaction, 'Có lỗi xảy ra khi thực hiện command này.');
  }
});


// ==============================
// ERROR HANDLERS
// ==============================

process.on('unhandledRejection', (error) => {
  console.error('[UNHANDLED REJECTION]', error);
});

process.on('uncaughtException', (error) => {
  console.error('[UNCAUGHT EXCEPTION]', error);
});


// ==============================
// TẮT BOT AN TOÀN
// ==============================

function shutdown(signal) {
  console.log(`[SHUTDOWN] Nhận ${signal}, đang tắt bot...`);
  if (voiceTimer) clearInterval(voiceTimer);
  if (cooldownCleanupTimer) clearInterval(cooldownCleanupTimer);
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));


// ==============================
// LOGIN
// ==============================

client.login(process.env.TOKEN).catch((error) => {
  console.error('[LOGIN] Không thể đăng nhập:', error);
  process.exit(1);
});