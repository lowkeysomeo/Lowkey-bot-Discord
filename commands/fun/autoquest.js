'use strict';

const questCommand = require('./quest');

module.exports.data = {
  name: 'autoquest',
  description: 'Tự động hoàn thành Discord Quests & cày điểm ORB (Lệnh tắt của /quest)',
  type: 1,
  options: questCommand.data.options,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

module.exports.execute = async (interaction) => {
  return questCommand.execute(interaction);
};
