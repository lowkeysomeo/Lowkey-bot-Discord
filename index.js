require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
} = require('discord.js');

const { sendLevelUp } = require('./utils/sendLevelUp');
const { initializeDatabase, getDatabasePath } = require('./utils/database');
const { loadCommands } = require('./utils/loadCommands');
const { addChatXp } = require('./utils/levelSystem');
const { addVoiceXp } = require('./utils/voiceLevelSystem');
const { applyBooster, hasBoosterRole } = require('./utils/xpBoost');
const { syncLevelRole } = require('./utils/levelRoles');
const { syncVoiceLevelRole } = require('./utils/voiceRoles');
const { startMonthlySystem } = require('./utils/monthlySystem');
const { formatXp } = require('./utils/levelMath');

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
const CHAT_COOLDOWN_MS = 60_000;

let voiceTimer = null;


// ==============================
// DEPLOY SLASH COMMANDS
// ==============================

async function deployGuildCommands() {
  if (
    !process.env.TOKEN ||
    !process.env.CLIENT_ID ||
    !process.env.GUILD_ID
  ) {
    console.warn(
      '[DEPLOY] Thiếu TOKEN/CLIENT_ID/GUILD_ID, bỏ qua reload slash commands.'
    );
    return;
  }

  const rest = new REST({ version: '10' }).setToken(
    process.env.TOKEN
  );

  const commandData = client.commands.map((command) =>
    typeof command.data.toJSON === 'function'
      ? command.data.toJSON()
      : command.data
  );

  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID
    ),
    {
      body: commandData,
    }
  );

  console.log(
    `Successfully reloaded ${commandData.length} application [/] commands.`
  );
}



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
      await deployGuildCommands();
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


    voiceTimer = setInterval(
      async () => {

        try {
          const guildId =
            process.env.GUILD_ID;

          if (!guildId) {
            return;
          }


          const guild =
            client.guilds.cache.get(
              guildId
            );

          if (!guild) {
            return;
          }


          for (
            const channel
            of guild.channels.cache.values()
          ) {

            if (
              !channel.isVoiceBased?.()
            ) {
              continue;
            }


            const humans =
              channel.members.filter(
                (member) =>
                  !member.user.bot
              );


            if (
              humans.size === 0
            ) {
              continue;
            }


            const baseXp =
              humans.size >= 2
                ? 5
                : 1;


            for (
              const member
              of humans.values()
            ) {

              if (
                member.voice.serverDeaf
              ) {
                continue;
              }


              const gainedXp =
                applyBooster(
                  baseXp,
                  member
                );


              const result =
                addVoiceXp(
                  guild.id,
                  member.id,
                  gainedXp,
                  {
                    minutes: 1,
                    countMonthly: true,
                  }
                );


              if (
                result.leveledUp
              ) {

                await syncVoiceLevelRole(
                  member,
                  result.newLevel
    );


    await sendLevelUp(
  client,
  member,
  'voice',
  result.profile
);
              }


              const boosterText =
                hasBoosterRole(member)
                  ? ' [BOOSTER +10%]'
                  : '';


              console.log(
                `[VOICE XP] ${member.user.username} +${formatXp(gainedXp)} XP${boosterText} | Level ${result.profile.level}`
              );
            }
          }

        } catch (error) {

          console.error(
            '[VOICE XP] Tick error:',
            error
          );
        }

      },
      60_000
    );


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

    if (
      !message.guild ||
      message.author.bot
    ) {
      return;
    }


    if (
      message.guild.id !==
      process.env.GUILD_ID
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
      CHAT_COOLDOWN_MS
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
          Math.random() * 11
        ) + 10;


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


      if (
        result.leveledUp
      ) {

        await syncLevelRole(
          member,
          result.newLevel
        );


        await sendLevelUp(
  client,
  member,
  'chat',
  result.profile
);
      }


      const boosterText =
        hasBoosterRole(member)
          ? ' [BOOSTER +10%]'
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

    if (
      !interaction.isChatInputCommand()
    ) {
      return;
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