const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');
const path = require('path');
const fs = require('fs');
const { getDb, getDatabasePath } = require('../../utils/database');
const { salvageFromFile, findBackupFiles } = require('../../scripts/salvage_levels');

module.exports.data = new SlashCommandBuilder()
  .setName('restorelevels')
  .setDescription('Admin: Tự động khôi phục dữ liệu level tổng từ các bản sao lưu/hỏng cũ')
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
        content: '⚠️ Không tìm thấy file sao lưu (`.corrupted` hoặc `.bak`) nào trong thư mục `data/` trên hosting.',
      });
    }

    let totalChat = 0;
    let totalVoice = 0;

    for (const file of backupFiles) {
      const res = salvageFromFile(file, targetDb);
      totalChat += res.chatRestored;
      totalVoice += res.voiceRestored;
    }

    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle('🎉 Khôi phục dữ liệu Level thành công!')
      .setDescription(
        `Đã quét **${backupFiles.length}** file sao lưu và nạp ghép dữ liệu an toàn vào hệ thống:\n` +
        `• **Chat Levels khôi phục:** ${totalChat} thành viên\n` +
        `• **Voice Levels khôi phục:** ${totalVoice} thành viên`
      )
      .setFooter({ text: 'Dữ liệu được hợp nhất theo nguyên tắc MAX (không bị mất điểm mới).' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('[RESTORE LEVELS ERROR]', err);
    await interaction.editReply({
      content: `❌ Gặp lỗi khi khôi phục dữ liệu: ${err.message}`,
    });
  }
};
