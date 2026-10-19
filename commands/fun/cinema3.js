'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { executeCinemaRoom } = require('./cinema');

const data = new SlashCommandBuilder()
  .setName('cinema3')
  .setDescription('Rạp phim: mở phòng chiếu Cinema 3')
  .setDMPermission(false);

async function execute(interaction) {
  return executeCinemaRoom(interaction, 3);
}

module.exports = {
  data,
  execute,
};
