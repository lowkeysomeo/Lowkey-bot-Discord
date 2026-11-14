const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { profileFromTotalXp, roundXp } = require('../utils/levelMath');

function resolveDbPath() {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  if (fs.existsSync('/data')) return '/data/vietnam-legacy.sqlite';
  return path.join(process.cwd(), 'data', 'vietnam-legacy.sqlite');
}

function findBackupFiles(dataDir) {
  const candidates = [];
  const seen = new Set();

  if (fs.existsSync(dataDir)) {
    for (const name of fs.readdirSync(dataDir)) {
      if (
        name.includes('.corrupted') ||
        name.endsWith('.bak') ||
        name.endsWith('.old') ||
        name.includes('.backup') ||
        name === 'vietnam-legacy-cu.sqlite'
      ) {
        const full = path.join(dataDir, name);
        if (!seen.has(full)) {
          seen.add(full);
          candidates.push(full);
        }
      }
    }
  }

  // Quét thêm .trashbin trên hosting (nơi lưu file -wal hoặc .sqlite bị xóa nhầm)
  const parentDir = path.dirname(dataDir);
  const trashDirs = [
    path.join(parentDir, '.trashbin'),
    path.join(process.cwd(), '.trashbin'),
  ];
  for (const tDir of trashDirs) {
    if (!fs.existsSync(tDir)) continue;
    try {
      for (const name of fs.readdirSync(tDir)) {
        if (name.includes('vietnam-legacy.sqlite') && !name.endsWith('-shm')) {
          const full = path.join(tDir, name);
          if (!seen.has(full)) {
            seen.add(full);
            candidates.push(full);
          }
        }
      }
    } catch {}
  }

  return candidates;
}

// --- Raw SQLite & WAL Page Parser (khôi phục ngay cả khi chỉ còn file -wal hoặc DB lỗi nặng) ---
function readVarint(buf, offset) {
  let val = 0n;
  let i = 0;
  while (i < 8 && offset + i < buf.length) {
    const b = buf[offset + i];
    val = (val << 7n) | BigInt(b & 0x7f);
    i++;
    if ((b & 0x80) === 0) return { val: Number(val), len: i };
  }
  if (offset + 8 < buf.length) {
    const b = buf[offset + 8];
    val = (val << 8n) | BigInt(b);
    return { val: Number(val), len: 9 };
  }
  return { val: 0, len: 1 };
}

function readIntBE(buf, offset, bytes) {
  let v = buf.readInt8(offset);
  for (let i = 1; i < bytes; i++) v = v * 256 + buf[offset + i];
  return v;
}

function decodeSqliteRecord(payload) {
  const hdr = readVarint(payload, 0);
  const headerEnd = hdr.val;
  if (headerEnd <= 0 || headerEnd > payload.length) return null;

  let pos = hdr.len;
  const serialTypes = [];
  while (pos < headerEnd) {
    const st = readVarint(payload, pos);
    serialTypes.push(st.val);
    pos += st.len;
  }

  let dataPos = headerEnd;
  const cols = [];
  for (const st of serialTypes) {
    if (st === 0) cols.push(null);
    else if (st === 1) { if (dataPos + 1 > payload.length) return null; cols.push(payload.readInt8(dataPos)); dataPos += 1; }
    else if (st === 2) { if (dataPos + 2 > payload.length) return null; cols.push(payload.readInt16BE(dataPos)); dataPos += 2; }
    else if (st === 3) { if (dataPos + 3 > payload.length) return null; cols.push(readIntBE(payload, dataPos, 3)); dataPos += 3; }
    else if (st === 4) { if (dataPos + 4 > payload.length) return null; cols.push(payload.readInt32BE(dataPos)); dataPos += 4; }
    else if (st === 5) { if (dataPos + 6 > payload.length) return null; cols.push(readIntBE(payload, dataPos, 6)); dataPos += 6; }
    else if (st === 6) { if (dataPos + 8 > payload.length) return null; cols.push(Number(payload.readBigInt64BE(dataPos))); dataPos += 8; }
    else if (st === 7) { if (dataPos + 8 > payload.length) return null; cols.push(payload.readDoubleBE(dataPos)); dataPos += 8; }
    else if (st === 8) cols.push(0);
    else if (st === 9) cols.push(1);
    else if (st >= 12 && st % 2 === 0) {
      const len = (st - 12) / 2;
      if (dataPos + len > payload.length) return null;
      cols.push(payload.subarray(dataPos, dataPos + len));
      dataPos += len;
    } else if (st >= 13 && st % 2 === 1) {
      const len = (st - 13) / 2;
      if (dataPos + len > payload.length) return null;
      cols.push(payload.subarray(dataPos, dataPos + len).toString('utf8'));
      dataPos += len;
    } else {
      return null;
    }
  }
  return cols;
}

