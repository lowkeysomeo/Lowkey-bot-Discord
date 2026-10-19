'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { executeCinemaRoom } = require('./cinema');

const data = new SlashCommandBuilder()
  .setName('cinema1')
  .setDescription('Rạp phim: mở phòng chiếu Cinema 1')
  .setDMPermission(false);

async function execute(interaction) {
  return executeCinemaRoom(interaction, 1);
}

module.exports = {
  data,
  execute,
};
