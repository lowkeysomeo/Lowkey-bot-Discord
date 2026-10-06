const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} = require('discord.js');

const {
  addXpExclusion,
  removeXpExclusion,
  listXpExclusions,
} = require('../../utils/xpExclusions');

module.exports.data = new SlashCommandBuilder()
  .setName('xpexclude')
  .setDescription('Quản lý kênh không được nhận XP')
  .setDefaultMemberPermissions(
    PermissionFlagsBits.Administrator
  )

  .addSubcommand((subcommand) =>
    subcommand
      .setName('add')
      .setDescription(
        'Thêm kênh hoặc Category vào danh sách không nhận XP'
      )
      .addChannelOption((option) =>
        option
          .setName('target')
          .setDescription(
            'Text channel, Voice room hoặc Category'
          )
          .addChannelTypes(
            ChannelType.GuildText,
            ChannelType.GuildVoice,
            ChannelType.GuildCategory,
            ChannelType.GuildAnnouncement,
            ChannelType.GuildStageVoice,
            ChannelType.GuildForum
          )
          .setRequired(true)
      )
  )

  .addSubcommand((subcommand) =>
    subcommand
      .setName('remove')
      .setDescription(
        'Cho phép kênh hoặc Category nhận XP trở lại'
      )
      .addChannelOption((option) =>
        option
          .setName('target')
          .setDescription(
            'Kênh hoặc Category muốn bỏ chặn'
          )
          .addChannelTypes(
            ChannelType.GuildText,
            ChannelType.GuildVoice,
            ChannelType.GuildCategory,
            ChannelType.GuildAnnouncement,
            ChannelType.GuildStageVoice,
            ChannelType.GuildForum
          )
          .setRequired(true)
      )
  )

  .addSubcommand((subcommand) =>
    subcommand
      .setName('list')
      .setDescription(
        'Xem danh sách kênh không được nhận XP'
      )
  );

module.exports.execute = async (interaction) => {
  const subcommand =
    interaction.options.getSubcommand();

  // ==========================
  // ADD
  // ==========================
  if (subcommand === 'add') {
    const target =
      interaction.options.getChannel(
        'target',
        true
      );

    const isCategory =
      target.type === ChannelType.GuildCategory;

    const added = addXpExclusion(
      interaction.guild.id,
      target.id,
      isCategory
        ? 'category'
        : 'channel'
    );

    return interaction.reply({
      content: added
        ? (
          isCategory
            ? `📁 Đã tắt XP cho Category **${target.name}** và toàn bộ kênh bên trong.`
            : `🚫 Đã tắt XP trong **${target.name}**.`
        )
        : `⚠️ **${target.name}** đã nằm trong danh sách tắt XP rồi.`,

      flags: MessageFlags.Ephemeral,
    });
  }

  // ==========================
  // REMOVE
  // ==========================
  if (subcommand === 'remove') {
    const target =
      interaction.options.getChannel(
        'target',
        true
      );

    const removed =
      removeXpExclusion(
        interaction.guild.id,
        target.id
      );

    return interaction.reply({
      content: removed
        ? `✅ Đã bật XP trở lại cho **${target.name}**.`
        : `⚠️ **${target.name}** không nằm trong danh sách tắt XP.`,

      flags: MessageFlags.Ephemeral,
    });
  }

  // ==========================
  // LIST
  // ==========================
  if (subcommand === 'list') {
    const rows =
      listXpExclusions(
        interaction.guild.id
      );

    if (rows.length === 0) {
      return interaction.reply({
        content:
          '✅ Hiện tại không có kênh nào bị tắt XP.',

        flags: MessageFlags.Ephemeral,
      });
    }

    const lines = rows.map(
      (row, index) => {
        const channel =
          interaction.guild.channels.cache.get(
            row.targetId
          );

        if (!channel) {
          return (
            `${index + 1}. 🗑️ Kênh đã bị xóa ` +
            `(\`${row.targetId}\`)`
          );
        }

        const icon =
          row.targetType === 'category'
            ? '📁'
            : channel.isVoiceBased?.()
              ? '🔊'
              : '💬';

        return (
          `${index + 1}. ${icon} **${channel.name}** ` +
          `(\`${channel.id}\`)`
        );
      }
    );

    return interaction.reply({
      content:
        `### 🚫 DANH SÁCH KHÔNG NHẬN XP\n\n` +
        lines.join('\n'),

      flags: MessageFlags.Ephemeral,
    });
  }
};