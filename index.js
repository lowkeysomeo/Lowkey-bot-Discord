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
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.commands = loadCommands();
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
    if (!message.guild || message.author.bot) return;
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
