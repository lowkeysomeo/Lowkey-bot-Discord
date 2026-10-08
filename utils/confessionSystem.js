const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
  EmbedBuilder, MessageFlags, PermissionFlagsBits,
} = require('discord.js');
const store = require('./confessionStore');
const { getOptions, template } = require('./customization');
const { getDb } = require('./database');
function cooldownTable() {
  const db = getDb();
  db.exec('CREATE TABLE IF NOT EXISTS confession_cooldowns (guild_id TEXT, user_id TEXT, sent_at INTEGER NOT NULL, PRIMARY KEY (guild_id, user_id))');
  return db;
}

const queues = new Map();
function serial(key, task) {
  const previous = queues.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  queues.set(key, current);
  return current.finally(() => {
    if (queues.get(key) === current) queues.delete(key);
  });
}

function components(number, count = 0) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`confession:like:${number}`)
      .setEmoji('❤️').setLabel(`Thích · ${count}`).setStyle(ButtonStyle.Secondary),
  )];
}

async function checkedChannel(guild, channelId) {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new Error('Kênh confession không còn tồn tại hoặc không phải kênh văn bản. Admin hãy dùng /confessionconfig.');
  }
  const me = guild.members.me || await guild.members.fetchMe();
  if (!channel.permissionsFor(me)?.has([
    PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks,
    ...(getOptions(guild.id).confessionThreads ? [PermissionFlagsBits.CreatePublicThreads] : []),
  ])) throw new Error('Bot cần quyền View Channel, Send Messages, Embed Links và Create Public Threads trong kênh confession.');
  return channel;
}

async function confess(interaction, submission = null) {
  if (!interaction.inGuild()) return interaction.reply({ content: 'Lệnh này chỉ dùng trong server.', flags: MessageFlags.Ephemeral });
  if (interaction.user.bot) return interaction.reply({content:'Tài khoản bot không thể gửi confession.',flags:64});
  const mode = submission?.mode || interaction.options.getString('mode') || 'anonymous';
  if (!['anonymous','public'].includes(mode)) return interaction.reply({content:'Chế độ đăng không hợp lệ.',flags:64});
  const visibility = mode === 'public' ? 'công khai' : 'ẩn danh';
  const content = (submission?.content ?? interaction.options.getString('content', true)).trim();
  if (!content || content.length > 4000) return interaction.reply({ content: 'Nội dung phải có từ 1 đến 4000 ký tự.', flags: MessageFlags.Ephemeral });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  return serial(`post:${interaction.guildId}`, async () => {
    const options = getOptions(interaction.guildId);
    if (!options.confessionEnabled) return interaction.editReply('Server hiện đang tắt gửi confession.');
    if (content.length > options.confessionMaxLength) return interaction.editReply(`Confession tối đa ${options.confessionMaxLength} ký tự.`);
    const cooldown = cooldownTable().prepare('SELECT sent_at FROM confession_cooldowns WHERE guild_id = ? AND user_id = ?').get(interaction.guildId, interaction.user.id);
    const remaining = Math.ceil(((cooldown?.sent_at || 0) + options.confessionCooldown * 1000 - Date.now()) / 1000);
    if (remaining > 0) return interaction.editReply(`Bạn cần chờ ${remaining} giây trước khi gửi confession tiếp theo.`);
    const config = store.getConfig(interaction.guildId);
    if (!config) return interaction.editReply('Admin cần dùng /confessionconfig để chọn kênh confession trước.');
    let channel;
    try { channel = await checkedChannel(interaction.guild, config.channel_id); }
    catch (error) { return interaction.editReply(error.message); }
    const number = store.reserveNumber(interaction.guildId, channel.id);
    const label = String(number).padStart(3, '0');
    let message;
    try {
      message = await channel.send({
        embeds: [new EmbedBuilder().setColor(options.confessionColor)
          .setTitle(template(options.confessionTitle, { number: label, server: interaction.guild.name }).slice(0, 256))
          .setDescription(content)
          .setAuthor(mode === 'public' ? {name: interaction.member?.displayName || interaction.user.globalName || interaction.user.username, iconURL: interaction.user.displayAvatarURL()} : {name:'Người gửi ẩn danh'})
          .setFields(mode === 'public' ? [{name:'Người chia sẻ',value:`<@${interaction.user.id}>`}] : [])
          .setFooter({ text: `${mode === 'public' ? 'Chia sẻ công khai' : options.confessionFooter}${options.confessionThreads ? ' · Bình luận trong luồng sẽ hiện tên tài khoản của bạn.' : ''}` })],
        components: options.confessionLikes ? components(number) : [], allowedMentions: { parse: [] },
      });
    } catch {
      return interaction.editReply('Không gửi được confession. Kiểm tra quyền của bot rồi thử lại.');
    }
    cooldownTable().prepare('INSERT INTO confession_cooldowns VALUES (?, ?, ?) ON CONFLICT(guild_id, user_id) DO UPDATE SET sent_at = excluded.sent_at')
      .run(interaction.guildId, interaction.user.id, Date.now());
    try { store.attachMessage(interaction.guildId, number, message.id); }
    catch {
      // The post already exists on Discord; do not invite the author to submit it again.
      await message.edit({ components: [] }).catch(() => {});
      return interaction.editReply(`✅ Đã đăng confession #${label}. Nút thích tạm thời không khả dụng.`);
    }
    if (!options.confessionThreads) return interaction.editReply(`✅ Confession #${label} đã được đăng ${visibility} vào <#${channel.id}>.`);
    try {
      await message.startThread({
        name: `💬 Bình luận confession #${label}`,
        autoArchiveDuration: 1440,
        reason: `Bình luận confession #${label}`,
      });
    } catch {
      // The confession is already published. Never resend it if thread creation fails.
      return interaction.editReply(`✅ Confession #${label} đã được đăng ${visibility} vào <#${channel.id}>, nhưng chưa tạo được luồng bình luận. Admin hãy kiểm tra quyền Create Public Threads hoặc tạo luồng từ bài đăng.`);
    }
    return interaction.editReply(`✅ Confession #${label} của bạn đã được đăng ${visibility} vào <#${channel.id}>. Member có thể bình luận bằng tài khoản của mình trong luồng dưới bài đăng.`);
  });
}

