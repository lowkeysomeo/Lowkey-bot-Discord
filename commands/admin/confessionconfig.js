const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { configure } = require('../../utils/confessionSystem');

module.exports = {
  data: new SlashCommandBuilder().setName('confessionconfig')
    .setDescription('Admin: chọn kênh đăng confession').setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option => option.setName('channel').setDescription('Kênh confession')
      .setRequired(true).addChannelTypes(ChannelType.GuildText)),
  execute: configure,
};
