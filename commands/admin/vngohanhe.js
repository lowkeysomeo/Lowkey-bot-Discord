const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const vnuntimeout = require('./vnuntimeout');

module.exports.data = new SlashCommandBuilder()
  .setName('vngohanhe')
  .setDescription('Gỡ hạn chế (untimeout) cho thành viên trong server')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption(option =>
    option.setName('user').setDescription('Thành viên cần gỡ hạn chế').setRequired(true)
  )
  .addStringOption(option =>
    option.setName('reason').setDescription('Lý do gỡ hạn chế').setRequired(false)
  );

module.exports.execute = vnuntimeout.execute;
