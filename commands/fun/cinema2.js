'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { executeCinemaRoom } = require('./cinema');

const data = new SlashCommandBuilder()
  .setName('cinema2')
  .setDescription('Rạp phim: mở phòng chiếu Cinema 2')
  .setDMPermission(false);

async function execute(interaction) {
  return executeCinemaRoom(interaction, 2);
}

module.exports = {
  data,
  execute,
};
