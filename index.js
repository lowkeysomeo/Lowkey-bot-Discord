// ========================================
// ENV
// ========================================

require("dotenv").config();


// ========================================
// IMPORTS
// ========================================

const fs = require("node:fs");
const path = require("node:path");

const {
    Client,
    Collection,
    Events,
    GatewayIntentBits,
    MessageFlags,
    EmbedBuilder
} = require("discord.js");


// ========================================
// LEVEL SYSTEM
// ========================================

const {
    addXp
} = require("./utils/levelSystem");

const {
    addVoiceXp
} = require("./utils/voiceLevelSystem");

const {
    updateLevelRole
} = require("./utils/levelRoles");

const {
    updateVoiceRole
} = require("./utils/voiceRoles");


// ========================================
// CLIENT
// ========================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates
    ]
});

client.commands = new Collection();


// ========================================
// CHAT XP COOLDOWN
// ========================================

const xpCooldown = new Map();


// ========================================
// LOAD COMMANDS
// ========================================

const foldersPath = path.join(
    __dirname,
    "commands"
);

const commandFolders =
    fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath =
        path.join(
            foldersPath,
            folder
        );

    // Bỏ qua nếu không phải folder
    if (
        !fs.statSync(commandsPath)
            .isDirectory()
    ) {
        continue;
    }

    const commandFiles =
        fs.readdirSync(commandsPath)
            .filter(
                file =>
                    file.endsWith(".js")
            );

    for (const file of commandFiles) {
        const filePath =
            path.join(
                commandsPath,
                file
            );

        try {
            const command =
                require(filePath);

            if (
                "data" in command &&
                "execute" in command
            ) {
                client.commands.set(
                    command.data.name,
                    command
                );

                console.log(
                    `✅ Loaded command: /${command.data.name}`
                );
            } else {
                console.log(
                    `⚠️ Command ${filePath} thiếu "data" hoặc "execute".`
                );
            }
        } catch (error) {
            console.error(
                `❌ Không load được command ${filePath}:`,
                error
            );
        }
    }
}


// ========================================
// VOICE XP FUNCTION
// ========================================

let voiceTickRunning = false;

