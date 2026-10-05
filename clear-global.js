require("dotenv").config();

const { REST, Routes } = require("discord.js");

const rest = new REST().setToken(process.env.TOKEN);

(async () => {
    try {
        console.log("Đang xóa Global Commands...");

       await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: [] }
);

        console.log("✅ Đã xóa toàn bộ Global Commands.");
    } catch (error) {
        console.error(error);
    }
})();