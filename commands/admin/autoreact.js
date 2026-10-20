'use strict';

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const {
  setChannelReaction,
  removeChannelReaction,
  listChannelReactions,
  parseEmojis,
  DEFAULT_QUOTE_EMOJIS,
} = require('../../utils/autoReaction');

const data = new SlashCommandBuilder()
  .setName('autoreact')
  .setDescription('Cấu hình tự động thả 3-4 emoji khi có tin nhắn mới trong kênh')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addSubcommand(sub =>
    sub.setName('caidat')
      .setDescription('Bật hoặc đổi emoji tự động thả cho kênh')
      .addChannelOption(opt =>
        opt.setName('kenh')
          .setDescription('Kênh muốn tự động thả emoji (mặc định: kênh hiện tại)')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(false)
      )
      .addStringOption(opt =>
        opt.setName('emojis')
          .setDescription('Các emoji muốn thả (ví dụ: 🌙 ✨ 🤍 💌). Để trống dùng mặc định 4 emoji quote')
          .setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub.setName('tat')
      .setDescription('Tắt tự động thả emoji cho kênh')
      .addChannelOption(opt =>
        opt.setName('kenh')
          .setDescription('Kênh muốn tắt (mặc định: kênh hiện tại)')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub.setName('danhsach')
      .setDescription('Xem danh sách các kênh đang bật tự động thả emoji')
  );

async function execute(interaction) {
  if (!interaction.inGuild()) {
    return interaction.reply({ content: 'Lệnh này chỉ dùng trong server.', flags: MessageFlags.Ephemeral });
  }

  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
                  interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
  if (!isAdmin) {
    return interaction.reply({
      content: 'Chỉ Quản trị viên (Administrator / Manage Guild) mới có quyền dùng lệnh này.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'caidat') {
    const targetChannel = interaction.options.getChannel('kenh') || interaction.channel;
    const inputEmojis = interaction.options.getString('emojis');

    let emojis = [];
    if (inputEmojis && inputEmojis.trim()) {
      emojis = parseEmojis(inputEmojis.trim());
      if (emojis.length === 0) {
        return interaction.reply({
          content: '❌ Không nhận diện được emoji hợp lệ nào! Vui lòng nhập từ 1-6 emoji (ví dụ: `🌙 ✨ 🤍 💌` hoặc emoji custom của server).',
          flags: MessageFlags.Ephemeral,
        });
      }
    } else {
      emojis = DEFAULT_QUOTE_EMOJIS;
    }

    setChannelReaction(interaction.guildId, targetChannel.id, emojis, 1);

    const embed = new EmbedBuilder()
      .setColor(0x57F287) // Green
      .setTitle('✅ Đã bật Auto Reaction thành công!')
      .setDescription(
        `Từ bây giờ, mỗi khi có tin nhắn mới được gửi vào kênh <#${targetChannel.id}>, bot sẽ tự động thả các emoji sau:\n\n` +
        `👉 **${emojis.join(' ')}** (${emojis.length} emoji)\n\n` +
        `💡 *Mẹo: Bạn có thể đổi emoji bất kỳ lúc nào bằng lệnh \`/autoreact caidat\` hoặc tắt bằng \`/autoreact tat\`.*`
      )
      .setFooter({ text: 'Auto Reaction • VietNam Legacy' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  if (sub === 'tat') {
    const targetChannel = interaction.options.getChannel('kenh') || interaction.channel;
    removeChannelReaction(interaction.guildId, targetChannel.id);

    const embed = new EmbedBuilder()
      .setColor(0xED4245) // Red
      .setTitle('⏹️ Đã tắt Auto Reaction')
      .setDescription(`Đã tắt tính năng tự động thả emoji cho kênh <#${targetChannel.id}>.`)
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  if (sub === 'danhsach') {
    const list = listChannelReactions(interaction.guildId);

    const embed = new EmbedBuilder()
      .setColor(0x5865F2) // Blurple
      .setTitle('📋 Danh Sách Kênh Auto Reaction')
      .setTimestamp();

    let desc = '';
    if (list.length > 0) {
      desc += '**Các kênh đang được cấu hình riêng:**\n';
      for (const item of list) {
        desc += `• <#${item.channelId}>: ${item.emojis.join(' ')}\n`;
      }
      desc += '\n';
    } else {
      desc += 'Chưa có kênh nào được cấu hình thủ công qua `/autoreact caidat`.\n\n';
    }

    desc += '🌙 **Kênh Quotes tự động:** Các kênh có tên chứa chữ `quotes`, `quote` hoặc `trích-dẫn` (ví dụ `# ꒰৯🌙໒꒱：quotes`) sẽ tự động được thả bộ 4 emoji mặc định: ' + DEFAULT_QUOTE_EMOJIS.join(' ') + ' mà không cần cấu hình trước!';

    embed.setDescription(desc);
    return interaction.reply({ embeds: [embed] });
  }
}

module.exports = {
  data,
  execute,
};