async function runVoiceXpTick() {
    // Tránh 2 vòng chạy chồng nhau
    if (voiceTickRunning) return;

    voiceTickRunning = true;

    try {
        for (
            const guild
            of client.guilds.cache.values()
        ) {
            const voiceChannels =
                guild.channels.cache.filter(
                    channel =>
                        channel.isVoiceBased()
                );

            for (
                const channel
                of voiceChannels.values()
            ) {
                // Chỉ đếm người thật
                const humans =
                    channel.members.filter(
                        member =>
                            !member.user.bot
                    );

                if (humans.size === 0) {
                    continue;
                }

                // ============================
                // VOICE XP
                // 1 người = 1 XP/phút
                // 2+ người = 5 XP/phút
                // ============================

                const xpGain =
                    humans.size === 1
                        ? 1
                        : 5;

                for (
                    const member
                    of humans.values()
                ) {
                    // Server Deaf không nhận XP
                    if (
                        member.voice.serverDeaf
                    ) {
                        continue;
                    }

                    const result =
                        addVoiceXp(
                            guild.id,
                            member.id,
                            xpGain
                        );

                    console.log(
                        `[VOICE XP] ${member.user.username} +${xpGain} XP | Level ${result.level} | ${result.xp} XP`
                    );


                    // ============================
                    // VOICE LEVEL UP
                    // ============================

                    if (
                        result.levelUps > 0
                    ) {
                        const newVoiceRank =
                            await updateVoiceRole(
                                member,
                                result.level
                            );

                        const levelChannel =
                            guild.channels.cache.get(
                                process.env
                                    .LEVEL_CHANNEL_ID
                            );

                        if (
                            levelChannel &&
                            levelChannel
                                .isTextBased()
                        ) {
                            const embed =
                                new EmbedBuilder()

                                    .setColor(
                                        "#E53935"
                                    )

                                    .setAuthor({
                                        name:
                                            "VietNam Legacy • Voice Level Up",
                                        iconURL:
                                            guild.iconURL() ||
                                            undefined
                                    })

                                    .setTitle(
                                        "🎙️ VOICE LEVEL UP!"
                                    )

                                    .setDescription(
                                        `Chúc mừng <@${member.id}> nha! ❤️\n\n` +
                                        `Bạn vừa đạt **Voice Level ${result.level}** tại **VietNam Legacy**.\n` +
                                        `Cảm ơn bạn đã dành thời gian trò chuyện và kết nối cùng mọi người!`
                                    )

                                    .setThumbnail(
                                        member.user
                                            .displayAvatarURL({
                                                size: 256
                                            })
                                    )

                                    .addFields({
                                        name:
                                            "🎙️ Voice Level",
                                        value:
                                            `**Level ${result.level}**`,
                                        inline:
                                            true
                                    });


                            // Nếu có Voice Rank
                            if (
                                newVoiceRank
                                    ?.role
                            ) {
                                embed.addFields({
                                    name:
                                        "✨ Voice Rank",
                                    value:
                                        `${newVoiceRank.role}`,
                                    inline:
                                        true
                                });
                            }


                            embed
                                .setFooter({
                                    text:
                                        "Cùng voice vui vẻ và chinh phục level tiếp theo nhé ❤️"
                                })

                                .setTimestamp();


                            await levelChannel.send({
                                content:
                                    `<@${member.id}>`,
                                embeds: [
                                    embed
                                ]
                            });
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error(
            "❌ Lỗi Voice XP System:",
            error
        );
    } finally {
        voiceTickRunning = false;
    }
}


// ========================================
// BOT READY
// ========================================

client.once(
    Events.ClientReady,
    async readyClient => {

        console.log(
            `✅ Ready! Logged in as ${readyClient.user.tag}`
        );


        // ================================
        // DEPLOY SLASH COMMANDS
        // ================================

        try {
            const deploy =
                require("./deploy");

            await deploy(
                readyClient
            );
        } catch (error) {
            console.error(
                "❌ Lỗi deploy commands:",
                error
            );
        }


        // ================================
        // START VOICE XP
        // ================================

        setInterval(
            runVoiceXpTick,
            60 * 1000
        );

        console.log(
            "🎙️ Voice XP System đã hoạt động."
        );
    }
);


// ========================================
// SLASH COMMAND HANDLER
// ========================================

client.on(
    Events.InteractionCreate,
    async interaction => {

        if (
            !interaction
                .isChatInputCommand()
        ) {
            return;
        }

        const command =
            interaction.client.commands.get(
                interaction.commandName
            );

        if (!command) {
            console.error(
                `❌ Không tìm thấy command /${interaction.commandName}`
            );

            return;
        }

        try {
            await command.execute(
                interaction
            );
        } catch (error) {
            console.error(
                `❌ Lỗi command /${interaction.commandName}:`,
                error
            );


            const errorMessage = {
                content:
                    "❌ Có lỗi xảy ra khi thực hiện lệnh này!",
                flags:
                    MessageFlags.Ephemeral
            };


            try {
                if (
                    interaction.replied ||
                    interaction.deferred
                ) {
                    await interaction
                        .followUp(
                            errorMessage
                        );
                } else {
                    await interaction
                        .reply(
                            errorMessage
                        );
                }
            } catch (
                replyError
            ) {
                console.error(
                    "❌ Không gửi được error reply:",
                    replyError
                );
            }
        }
    }
);


// ========================================
// CHAT LEVEL SYSTEM
// ========================================

client.on(
    Events.MessageCreate,
    async message => {

        // Không phải server
        if (!message.guild) {
            return;
        }

        // Không tính bot
        if (message.author.bot) {
            return;
        }


        // ================================
        // COOLDOWN 60 GIÂY
        // ================================

        const cooldownTime =
            60 * 1000;

        const key =
            `${message.guild.id}:${message.author.id}`;

        const lastXpTime =
            xpCooldown.get(key);


        if (
            lastXpTime &&
            Date.now() -
                lastXpTime <
                cooldownTime
        ) {
            return;
        }


        xpCooldown.set(
            key,
            Date.now()
        );


        // ================================
        // RANDOM CHAT XP 10 - 20
        // ================================

        const xpGain =
            Math.floor(
                Math.random() * 11
            ) + 10;


        const result =
            addXp(
                message.guild.id,
                message.author.id,
                xpGain
            );


        console.log(
            `[CHAT XP] ${message.author.username} +${xpGain} XP | Level ${result.level} | ${result.xp} XP`
        );


        // ================================
        // CHAT LEVEL UP
        // ================================

        if (
            result.levelUps > 0
        ) {
            const member =
                await message.guild.members
                    .fetch(
                        message.author.id
                    )
                    .catch(
                        () => null
                    );


            let newRank = null;


            if (member) {
                newRank =
                    await updateLevelRole(
                        member,
                        result.level
                    );
            }


            const levelChannel =
                message.guild.channels.cache.get(
                    process.env
                        .LEVEL_CHANNEL_ID
                );


            if (
                !levelChannel ||
                !levelChannel
                    .isTextBased()
            ) {
                console.log(
                    "⚠️ Không tìm thấy kênh thông báo level."
                );

                return;
            }


            const embed =
                new EmbedBuilder()

                    .setColor(
                        "#E53935"
                    )

                    .setAuthor({
                        name:
                            "VietNam Legacy • Level Up",
                        iconURL:
                            message.guild
                                .iconURL() ||
                            undefined
                    })

                    .setTitle(
                        "🎉 LEVEL UP!"
                    )

                    .setDescription(
                        `Chúc mừng <@${message.author.id}> nha! ❤️\n\n` +
                        `Bạn vừa đạt **Level ${result.level}** tại **VietNam Legacy**.\n` +
                        `Cảm ơn bạn đã luôn trò chuyện và đồng hành cùng mọi người!`
                    )

                    .setThumbnail(
                        message.author
                            .displayAvatarURL({
                                size: 256
                            })
                    )

                    .addFields({
                        name:
                            "🏆 Level hiện tại",
                        value:
                            `**Level ${result.level}**`,
                        inline:
                            true
                    });


            // Nếu có rank
            if (
                newRank?.role
            ) {
                embed.addFields({
                    name:
                        "✨ Rank hiện tại",
                    value:
                        `${newRank.role}`,
                    inline:
                        true
                });
            }


            embed
                .setFooter({
                    text:
                        "Cùng hoạt động và chinh phục rank tiếp theo nhé ❤️"
                })

                .setTimestamp();


            await levelChannel.send({
                content:
                    `<@${message.author.id}>`,
                embeds: [
                    embed
                ]
            });
        }
    }
);


// ========================================
// ERROR LOG
// ========================================

process.on(
    "unhandledRejection",
    error => {
        console.error(
            "❌ Unhandled Rejection:",
            error
        );
    }
);


process.on(
    "uncaughtException",
    error => {
        console.error(
            "❌ Uncaught Exception:",
            error
        );
    }
);


// ========================================
// LOGIN
// ========================================

client.login(
    process.env.TOKEN
);