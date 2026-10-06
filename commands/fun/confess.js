const { SlashCommandBuilder } = require('discord.js');
const { confess } = require('../../utils/confessionSystem');

module.exports = {
  data: new SlashCommandBuilder().setName('confess')
    .setDescription('Gửi confession ẩn danh vào kênh của server').setDMPermission(false)
    .addStringOption(option => option.setName('content').setDescription('Nội dung confession')
      .setRequired(true).setMinLength(1).setMaxLength(4000)),
  execute: confess,
};