function scanBTreeLeafPage(page, pageNum, chatMap, voiceMap) {
  const hdrOffset = pageNum === 1 ? 100 : 0;
  if (page.length < hdrOffset + 8) return;
  if (page[hdrOffset] !== 0x0d) return;

  const cellCount = page.readUInt16BE(hdrOffset + 3);
  if (cellCount === 0 || cellCount > 1000) return;

  const isSnowflake = (s) => typeof s === 'string' && /^\d{17,20}$/.test(s);
  const ptrStart = hdrOffset + 8;

  for (let i = 0; i < cellCount; i++) {
    if (ptrStart + i * 2 + 2 > page.length) break;
    const cellOffset = page.readUInt16BE(ptrStart + i * 2);
    if (cellOffset <= hdrOffset || cellOffset >= page.length) continue;

    const pSize = readVarint(page, cellOffset);
    const rowid = readVarint(page, cellOffset + pSize.len);
    const payloadStart = cellOffset + pSize.len + rowid.len;
    if (payloadStart >= page.length) continue;

    const cols = decodeSqliteRecord(page.subarray(payloadStart, Math.min(page.length, payloadStart + pSize.val)));
    if (!cols) continue;

    if (cols.length === 7 && isSnowflake(cols[0]) && isSnowflake(cols[1]) && typeof cols[2] === 'number' && typeof cols[4] === 'number') {
      const key = `${cols[0]}:${cols[1]}`;
      const prev = chatMap.get(key);
      if (!prev || cols[4] > prev.total_xp || (cols[4] === prev.total_xp && cols[2] > prev.level)) {
        chatMap.set(key, {
          guild_id: cols[0],
          user_id: cols[1],
          level: cols[2],
          xp: cols[3],
          total_xp: cols[4],
          monthly_xp: cols[5],
          updated_at: cols[6],
        });
      }
    } else if (cols.length === 8 && isSnowflake(cols[0]) && isSnowflake(cols[1]) && typeof cols[2] === 'number' && typeof cols[4] === 'number') {
      const key = `${cols[0]}:${cols[1]}`;
      const prev = voiceMap.get(key);
      if (!prev || cols[4] > prev.total_xp || (cols[4] === prev.total_xp && cols[2] > prev.level)) {
        voiceMap.set(key, {
          guild_id: cols[0],
          user_id: cols[1],
          level: cols[2],
          xp: cols[3],
          total_xp: cols[4],
          monthly_xp: cols[5],
          minutes: cols[6],
          updated_at: cols[7],
        });
      }
    }
  }
}

function extractRawSqliteOrWal(filePath) {
  const chatMap = new Map();
  const voiceMap = new Map();
  if (!fs.existsSync(filePath)) return { rowsChat: [], rowsVoice: [] };

  const buf = fs.readFileSync(filePath);
  if (buf.length < 100) return { rowsChat: [], rowsVoice: [] };

  // Kiểm tra magic header: "SQLite format 3\0" hoặc WAL (0x377f0682 / 0x377f0683)
  const magic32 = buf.readUInt32BE(0);
  if (magic32 === 0x377f0682 || magic32 === 0x377f0683) {
    const pageSize = buf.readUInt32BE(8);
    if (pageSize >= 512 && pageSize <= 65536) {
      let offset = 32;
      while (offset + 24 + pageSize <= buf.length) {
        const pageNum = buf.readUInt32BE(offset);
        const page = buf.subarray(offset + 24, offset + 24 + pageSize);
        scanBTreeLeafPage(page, pageNum, chatMap, voiceMap);
        offset += 24 + pageSize;
      }
    }
  } else if (buf.subarray(0, 15).toString('ascii') === 'SQLite format 3') {
    let pageSize = buf.readUInt16BE(16);
    if (pageSize === 1) pageSize = 65536;
    if (pageSize >= 512 && pageSize <= 65536) {
      const pages = Math.floor(buf.length / pageSize);
      for (let p = 1; p <= pages; p++) {
        const page = buf.subarray((p - 1) * pageSize, p * pageSize);
        scanBTreeLeafPage(page, p, chatMap, voiceMap);
      }
    }
  }

  return {
    rowsChat: [...chatMap.values()],
    rowsVoice: [...voiceMap.values()],
  };
}

