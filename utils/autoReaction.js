'use strict';

const { getDb } = require('./database');

const DEFAULT_QUOTE_EMOJIS = ['🌙', '✨', '🤍', '💌'];

function db() {
  const d = getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS auto_reactions (
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      emojis TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (guild_id, channel_id)
    );
  `);
  return d;
}

const cache = new Map();

function parseEmojis(str) {
  if (!str || typeof str !== 'string') return [];
  const results = [];

  // 1. Tìm custom emojis: <:name:id> hoặc <a:name:id>
  const customRegex = /<a?:[a-zA-Z0-9_]+:\d+>/g;
  const customMatches = str.match(customRegex) || [];
  results.push(...customMatches);

  // Xóa các custom emoji đã tìm thấy để không bị regex unicode khớp nhầm
  const cleaned = str.replace(customRegex, ' ');

  // 2. Tìm unicode emojis
  const unicodeRegex = /\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*/gu;
  const unicodeMatches = cleaned.match(unicodeRegex) || [];
  results.push(...unicodeMatches);

  // Giới hạn tối đa 6 emoji cho mỗi kênh để tránh rate limit Discord
  return results.slice(0, 6);
}

function getChannelReaction(guildId, channelId, channelName = '') {
  const cacheKey = `${guildId}:${channelId}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  try {
    const row = db().prepare('SELECT * FROM auto_reactions WHERE guild_id = ? AND channel_id = ?').get(guildId, channelId);
    if (row) {
      let emojis = [];
      try { emojis = JSON.parse(row.emojis); } catch {}
      const config = {
        enabled: Boolean(row.enabled),
        emojis: Array.isArray(emojis) && emojis.length > 0 ? emojis : DEFAULT_QUOTE_EMOJIS,
        isCustom: true,
      };
      cache.set(cacheKey, config);
      return config;
    }
  } catch (err) {
    console.warn('[AUTO-REACT] Lỗi đọc cấu hình từ DB:', err.message);
  }

  // Nếu chưa có cấu hình riêng trong database, tự động nhận diện kênh quotes
  const isQuoteChannel = /(quote|quotes|trích[-_ ]*dẫn)/i.test(channelName || '');
  if (isQuoteChannel) {
    const defaultConfig = {
      enabled: true,
      emojis: DEFAULT_QUOTE_EMOJIS,
      isDefault: true,
    };
    cache.set(cacheKey, defaultConfig);
    return defaultConfig;
  }

  cache.set(cacheKey, null);
  return null;
}

function setChannelReaction(guildId, channelId, emojis, enabled = 1) {
  const emojiList = Array.isArray(emojis) && emojis.length > 0 ? emojis : DEFAULT_QUOTE_EMOJIS;
  db().prepare(`
    INSERT INTO auto_reactions (guild_id, channel_id, emojis, enabled, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, channel_id) DO UPDATE SET
      emojis = excluded.emojis,
      enabled = excluded.enabled
  `).run(guildId, channelId, JSON.stringify(emojiList), enabled ? 1 : 0, Date.now());

  const cacheKey = `${guildId}:${channelId}`;
  cache.set(cacheKey, {
    enabled: Boolean(enabled),
    emojis: emojiList,
    isCustom: true,
  });

  return emojiList;
}

function removeChannelReaction(guildId, channelId) {
  // Đánh dấu enabled = 0 để vô hiệu hóa cả cấu hình mặc định nếu có
  db().prepare(`
    INSERT INTO auto_reactions (guild_id, channel_id, emojis, enabled, created_at)
    VALUES (?, ?, ?, 0, ?)
    ON CONFLICT(guild_id, channel_id) DO UPDATE SET enabled = 0
  `).run(guildId, channelId, JSON.stringify(DEFAULT_QUOTE_EMOJIS), Date.now());

  const cacheKey = `${guildId}:${channelId}`;
  cache.set(cacheKey, {
    enabled: false,
    emojis: [],
    isCustom: true,
  });

  return true;
}

function listChannelReactions(guildId) {
  try {
    const rows = db().prepare('SELECT * FROM auto_reactions WHERE guild_id = ? AND enabled = 1').all(guildId);
    return rows.map(r => {
      let emojis = [];
      try { emojis = JSON.parse(r.emojis); } catch {}
      return {
        channelId: r.channel_id,
        emojis: Array.isArray(emojis) ? emojis : DEFAULT_QUOTE_EMOJIS,
        createdAt: r.created_at,
      };
    });
  } catch (err) {
    console.warn('[AUTO-REACT] Lỗi lấy danh sách kênh:', err.message);
    return [];
  }
}

async function handleMessage(message) {
  if (!message || !message.guild || !message.channel) return;
  if (message.author?.bot || message.webhookId) return;

  const config = getChannelReaction(message.guild.id, message.channel.id, message.channel.name);
  if (!config || !config.enabled || !Array.isArray(config.emojis) || config.emojis.length === 0) {
    return;
  }

  // Thả lần lượt các emoji với khoảng giãn cách nhỏ để tránh rate-limit
  for (let i = 0; i < config.emojis.length; i++) {
    const emoji = config.emojis[i];
    try {
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      await message.react(emoji);
    } catch (err) {
      console.warn(`[AUTO-REACT] Không thể thả emoji "${emoji}" tại #${message.channel.name}:`, err.message);
    }
  }
}

module.exports = {
  DEFAULT_QUOTE_EMOJIS,
  parseEmojis,
  getChannelReaction,
  setChannelReaction,
  removeChannelReaction,
  listChannelReactions,
  handleMessage,
};