async function configure(interaction) {
  if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: 'Chỉ admin server được dùng lệnh này.', flags: MessageFlags.Ephemeral });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const selected = interaction.options.getChannel('channel', true);
  try { await checkedChannel(interaction.guild, selected.id); }
  catch (error) { return interaction.editReply(error.message); }
  store.setChannel(interaction.guildId, selected.id);
  return interaction.editReply(`✅ Đã chọn <#${selected.id}> làm kênh confession. Số thứ tự hiện tại được giữ nguyên. Hãy cấp cho member quyền View Channel, Read Message History và Send Messages in Threads để đọc và bình luận trong luồng.`);
}

async function handleConfessionButton(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith('confession:')) return false;
  if (interaction.customId.startsWith('confession:open:')) return require('./confessionPanel').openForm(interaction);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const match = /^confession:like:([1-9]\d*)$/.exec(interaction.customId);
  if (!interaction.inGuild() || !match || !Number.isSafeInteger(Number(match[1]))) {
    await interaction.editReply('Nút confession không hợp lệ.');
    return true;
  }
  await serial(`like:${interaction.message.id}`, async () => {
    if (!getOptions(interaction.guildId).confessionLikes) return interaction.editReply('Server hiện đang tắt nút thích confession.');
    const number = Number(match[1]);
    const post = store.getPost(interaction.guildId, number);
    if (!post || post.message_id !== interaction.message.id || post.channel_id !== interaction.channelId
      || interaction.message.author.id !== interaction.client.user.id) {
      return interaction.editReply('Confession này không có trong dữ liệu của bot.');
    }
    const result = store.toggleLike(interaction.guildId, number, interaction.user.id);
    try { await interaction.message.edit({ components: components(number, result.count) }); }
    catch { return interaction.editReply('Đã lưu lượt thích, nhưng chưa cập nhật được nút trên bài đăng.'); }
    return interaction.editReply(result.liked ? '❤️ Bạn đã thích confession này.' : 'Đã bỏ thích confession này.');
  });
  return true;
}

module.exports = { confess, configure, handleConfessionButton };
