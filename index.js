require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Events,
} = require('discord.js');

const {
  isXpExcluded,
} = require('./utils/xpExclusions');

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


initializeDatabase();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = loadCommands();
require('./utils/securitySystem').start(client);
client.on(Events.GuildMemberAdd, async member => {
  try { require('./utils/inviteSystem').joined(member); } catch (e) { console.error('[INVITES]', e.message); }
  try { await require('./utils/receptionistNotice').notifyReceptionist(member); } catch (e) { console.error('[RECEPTIONIST]', e.message); }
});
client.on(Events.InviteCreate, invite => require('./utils/inviteSystem').created(invite));
client.on(Events.InviteDelete, invite => require('./utils/inviteSystem').deleted(invite));
client.on(Events.GuildCreate, guild => {
  if(getOptions(guild.id).inviteEnabled)require('./utils/inviteSystem').prime(guild).catch(error=>console.warn('[INVITES]',error.message));
});
client.on(Events.GuildMemberUpdate, (before, after) => {
  require('./utils/roleNotifications').handleRoleUpdate(before, after)
    .catch(error => console.error('[ROLE NOTICE]', error.message));
});
client.on(Events.VoiceStateUpdate, (oldState, newState) => music.handleVoiceState(oldState, newState));
client.on(Events.GuildDelete, guild => { const session = music.session(guild.id); if (session) music.destroy(session); });
const dashboardServer = require('./dashboard/server').startDashboard(client);
client.on(Events.Error, error => console.error('[DISCORD]', error.message));

const chatCooldowns = new Map();

let voiceTimer = null;


// Khởi động các tính năng sau khi bot kết nối

client.once(
  Events.ClientReady,
  async (readyClient) => {

    console.log(
      `Ready! Logged in as ${readyClient.user.tag}`
    );

    console.log(
      `[DB] ${getDatabasePath()}`
    );
    giveaway.start(client);
    require('./utils/reactionRoles').start(client);
    require('./utils/inviteSystem').start(client);
    require('./utils/questScheduler').start(client);
    require('./utils/cinemaScheduler').start(client);
    require('./utils/gameTimeWorker').initGametimeAutoResume(client);
    require('./utils/varietyTokenWorker').initVarietyAutoResume(client);
    require('./utils/streamTimeWorker').initStreamtimeAutoResume(client);
    require('./utils/questShop').ensureShopPanel(client).catch(err => console.warn('[QUEST SHOP]', err.message));
    // Nạp thành viên để phân biệt role có sẵn với role vừa được cấp.
    for (const guild of client.guilds.cache.values()) {
      if (getOptions(guild.id).roleNoticeEnabled) {
        guild.members.fetch().catch(error => console.error('[ROLE NOTICE] Chưa nạp được thành viên:', error.message));
      }
    }


    // Cập nhật danh sách lệnh

    try {
      await deployCommands(client.commands);
    } catch (error) {
      console.error(
        '[DEPLOY] Lỗi reload slash commands:',
        error
      );
    }


    // Chốt bảng xếp hạng hằng tháng

    try {
      await startMonthlySystem(client);
    } catch (error) {
      console.error(
        '[MONTHLY] Không thể khởi động Monthly System:',
        error
      );
    }


    // Cộng XP khi tham gia voice

    if (voiceTimer) {
      clearInterval(voiceTimer);
    }


    voiceTimer = setInterval(() => {
      voiceXpTick(client).catch(error => console.error('[VOICE XP] Tick error:', error));
    }, 60_000);

    console.log(
      'Voice XP System đã hoạt động.'
    );
  }
);


// Cộng XP khi nhắn tin

