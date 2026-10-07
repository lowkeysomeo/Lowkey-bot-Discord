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

initializeDatabase();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.commands = loadCommands();
require('./dashboard/server').startDashboard(client);

const chatCooldowns = new Map();

let voiceTimer = null;


// ==============================
// DEPLOY SLASH COMMANDS
// ==============================

// ==============================
// BOT READY
// ==============================

client.once(
  Events.ClientReady,
  async (readyClient) => {

    console.log(
      `Ready! Logged in as ${readyClient.user.tag}`
    );

    console.log(
      `[DB] ${getDatabasePath()}`
    );


    // ==============================
    // DEPLOY COMMANDS
    // ==============================

    try {
      await deployCommands(client.commands);
    } catch (error) {
      console.error(
        '[DEPLOY] Lỗi reload slash commands:',
        error
      );
    }


    // ==============================
    // MONTHLY SYSTEM
    // ==============================

    try {
      await startMonthlySystem(client);
    } catch (error) {
      console.error(
        '[MONTHLY] Không thể khởi động Monthly System:',
        error
      );
    }


    // ==============================
    // VOICE XP SYSTEM
    // ==============================

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


// ==============================
// CHAT XP SYSTEM
// ==============================

client.on(
  Events.MessageCreate,
  async (message) => {
    if (!message.guild || message.author.bot) return;
    const options = getOptions(message.guild.id);
    if (!options.chatEnabled) return;

 // Không cộng Chat XP trong channel/category bị chặn
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


// ==============================
// SLASH COMMAND HANDLER
// ==============================

client.on(
  Events.InteractionCreate,
  async (interaction) => {
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


// ==============================
// ERROR HANDLERS
// ==============================

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


// ==============================
// LOGIN
// ==============================

client.login(
  process.env.TOKEN
);