function salvageFromFile(sourcePath, targetDb) {
  console.log(`\n🔍 Đang kiểm tra file nguồn: ${sourcePath}`);
  const chatMap = new Map();
  const voiceMap = new Map();

  // 1. Thử đọc qua SQLite engine nếu là file .sqlite
  if (!sourcePath.endsWith('-wal')) {
    let sourceDb = null;
    try {
      sourceDb = new Database(sourcePath, { readonly: true, fileMustExist: true });
      try {
        for (const r of sourceDb.prepare('SELECT guild_id, user_id, level, xp, total_xp, monthly_xp, updated_at FROM chat_levels').all()) {
          chatMap.set(`${r.guild_id}:${r.user_id}`, r);
        }
      } catch {}
      try {
        for (const r of sourceDb.prepare('SELECT guild_id, user_id, level, xp, total_xp, monthly_xp, minutes, updated_at FROM voice_levels').all()) {
          voiceMap.set(`${r.guild_id}:${r.user_id}`, r);
        }
      } catch {}
      try { sourceDb.close(); } catch {}
    } catch {}
  }

  // 2. Luôn quét thêm bằng Raw Page / WAL Scanner để giải cứu dữ liệu từ -wal hoặc page bị lệch
  try {
    const raw = extractRawSqliteOrWal(sourcePath);
    for (const r of raw.rowsChat) {
      const key = `${r.guild_id}:${r.user_id}`;
      const prev = chatMap.get(key);
      if (!prev || Number(r.total_xp) > Number(prev.total_xp)) {
        chatMap.set(key, r);
      }
    }
    for (const r of raw.rowsVoice) {
      const key = `${r.guild_id}:${r.user_id}`;
      const prev = voiceMap.get(key);
      if (!prev || Number(r.total_xp) > Number(prev.total_xp)) {
        voiceMap.set(key, r);
      }
    }
  } catch (e) {
    console.warn(`  ⚠️ Lỗi quét raw page: ${e.message}`);
  }

  const rowsChat = [...chatMap.values()];
  const rowsVoice = [...voiceMap.values()];

  if (rowsChat.length === 0 && rowsVoice.length === 0) {
    console.log('  ℹ️ File này không có dữ liệu level khả dụng.');
    return { chatRestored: 0, voiceRestored: 0, chatUpgraded: 0, voiceUpgraded: 0 };
  }

  console.log(`  ✅ Đọc được ${rowsChat.length} chat_levels và ${rowsVoice.length} voice_levels.`);

  const selectChat = targetDb.prepare('SELECT total_xp FROM chat_levels WHERE guild_id = ? AND user_id = ?');
  const selectVoice = targetDb.prepare('SELECT total_xp, minutes FROM voice_levels WHERE guild_id = ? AND user_id = ?');

  const upsertChat = targetDb.prepare(`
    INSERT INTO chat_levels (guild_id, user_id, level, xp, total_xp, monthly_xp, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (guild_id, user_id) DO UPDATE SET
      level = excluded.level,
      xp = excluded.xp,
      total_xp = excluded.total_xp,
      monthly_xp = MAX(chat_levels.monthly_xp, excluded.monthly_xp),
      updated_at = MAX(chat_levels.updated_at, excluded.updated_at)
  `);

  const upsertVoice = targetDb.prepare(`
    INSERT INTO voice_levels (guild_id, user_id, level, xp, total_xp, monthly_xp, minutes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (guild_id, user_id) DO UPDATE SET
      level = excluded.level,
      xp = excluded.xp,
      total_xp = excluded.total_xp,
      monthly_xp = MAX(voice_levels.monthly_xp, excluded.monthly_xp),
      minutes = MAX(voice_levels.minutes, excluded.minutes),
      updated_at = MAX(voice_levels.updated_at, excluded.updated_at)
  `);

  let chatRestored = 0;
  let voiceRestored = 0;
  let chatUpgraded = 0;
  let voiceUpgraded = 0;

  const mergeTx = targetDb.transaction(() => {
    for (const row of rowsChat) {
      if (!row.user_id) continue;
      const gId = String(row.guild_id || process.env.GUILD_ID || '1555173619129122866');
      const uId = String(row.user_id);
      const srcTotal = Math.max(0, Number(row.total_xp) || 0);
      const existing = selectChat.get(gId, uId);
      const curTotal = existing ? (Number(existing.total_xp) || 0) : -1;

      if (srcTotal > curTotal) {
        const derived = profileFromTotalXp(srcTotal);
        upsertChat.run(
          gId,
          uId,
          derived.level,
          roundXp(derived.xp),
          roundXp(srcTotal),
          Math.max(0, Number(row.monthly_xp) || 0),
          Number(row.updated_at) || Date.now()
        );
        chatUpgraded++;
      }
      chatRestored++;
    }

    for (const row of rowsVoice) {
      if (!row.user_id) continue;
      const gId = String(row.guild_id || process.env.GUILD_ID || '1555173619129122866');
      const uId = String(row.user_id);
      const srcTotal = Math.max(0, Number(row.total_xp) || 0);
      const existing = selectVoice.get(gId, uId);
      const curTotal = existing ? (Number(existing.total_xp) || 0) : -1;

      if (srcTotal > curTotal) {
        const derived = profileFromTotalXp(srcTotal);
        upsertVoice.run(
          gId,
          uId,
          derived.level,
          roundXp(derived.xp),
          roundXp(srcTotal),
          Math.max(0, Number(row.monthly_xp) || 0),
          Math.max(0, Math.floor(Number(row.minutes) || 0)),
          Number(row.updated_at) || Date.now()
        );
        voiceUpgraded++;
      }
      voiceRestored++;
    }
  });

  mergeTx();
  return { chatRestored, voiceRestored, chatUpgraded, voiceUpgraded };
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

  let sourceFiles = [];
  if (process.argv[2]) {
    sourceFiles.push(path.resolve(process.argv[2]));
  } else {
    sourceFiles = findBackupFiles(dataDir);
  }

  if (sourceFiles.length === 0) {
    console.log('\n⚠️ Không tìm thấy file .corrupted, .bak hoặc -wal nào trong data/ hay .trashbin/.');
    return;
  }

  console.log(`\n📋 Tìm thấy ${sourceFiles.length} file có thể chứa dữ liệu cũ:`);
  sourceFiles.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));

  let totalChat = 0;
  let totalVoice = 0;
  let totalChatUpgraded = 0;
  let totalVoiceUpgraded = 0;

  for (const file of sourceFiles) {
    const res = salvageFromFile(file, targetDb);
    totalChat += res.chatRestored;
    totalVoice += res.voiceRestored;
    totalChatUpgraded += res.chatUpgraded;
    totalVoiceUpgraded += res.voiceUpgraded;
  }

  console.log('\n========================================================');
  console.log('🎉 KẾT QUẢ KHÔI PHỤC:');
  console.log(`  - Đọc tổng cộng: ${totalChat} Chat Level, ${totalVoice} Voice Level`);
  console.log(`  - Đã khôi phục / nâng cấp: ${totalChatUpgraded} Chat Level, ${totalVoiceUpgraded} Voice Level`);
  console.log('========================================================');
}

if (require.main === module) {
  runSalvage();
}

module.exports = { salvageFromFile, findBackupFiles, extractRawSqliteOrWal };