client.on(
  Events.MessageCreate,
  async (message) => {
    if (!message.guild) return;
    if (await require('./utils/securitySystem').message(message)) return;
    if (message.webhookId) return;
    if (message.author.bot) return;

    // Tự động thả emoji vào các kênh cấu hình (ví dụ: kênh quotes)
    try {
      require('./utils/autoReaction').handleMessage(message);
    } catch (err) {
      console.error('[AUTO-REACT ERROR]', err);
    }

    // Xử lý lệnh moderation gõ trực tiếp trong chat (vnban, vnkick, vntimeout, vnuntimeout)
    if (await require('./utils/chatModeration').handleChatModeration(message)) return;

    const options = getOptions(message.guild.id);
    if (!options.chatEnabled) return;

 // Không cộng XP ở kênh hoặc danh mục đã loại trừ.
if (
  isXpExcluded(
    message.guild.id,
    message.channel
  )
) {
  return;
}




    const key =
      `${message.guild.id}:${message.author.id}`;


    const now =
      Date.now();


    const last =
      chatCooldowns.get(key) || 0;


    if (
      now - last <
      options.chatCooldown * 1000
    ) {
      return;
    }


    chatCooldowns.set(
      key,
      now
    );


    try {

      const member =
        message.member ||
        await message.guild.members.fetch(
          message.author.id
        );


      const baseXp =
        Math.floor(
          Math.random() * (options.chatMax - options.chatMin + 1)
        ) + options.chatMin;


      const gainedXp =
        applyBooster(
          baseXp,
          member
        );


      const result =
        addChatXp(
          message.guild.id,
          message.author.id,
          gainedXp,
          {
            countMonthly: true,
          }
        );


      await syncLevelRole(member, result.newLevel);
      if (
        result.leveledUp
      ) {



        await sendLevelUp(
  client,
  member,
  'chat',
  result.profile
);
      }


      const boosterText =
        hasBoosterRole(member)
          ? ' [BOOSTER]'
          : '';


      console.log(
        `[CHAT XP] ${message.author.username} +${formatXp(gainedXp)} XP${boosterText} | Level ${result.profile.level}`
      );

    } catch (error) {

      console.error(
        '[CHAT XP] Error:',
        error
      );
    }
  }
);


// Xử lý lệnh và tương tác

