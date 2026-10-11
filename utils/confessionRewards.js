/**
 * utils/confessionRewards.js
 * Quản lý số lượt confession theo thành viên và tự động cấp role khi đạt mốc.
 *
 * Mặc định:
 * - Kênh confession tính mốc: 1556975173767270450
 * - Mốc confession: 100
 * - Role thưởng: 1558809856973082737
 * - Kênh thông báo chúc mừng: 1558774418379903086
 */

const { EmbedBuilder, PermissionFlagsBits: P } = require('discord.js');
const { getDb } = require('./database');
const { getOptions } = require('./customization');

const DEFAULT_CONFESSION_CHANNEL = '1556975173767270450';
const DEFAULT_AWARD_ROLE = '1558809856973082737';
const DEFAULT_NOTICE_CHANNEL = '1558774418379903086';
const DEFAULT_MILESTONE = 100;

function db() {
  const database = getDb();
  database.exec(`
    CREATE TABLE IF NOT EXISTS confession_user_counts (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS confession_awards (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      milestone INTEGER NOT NULL,
      awarded_at INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id, milestone)
    );
  `);
  return database;
}

/**
 * Lấy số lượng confession đã gửi của một thành viên.
 */
function getUserConfessionCount(guildId, userId) {
  const row = db().prepare('SELECT count FROM confession_user_counts WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  return row ? row.count : 0;
}

/**
 * Kiểm tra xem thành viên đã nhận thưởng mốc hay chưa.
 */
function hasUserReceivedAward(guildId, userId, milestone) {
  const row = db().prepare('SELECT 1 FROM confession_awards WHERE guild_id = ? AND user_id = ? AND milestone = ?').get(guildId, userId, milestone);
  return Boolean(row);
}

/**
 * Ghi nhận thêm 1 confession và kiểm tra trao thưởng nếu đạt mốc.
 * @param {Guild} guild
 * @param {string} userId
 * @param {string} channelId
 */
async function recordAndCheckMilestone(guild, userId, channelId) {
  const options = getOptions(guild.id);

  const targetChannel = options.confessionMilestoneChannel || DEFAULT_CONFESSION_CHANNEL;
  // Nếu có cấu hình kênh cụ thể, chỉ tính khi confession được gửi vào đúng kênh đó.
  if (targetChannel && channelId !== targetChannel) return null;

  const database = db();
  const row = database.prepare(`
    INSERT INTO confession_user_counts (guild_id, user_id, count)
    VALUES (?, ?, 1)
    ON CONFLICT(guild_id, user_id)
    DO UPDATE SET count = confession_user_counts.count + 1
    RETURNING count
  `).get(guild.id, userId);

  const totalCount = row ? row.count : 1;
  const milestone = options.confessionMilestone || DEFAULT_MILESTONE;
  const roleId = options.confessionRole || DEFAULT_AWARD_ROLE;
  const noticeChannelId = options.confessionNoticeChannel || DEFAULT_NOTICE_CHANNEL;

  // Nếu đạt mốc và chưa nhận thưởng
  if (totalCount >= milestone && roleId) {
    const alreadyAwarded = hasUserReceivedAward(guild.id, userId, milestone);
    if (!alreadyAwarded) {
      let member;
      try {
        member = await guild.members.fetch(userId);
      } catch {
        return { count: totalCount, awarded: false };
      }

      if (member.user?.bot) return { count: totalCount, awarded: false };

      const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
      if (me && me.permissions?.has(P.ManageRoles)) {
        try {
          if (!member.roles.cache.has(roleId)) {
            await member.roles.add(roleId, `Đạt mốc ${milestone} confession`);
          }
          database.prepare('INSERT INTO confession_awards VALUES (?, ?, ?, ?)').run(guild.id, userId, milestone, Date.now());
        } catch (error) {
          console.error('[CONFESSION REWARD] Không cấp được role:', error.message);
          return { count: totalCount, awarded: false };
        }

        // Gửi thông báo chúc mừng
        if (noticeChannelId) {
          try {
            const noticeChannel = await guild.channels.fetch(noticeChannelId);
            if (noticeChannel && [0, 5].includes(noticeChannel.type)) {
              const embed = new EmbedBuilder()
                .setColor(options.confessionColor || 0xe891b2)
                .setTitle(`🎉 Chúc mừng đạt mốc ${milestone} Confession!`)
                .setDescription(
                  `Chúc mừng <@${member.id}> đã đạt mốc **${milestone} confession** tại <#${channelId}>! ✨\n\n` +
                  `Bạn đã được trao role <@&${roleId}> vì sự đồng hành và những chia sẻ quý giá cùng **${guild.name}**! 💖`
                )
                .addFields(
                  { name: '🏅 Role vinh danh', value: `<@&${roleId}>`, inline: true },
                  { name: '💌 Cột mốc', value: `Đã gửi **${milestone} bài**`, inline: true },
                )
                .setThumbnail(member.user?.displayAvatarURL?.({ extension: 'png', size: 128 }) || null)
                .setFooter({ text: 'VietNam Legacy • Trạm sẻ chia cảm xúc' })
                .setTimestamp();

              await noticeChannel.send({
                content: `🎊 <@${member.id}>`,
                embeds: [embed],
                allowedMentions: { parse: [], users: [member.id], roles: [] },
              });
            }
          } catch (noticeError) {
            console.error('[CONFESSION REWARD] Không gửi được thông báo:', noticeError.message);
          }
        }

        return { count: totalCount, awarded: true };
      }
    }
  }

  return { count: totalCount, awarded: false };
}

module.exports = {
  recordAndCheckMilestone,
  getUserConfessionCount,
  hasUserReceivedAward,
  DEFAULT_CONFESSION_CHANNEL,
  DEFAULT_AWARD_ROLE,
  DEFAULT_NOTICE_CHANNEL,
  DEFAULT_MILESTONE,
};
