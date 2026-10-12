const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const vntimeout = require('./vntimeout');

module.exports.data = new SlashCommandBuilder()
  .setName('vnhanche')
  .setDescription('Hạn chế (timeout) thành viên trong server')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption(option =>
    option.setName('user').setDescription('Thành viên cần hạn chế').setRequired(true)
  )
  .addIntegerOption(option =>
    option.setName('minutes')
      .setDescription('Thời gian hạn chế tính bằng phút (1 - 40320 phút, mặc định: 10 phút)')
      .setMinValue(1)
      .setMaxValue(40320)
      .setRequired(false)
  )
  .addStringOption(option =>
    option.setName('reason').setDescription('Lý do hạn chế').setRequired(false)
  );

module.exports.execute = vntimeout.execute;