client.on(
  Events.InteractionCreate,
  async (interaction) => {
    if ((interaction.isStringSelectMenu?.() || interaction.isUserSelectMenu?.() || interaction.isButton?.() || interaction.isModalSubmit?.()) && interaction.customId?.startsWith('ticket:')) {
      try { await require('./utils/ticketSystem').handleInteraction(interaction); }
      catch (error) {
        console.error('[TICKET INTERACTION ERROR]', error);
        const payload = { content: 'Có lỗi xảy ra khi xử lý ticket. Vui lòng thử lại sau.', flags: 64 };
        if (interaction.deferred) await interaction.editReply(payload).catch(() => {});
        else if (!interaction.replied) await interaction.reply(payload).catch(() => {});
      }
      return;
    }
    if (interaction.isButton?.() && interaction.customId?.startsWith('security:')) {
      try { await require('./utils/securityReview').handleButton(interaction); }
      catch(error) {
        console.error('[SECURITY REVIEW]',error.message);
        const payload={content:'Chưa xử lý được xét duyệt. Vui lòng thử lại.',flags:64};
        if(interaction.deferred)await interaction.editReply(payload).catch(()=>{});else await interaction.reply(payload).catch(()=>{});
      }
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith('rr:')) {
      try { await require('./utils/reactionRoles').handleButton(interaction); }
      catch { const p={content:'Chưa xử lý được role. Vui lòng thử lại.',flags:64}; if(interaction.deferred)await interaction.editReply(p).catch(()=>{});else await interaction.reply(p).catch(()=>{}); }
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith('confession:submit:')) {
      try { await require('./utils/confessionPanel').submitForm(interaction); }
      catch {
        const payload = {content:'Chưa gửi được confession. Vui lòng mở lại ô viết và thử lại.',flags:64};
        if (interaction.deferred) await interaction.editReply(payload).catch(() => {});
        else await interaction.reply(payload).catch(() => {});
      }
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith('giveaway:')) {
      try { await giveaway.handleButton(interaction); }
      catch {
        const payload = { content: 'Chưa xử lý được lượt tham gia. Vui lòng thử lại sau.', flags: 64 };
        if (interaction.deferred) await interaction.editReply(payload).catch(() => {});
        else await interaction.reply(payload).catch(() => {});
      }
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith('confession:')) {
      try {
        await handleConfessionButton(interaction);
      } catch (error) {
        console.error('[CONFESSION] Button error:', error);
        const payload = { content: 'Có lỗi khi xử lý nút confession.', flags: 64 };
        if (interaction.deferred) await interaction.editReply(payload).catch(() => {});
        else if (interaction.replied) await interaction.followUp(payload).catch(() => {});
        else await interaction.reply(payload).catch(() => {});
      }
      return;
    }

    if ((interaction.isStringSelectMenu?.() || interaction.isButton?.()) && interaction.customId?.startsWith('musiclocal:')) {
      try { await require('./commands/music/musiclocal').handleInteraction(interaction); }
      catch (error) {
        console.error('[MUSIC LOCAL INTERACTION ERROR]', error);
        const payload = { content: 'Có lỗi xảy ra khi thao tác kho nhạc. Vui lòng thử lại.', flags: 64 };
        if (interaction.deferred) await interaction.editReply(payload).catch(() => {});
        else if (!interaction.replied) await interaction.reply(payload).catch(() => {});
      }
      return;
    }

    if (interaction.isButton?.() && interaction.customId?.startsWith('quest:')) {
      try { await require('./utils/questManager').handleButtonInteraction(interaction); }
      catch (error) {
        console.error('[QUEST BUTTON ERROR]', error);
        const payload = { content: 'Có lỗi xảy ra khi xử lý thao tác Quest. Vui lòng thử lại.', flags: 64 };
        if (interaction.deferred) await interaction.editReply(payload).catch(() => {});
        else if (!interaction.replied) await interaction.reply(payload).catch(() => {});
      }
      return;
    }

    if (interaction.isModalSubmit?.() && interaction.customId?.startsWith('quest:')) {
      try { await require('./utils/questManager').handleModalInteraction(interaction); }
      catch (error) {
        console.error('[QUEST MODAL ERROR]', error);
        const payload = { content: 'Có lỗi xảy ra khi xử lý Auto Quest bằng Token. Vui lòng thử lại.', flags: 64 };
        if (interaction.deferred) await interaction.editReply(payload).catch(() => {});
        else if (!interaction.replied) await interaction.reply(payload).catch(() => {});
      }
      return;
    }

    if (interaction.customId?.startsWith('qshop:')) {
      try { await require('./utils/questShop').handleShopInteraction(interaction, client); }
      catch (error) {
        console.error('[QUEST SHOP ERROR]', error);
        const payload = { content: 'Có lỗi xảy ra khi thao tác trên Cửa Hàng Quest. Vui lòng thử lại sau.', flags: 64 };
        if (interaction.deferred) await interaction.editReply(payload).catch(() => {});
        else if (interaction.replied) await interaction.followUp(payload).catch(() => {});
        else await interaction.reply(payload).catch(() => {});
      }
      return;
    }

    if (interaction.isStringSelectMenu?.() && interaction.customId?.startsWith('cinema:')) {
      try { await require('./commands/fun/cinema').handleSelect(interaction); }
      catch (error) {
        console.error('[CINEMA INTERACTION ERROR]', error);
        const payload = { content: 'Có lỗi xảy ra khi phát phim. Vui lòng thử lại sau.', flags: 64 };
        if (interaction.deferred) await interaction.editReply(payload).catch(() => {});
        else if (interaction.replied) await interaction.followUp(payload).catch(() => {});
        else await interaction.reply(payload).catch(() => {});
      }
      return;
    }

    if (interaction.isAutocomplete?.()) {
      const command = client.commands.get(interaction.commandName);
      if (command?.autocomplete) {
        try { await command.autocomplete(interaction); } catch {}
      }
      return;
    }

    if (
      !interaction.isChatInputCommand()
    ) {
      return;
    }


    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'Lệnh này chỉ dùng trong server.', flags: 64 });
    }

    const command =
      client.commands.get(
        interaction.commandName
      );


    if (!command) {
      return;
    }


    try {

      await command.execute(
        interaction
      );

    } catch (error) {

      console.error(
        `[COMMAND] /${interaction.commandName}:`,
        error
      );


      const payload = {
        content:
          'Có lỗi xảy ra khi thực hiện command này.',

        ephemeral: true,
      };


      if (
        interaction.replied ||
        interaction.deferred
      ) {

        await interaction
          .followUp(payload)
          .catch(() => {});

      } else {

        await interaction
          .reply(payload)
          .catch(() => {});
      }
    }
  }
);


