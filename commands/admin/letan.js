'use strict';

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  EmbedBuilder,
} = require('discord.js');
const { getOptions, saveOptions } = require('../../utils/customization');
const { getGuildSetting, setGuildSetting } = require('../../utils/guildSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('letan')
    .setDescription('Admin: Cấu hình thông báo lễ tân chào thành viên mới')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(sub =>
      sub
        .setName('caidat')
        .setDescription('Cài đặt kênh thông báo và role lễ tân được tag')
        .addChannelOption(opt =>
          opt
            .setName('kenh')
            .setDescription('Kênh chat chung gửi lời chào mừng')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
        .addRoleOption(opt =>
          opt
            .setName('role')
            .setDescription('Role lễ tân được tag khi có thành viên mới')
            .setRequired(false)
        )
        .addBooleanOption(opt =>
          opt
            .setName('bat')
            .setDescription('Bật thông báo ngay lập tức? (Mặc định: Bật)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('kiemtra')
        .setDescription('Xem trạng thái cấu hình lễ tân hiện tại')
    )
    .addSubcommand(sub =>
      sub
        .setName('thu')
        .setDescription('Gửi một tin nhắn chào mừng và tag lễ tân thử nghiệm')
    )
    .addSubcommand(sub =>
      sub
        .setName('tat')
        .setDescription('Tắt tính năng thông báo lễ tân')
    ),

  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: 'Chỉ Quản trị viên (Admin) mới có quyền dùng lệnh này.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const options = getOptions(guild.id);

    if (sub === 'caidat') {
      const channel = interaction.options.getChannel('kenh', true);
      const role = interaction.options.getRole('role');
      const enable = interaction.options.getBoolean('bat') ?? true;

      const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
      if (me) {
        const perms = channel.permissionsFor(me);
        if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
          return interaction.reply({
            content: `❌ Bot chưa có quyền Xem kênh hoặc Gửi tin nhắn trong <#${channel.id}>. Vui lòng cấp quyền trước.`,
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      // Lưu vào cả DASHBOARD_OPTIONS và guildSettings để đồng bộ tối đa
      const patch = {
        receptionistEnabled: enable,
        receptionistChannel: channel.id,
      };
      if (role) {
        patch.receptionistRole = role.id;
        setGuildSetting(guild.id, 'RECEPTIONIST_ROLE_ID', role.id);
      }
      saveOptions(guild.id, patch);
      setGuildSetting(guild.id, 'RECEPTIONIST_CHANNEL_ID', channel.id);
      setGuildSetting(guild.id, 'RECEPTIONIST_ENABLED', enable ? 'true' : 'false');

      const roleText = role ? `<@&${role.id}>` : (options.receptionistRole ? `<@&${options.receptionistRole}>` : '*(Chưa cài role lễ tân)*');
      const statusText = enable ? '🟢 **Đang bật**' : '🔴 **Đang tắt**';

      return interaction.reply({
        content: `✅ **Đã lưu cấu hình Lễ Tân chào thành viên mới!**\n\n` +
          `• **Trạng thái:** ${statusText}\n` +
          `• **Kênh chào mừng:** <#${channel.id}>\n` +
          `• **Role lễ tân được tag:** ${roleText}\n\n` +
          `💡 *Bạn có thể dùng lệnh \`/letan thu\` để gửi tin nhắn kiểm tra thử ngay lập tức!*`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'kiemtra') {
      const channelId = options.receptionistChannel || getGuildSetting(guild.id, 'RECEPTIONIST_CHANNEL_ID');
      const roleId = options.receptionistRole || getGuildSetting(guild.id, 'RECEPTIONIST_ROLE_ID');
      const isEnabled = options.receptionistEnabled || (getGuildSetting(guild.id, 'RECEPTIONIST_ENABLED') === 'true');

      const statusEmoji = isEnabled ? '🟢 Bật' : '🔴 Tắt';
      const channelText = channelId ? `<#${channelId}>` : '⚠️ *Chưa chọn kênh*';
      const roleText = roleId ? `<@&${roleId}>` : 'ℹ️ *Không tag role nào*';

      const embed = new EmbedBuilder()
        .setColor(options.receptionistColor || 0x54a0ff)
        .setTitle('🛎️ Cấu hình Lễ Tân Chào Thành Viên Mới')
        .setDescription('Khi có người mới vào server, bot sẽ gửi lời chào mừng kèm avatar vào kênh chat chung và tag role lễ tân để tiếp đón.')
        .addFields(
          { name: 'Trạng thái', value: statusEmoji, inline: true },
          { name: 'Kênh thông báo', value: channelText, inline: true },
          { name: 'Role lễ tân', value: roleText, inline: true },
          { name: 'Dòng Ping bên ngoài', value: `\`\`\`${options.receptionistPingText || 'Mặc định'}\`\`\`` },
          { name: 'Tiêu đề Embed', value: options.receptionistTitle || 'Mặc định', inline: true },
          { name: 'Màu viền', value: options.receptionistColor || '#54a0ff', inline: true },
        )
        .setFooter({ text: 'Có thể chỉnh sửa chi tiết hơn tại Dashboard hoặc dùng /letan caidat' });

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'tat') {
      saveOptions(guild.id, { receptionistEnabled: false });
      setGuildSetting(guild.id, 'RECEPTIONIST_ENABLED', 'false');
      return interaction.reply({
        content: '🛑 Đã tắt thông báo lễ tân chào thành viên mới.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'thu') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const channelId = options.receptionistChannel || getGuildSetting(guild.id, 'RECEPTIONIST_CHANNEL_ID');
      if (!channelId) {
        return interaction.editReply('❌ Chưa cài đặt kênh thông báo lễ tân. Vui lòng dùng `/letan caidat` trước.');
      }

      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        return interaction.editReply(`❌ Không tìm thấy kênh <#${channelId}> trong server.`);
      }

      const roleId = options.receptionistRole || getGuildSetting(guild.id, 'RECEPTIONIST_ROLE_ID');
      const member = interaction.member;

      const format = (text) => (text || '')
        .replace(/\{member\}/g, `<@${member.id}>`)
        .replace(/\{role\}/g, roleId ? `<@&${roleId}>` : '')
        .replace(/\{server\}/g, guild.name)
        .replace(/\{username\}/g, member.displayName || member.user.username)
        .replace(/\{memberCount\}/g, String(guild.memberCount));

      let pingText = format(options.receptionistPingText || '👋 Welcome {member} đến với **{server}**! {role}');
      if (roleId && !pingText.includes(roleId)) {
        pingText = `${pingText.trim()} <@&${roleId}>`;
      }

      const title = format(options.receptionistTitle || '✨ Welcome to {server}');
      const desc = format(options.receptionistText || '🌸 Chào mừng bạn gia nhập **{server}**!\n\nMỗi thành viên đều là một phần quan trọng của cộng đồng. Đừng ngần ngại gửi lời chào và trò chuyện cùng {role} và mọi người nhé!\n\n✨ Chúc bạn có những phút giây thật vui vẻ tại đây!');

      const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
      const canEmbed = !me || channel.permissionsFor(me)?.has(PermissionFlagsBits.EmbedLinks);

      const payload = {
        content: `🧪 **[BẢN THỬ NGHIỆM LỄ TÂN]**\n${pingText.trim()}`,
        allowedMentions: {
          parse: [],
          users: [member.id],
          roles: roleId ? [roleId] : [],
        },
      };

      if (canEmbed) {
        const embed = new EmbedBuilder()
          .setColor(options.receptionistColor || '#54a0ff')
          .setTitle(title.slice(0, 256))
          .setDescription(desc.slice(0, 4096));

        const avatar = member.user.displayAvatarURL({ extension: 'png', forceStatic: false, size: 256 });
        if (avatar) embed.setThumbnail(avatar);
        embed.setFooter({ text: `${guild.name} • Thành viên #${guild.memberCount} (Bản thử)`, iconURL: guild.iconURL() || undefined });
        embed.setTimestamp();
        payload.embeds = [embed];
      } else {
        payload.content = `🧪 **[BẢN THỬ NGHIỆM LỄ TÂN]**\n${pingText.trim()}\n\n**${title}**\n${desc}`;
      }

      try {
        await channel.send(payload);
        return interaction.editReply(`✅ Đã gửi tin nhắn chào mừng thử nghiệm vào <#${channel.id}> thành công!`);
      } catch (error) {
        return interaction.editReply(`❌ Gửi tin thử thất bại: ${error.message}. Vui lòng kiểm tra quyền gửi tin của bot trong <#${channel.id}>.`);
      }
    }
  },
};
