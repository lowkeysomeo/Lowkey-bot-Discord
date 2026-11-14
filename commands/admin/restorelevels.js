const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');
const path = require('path');
const { getDb, getDatabasePath } = require('../../utils/database');
const { salvageFromFile, findBackupFiles } = require('../../scripts/salvage_levels');

module.exports.data = new SlashCommandBuilder()
  .setName('restorelevels')
  .setDescription('Admin: Tự động khôi phục dữ liệu level tổng từ các bản sao lưu/hỏng/.trashbin')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

module.exports.execute = async (interaction) => {
  await interaction.deferReply({ ephemeral: true });

  try {
    const targetDb = getDb();
    const targetPath = getDatabasePath();
    const dataDir = path.dirname(targetPath);

    const backupFiles = findBackupFiles(dataDir);
    if (!backupFiles || backupFiles.length === 0) {
      return interaction.editReply({
        content: '⚠️ Không tìm thấy file sao lưu (`.corrupted`, `.bak`, hoặc `-wal`) nào trong `data/` hoặc `.trashbin/`.',
      });
    }

    let totalChat = 0;
    let totalVoice = 0;
    let totalChatUpgraded = 0;
    let totalVoiceUpgraded = 0;

    for (const file of backupFiles) {
      const res = salvageFromFile(file, targetDb);
      totalChat += res.chatRestored || 0;
      totalVoice += res.voiceRestored || 0;
      totalChatUpgraded += res.chatUpgraded || 0;
      totalVoiceUpgraded += res.voiceUpgraded || 0;
    }

    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle('🎉 Khôi phục dữ liệu Level thành công!')
      .setDescription(
        `Đã quét **${backupFiles.length}** file nguồn (bao gồm cả \`data/\` và \`.trashbin/\`):\n` +
        `• **Chat Levels đã đọc:** ${totalChat} bản ghi (**+${totalChatUpgraded}** được khôi phục / tăng thêm)\n` +
        `• **Voice Levels đã đọc:** ${totalVoice} bản ghi (**+${totalVoiceUpgraded}** được khôi phục / tăng thêm)`
      )
      .setFooter({ text: 'Dữ liệu được hợp nhất theo nguyên tắc MAX (luôn giữ tổng XP cao nhất).' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('[RESTORE LEVELS ERROR]', err);
    await interaction.editReply({
      content: `❌ Gặp lỗi khi khôi phục dữ liệu: ${err.message}`,
    });
  }
};