// Ghi lại lỗi chưa được xử lý

process.on(
  'unhandledRejection',
  (error) => {

    console.error(
      '[UNHANDLED REJECTION]',
      error
    );
  }
);


process.on(
  'uncaughtException',
  (error) => {

    console.error(
      '[UNCAUGHT EXCEPTION]',
      error
    );
  }
);


// Kết nối bot với Discord

client.login(process.env.TOKEN).catch(error => {
  // Dừng tiến trình nếu không đăng nhập được để Railway biết bot đã lỗi.
  console.error('[LOGIN] Không kết nối được Discord:', error.message);
  if (voiceTimer) clearInterval(voiceTimer);
  client.destroy();
  dashboardServer?.close();
  process.exitCode = 1;
});

// Xử lý tắt bot an toàn (Graceful shutdown) khi Railway deploy container mới hoặc SIGTERM/SIGINT
let isShuttingDown = false;
async function handleShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[SHUTDOWN] Nhận tín hiệu ${signal}. Đang dọn dẹp các kết nối an toàn...`);

  if (voiceTimer) {
    try { clearInterval(voiceTimer); } catch (_) {}
  }

  // Dọn dẹp an toàn các phiên cày game time và lưu thời gian đã tích lũy
  try {
    const { activeSessions: gtSessions } = require('./utils/gameTimeWorker');
    if (gtSessions && typeof gtSessions.forEach === 'function') {
      gtSessions.forEach((session, uid) => {
        try {
          if (session.timer) clearInterval(session.timer);
          session.running = false;
          const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
          session.client?.disconnect(true);
          try {
            const { getDb } = require('./utils/database');
            const db = getDb();
            const row = db.prepare('SELECT accumulated_seconds FROM gametime_sessions WHERE user_id = ?').get(uid);
            if (row) {
              const updatedSec = (row.accumulated_seconds || 0) + elapsed;
              db.prepare('UPDATE gametime_sessions SET accumulated_seconds = ?, current_session_seconds = 0 WHERE user_id = ?').run(updatedSec, uid);
            }
          } catch (_) {}
        } catch (_) {}
      });
      gtSessions.clear();
    }
  } catch (_) {}

  // Dọn dẹp an toàn các phiên cày variety token
  try {
    const { activeSessions: varSessions } = require('./utils/varietyTokenWorker');
    if (varSessions && typeof varSessions.forEach === 'function') {
      varSessions.forEach((session) => {
        try {
          if (session.timer) clearTimeout(session.timer);
          session.running = false;
          session.client?.disconnect(true);
        } catch (_) {}
      });
      varSessions.clear();
    }
  } catch (_) {}

  // Dọn dẹp an toàn các phiên cày stream badge
  try {
    const { activeSessions: streamSessions } = require('./utils/streamTimeWorker');
    if (streamSessions && typeof streamSessions.forEach === 'function') {
      streamSessions.forEach((session, uid) => {
        try {
          if (session.timer) clearInterval(session.timer);
          session.running = false;
          const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
          session.client?.disconnect(true);
          if (session.connection && typeof session.connection.destroy === 'function') {
            session.connection.destroy();
          }
          try {
            const { getDb } = require('./utils/database');
            const db = getDb();
            const row = db.prepare('SELECT accumulated_seconds FROM stream_sessions WHERE user_id = ?').get(uid);
            if (row) {
              const updatedSec = (row.accumulated_seconds || 0) + elapsed;
              db.prepare('UPDATE stream_sessions SET accumulated_seconds = ?, current_session_seconds = 0 WHERE user_id = ?').run(updatedSec, uid);
            }
          } catch (_) {}
        } catch (_) {}
      });
      streamSessions.clear();
    }
  } catch (_) {}

  try {
    dashboardServer?.close();
  } catch (_) {}

  try {
    await client.destroy();
  } catch (_) {}

  console.log('[SHUTDOWN] Đã ngắt tất cả kết nối Gateway & Discord. Tiến trình dừng an toàn.');
  process.exit(0);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

