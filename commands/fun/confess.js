const { SlashCommandBuilder } = require('discord.js');
const { confess } = require('../../utils/confessionSystem');

module.exports = {
  data: new SlashCommandBuilder().setName('confess')
    .setDescription('Gửi confession ẩn danh hoặc công khai').setDMPermission(false)
    .addStringOption(option => option.setName('content').setDescription('Nội dung confession')
      .setRequired(true).setMinLength(1).setMaxLength(4000))
    .addStringOption(option => option.setName('mode').setDescription('Mặc định ẩn danh; công khai sẽ hiện tài khoản của bạn')
      .addChoices({name:'Ẩn danh',value:'anonymous'},{name:'Công khai — hiện người gửi',value:'public'})),
  execute: confess,
};
