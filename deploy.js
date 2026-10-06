require('dotenv').config();
const { loadCommands } = require('./utils/loadCommands');
const { deployCommands } = require('./utils/deployCommands');

deployCommands(loadCommands()).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
