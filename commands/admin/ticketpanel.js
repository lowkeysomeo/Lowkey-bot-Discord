'use strict';
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { sendTicketPanel, saveConfig } = require('../../utils/ticketSystem');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('Đăng bảng chọn Ticket độc quyền VietNam Legacy vào kênh')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Kênh sẽ đăng bảng Ticket (mặc định kênh hiện tại)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    )
    .addRoleOption(option =>
      option.setName('admin_role')
        .setDescription('Role AdminTicket (quản trị ticket)')
    )
    .addRoleOption(option =>
      option.setName('support_role')
        .setDescription('Role Hỗ Trợ Ticket (nhân viên hỗ trợ)')
    )
    .addChannelOption(option =>
      option.setName('category')
        .setDescription('Danh mục (Category) sẽ chứa các phòng Ticket khi tạo')
        .addChannelTypes(ChannelType.GuildCategory)
    )
    .addStringOption(option =>
      option.setName('banner')
        .setDescription('Link ảnh banner VNL Ticket ở dưới Embed (.setImage)')
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });
    const guild = interaction.guild;
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
    const adminRole = interaction.options.getRole('admin_role');
    const supportRole = interaction.options.getRole('support_role');
    const category = interaction.options.getChannel('category');
    const banner = interaction.options.getString('banner');

    const patch = {};
    if (adminRole) patch.adminRoleId = adminRole.id;
    if (supportRole) patch.supportRoleId = supportRole.id;
    if (category) patch.categoryId = category.id;
    if (banner) patch.bannerUrl = banner;

    try {
      if (Object.keys(patch).length > 0) {
        saveConfig(guild.id, patch);
      }
      const res = await sendTicketPanel(guild, targetChannel.id, patch);
      return interaction.editReply({
        content: `✅ Đã đăng bảng **Ticket Độc Quyền VietNam Legacy** thành công tại <#${res.channelId}>!`,
      });
    } catch (error) {
      console.error('[TICKET PANEL COMMAND ERROR]', error);
      return interaction.editReply({
        content: `❌ Lỗi khi đăng bảng ticket: ${error.message}`,
      });
    }
  },
};
