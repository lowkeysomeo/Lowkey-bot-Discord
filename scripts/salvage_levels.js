const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function resolveDbPath() {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  if (fs.existsSync('/data')) return '/data/vietnam-legacy.sqlite';
  return path.join(process.cwd(), 'data', 'vietnam-legacy.sqlite');
}

function findBackupFiles(dataDir) {
  if (!fs.existsSync(dataDir)) return [];
  const entries = fs.readdirSync(dataDir);
  const candidates = [];

  for (const name of entries) {
    if (
      name.includes('.corrupted') ||
      name.endsWith('.bak') ||
      name.endsWith('.old') ||
      name.includes('.backup') ||
      name === 'vietnam-legacy.sqlite.bak'
    ) {
      candidates.push(path.join(dataDir, name));
    }
  }
  return candidates;
}

function salvageFromFile(sourcePath, targetDb) {
  console.log(`\n🔍 Đang kiểm tra file nguồn: ${sourcePath}`);
  let sourceDb = null;
  let rowsChat = [];
  let rowsVoice = [];

  try {
    sourceDb = new Database(sourcePath, { readonly: true, fileMustExist: true });
    // Tắt kiểm tra an toàn để đọc tối đa dữ liệu còn nguyên vẹn
    try { sourceDb.pragma('quick_check(1)'); } catch {}
  } catch (err) {
    console.warn(`  ⚠️ Không thể mở trực tiếp: ${err.message}`);
  }

  if (sourceDb) {
    try {
      rowsChat = sourceDb.prepare(`
        SELECT guild_id, user_id, level, xp, total_xp, monthly_xp, updated_at 
        FROM chat_levels
      `).all();
      console.log(`  ✅ Đọc được ${rowsChat.length} dòng chat_levels từ file này.`);
    } catch (e) {
      console.warn(`  ⚠️ Không đọc được bảng chat_levels: ${e.message}`);
    }

    try {
      rowsVoice = sourceDb.prepare(`
        SELECT guild_id, user_id, level, xp, total_xp, monthly_xp, minutes, updated_at 
        FROM voice_levels
      `).all();
      console.log(`  ✅ Đọc được ${rowsVoice.length} dòng voice_levels từ file này.`);
    } catch (e) {
      console.warn(`  ⚠️ Không đọc được bảng voice_levels: ${e.message}`);
    }

    try { sourceDb.close(); } catch {}
  }

  if (rowsChat.length === 0 && rowsVoice.length === 0) {
    console.log(`  ℹ️ File này không có dữ liệu level khả dụng.`);
    return { chatRestored: 0, voiceRestored: 0 };
  }

  const insertChat = targetDb.prepare(`
    INSERT INTO chat_levels (guild_id, user_id, level, xp, total_xp, monthly_xp, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (guild_id, user_id) DO UPDATE SET
      level = MAX(chat_levels.level, excluded.level),
      xp = CASE WHEN excluded.total_xp >= chat_levels.total_xp THEN excluded.xp ELSE chat_levels.xp END,
      total_xp = MAX(chat_levels.total_xp, excluded.total_xp),
      monthly_xp = MAX(chat_levels.monthly_xp, excluded.monthly_xp),
      updated_at = MAX(chat_levels.updated_at, excluded.updated_at)
  `);

  const insertVoice = targetDb.prepare(`
    INSERT INTO voice_levels (guild_id, user_id, level, xp, total_xp, monthly_xp, minutes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (guild_id, user_id) DO UPDATE SET
      level = MAX(voice_levels.level, excluded.level),
      xp = CASE WHEN excluded.total_xp >= voice_levels.total_xp THEN excluded.xp ELSE voice_levels.xp END,
      total_xp = MAX(voice_levels.total_xp, excluded.total_xp),
      monthly_xp = MAX(voice_levels.monthly_xp, excluded.monthly_xp),
      minutes = MAX(voice_levels.minutes, excluded.minutes),
      updated_at = MAX(voice_levels.updated_at, excluded.updated_at)
  `);

  let chatRestored = 0;
  let voiceRestored = 0;

  const mergeTx = targetDb.transaction(() => {
    for (const row of rowsChat) {
      if (!row.user_id) continue;
      insertChat.run(
        String(row.guild_id || process.env.GUILD_ID || '1555173619129122866'),
        String(row.user_id),
        row.level || 1,
        row.xp || 0,
        row.total_xp || 0,
        row.monthly_xp || 0,
        row.updated_at || Date.now()
      );
      chatRestored++;
    }

    for (const row of rowsVoice) {
      if (!row.user_id) continue;
      insertVoice.run(
        String(row.guild_id || process.env.GUILD_ID || '1555173619129122866'),
        String(row.user_id),
        row.level || 1,
        row.xp || 0,
        row.total_xp || 0,
        row.monthly_xp || 0,
        row.minutes || 0,
        row.updated_at || Date.now()
      );
      voiceRestored++;
    }
  });

  mergeTx();
  return { chatRestored, voiceRestored };
}

function runSalvage() {
  console.log('========================================================');
  console.log('🔄 BẮT ĐẦU CÔNG CỤ KHÔI PHỤC DỮ LIỆU LEVEL TỔNG (SALVAGE)');
  console.log('========================================================');

  const targetPath = resolveDbPath();
  const dataDir = path.dirname(targetPath);
  console.log(`📁 Thư mục data: ${dataDir}`);
  console.log(`🎯 Database đích đang chạy: ${targetPath}`);

  if (!fs.existsSync(targetPath)) {
    console.error('❌ Không tìm thấy database đích!');
    return;
  }

  const { getDb } = require('../utils/database');
  const targetDb = getDb();

  // Tìm danh sách file nguồn cần khôi phục
  let sourceFiles = [];
  if (process.argv[2]) {
    sourceFiles.push(path.resolve(process.argv[2]));
  } else {
    sourceFiles = findBackupFiles(dataDir);
  }

  if (sourceFiles.length === 0) {
    console.log('\n⚠️ Không tìm thấy file .corrupted hoặc .bak nào trong thư mục data.');
    console.log('💡 Gợi ý: Nếu bạn có file backup tải từ tab Backups về, hãy đặt vào thư mục data hoặc chạy:');
    console.log('   node scripts/salvage_levels.js /duong/dan/den/file-backup.sqlite');
    return;
  }

  console.log(`\n📋 Tìm thấy ${sourceFiles.length} file có thể chứa dữ liệu cũ:`);
  sourceFiles.forEach((f, i) => console.log(`  ${i + 1}. ${path.basename(f)}`));

  let totalChat = 0;
  let totalVoice = 0;

  for (const file of sourceFiles) {
    const res = salvageFromFile(file, targetDb);
    totalChat += res.chatRestored;
    totalVoice += res.voiceRestored;
  }

  console.log('\n========================================================');
  console.log('🎉 KẾT QUẢ KHÔI PHỤC:');
  console.log(`  - Đã nạp/ghép thành công: ${totalChat} bản ghi Chat Level`);
  console.log(`  - Đã nạp/ghép thành công: ${totalVoice} bản ghi Voice Level`);
  console.log('========================================================');
}

if (require.main === module) {
  runSalvage();
}

module.exports = { salvageFromFile, findBackupFiles };
