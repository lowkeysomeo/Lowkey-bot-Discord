'use strict';

/**
 * Lowkey Quest Auth & Approval Manager
 * Hệ thống kiểm soát quyền truy cập: Chỉ những ai được Admin (604729446649298963) duyệt mới được dùng Auto Quest
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getDb } = require('./database');

const OWNER_ID = process.env.BOT_OWNER_ID || '604729446649298963';

function isOwner(userId) {
  return String(userId) === OWNER_ID;
}

function getUserStatus(userId) {
  if (isOwner(userId)) return 'approved';
  const db = getDb();
  const row = db.prepare('SELECT status, expires_at FROM quest_permissions WHERE user_id = ?').get(String(userId));
  if (!row) return 'unregistered';
  if (row.status !== 'approved') return row.status;

  // Kiểm tra thời hạn nếu là thành viên thông thường
  const sub = db.prepare('SELECT expires_at FROM quest_subscribers WHERE user_id = ?').get(String(userId));
  const effectiveExpiry = Math.max(row.expires_at || 0, sub?.expires_at || 0);
  const now = Date.now();

  if (effectiveExpiry > 0 && effectiveExpiry < now) {
    return 'expired';
  }

  return 'approved';
}

function isApproved(userId) {
  return getUserStatus(userId) === 'approved';
}

async function requestAccess(user, client) {
  const userId = String(user.id);
  const username = user.tag || user.username || userId;

  const db = getDb();
  const now = Date.now();

  db.prepare(`
    INSERT INTO quest_permissions (user_id, username, status, requested_at)
    VALUES (?, ?, 'pending', ?)
    ON CONFLICT(user_id) DO UPDATE SET
      username = excluded.username,
      status = 'pending',
      requested_at = excluded.requested_at
  `).run(userId, username, now);

  // Gửi thông báo phê duyệt tới Admin
  if (client) {
    try {
      const owner = await client.users.fetch(OWNER_ID).catch(() => null);
      if (owner) {
        const embed = new EmbedBuilder()
          .setColor(0xfaa61a)
          .setTitle('📩 [LOWKEY AUTO QUEST] YÊU CẦU CẤP QUYỀN MỚI')
          .setDescription(
            `Thành viên **${username}** vừa gửi yêu cầu xin quyền sử dụng tính năng **Auto Quest & ORB**:\n\n` +
              `👤 **Người dùng:** <@${userId}> (\`${username}\`)\n` +
              `🆔 **User ID:** \`${userId}\`\n` +
              `🕒 **Thời gian:** <t:${Math.floor(now / 1000)}:F>\n\n` +
              `👉 *Hãy bấm nút bên dưới để Phê duyệt (gói trải nghiệm 10 ngày) hoặc Từ chối.*`
          )
          .setFooter({ text: 'Hệ thống kiểm duyệt Lowkey Quest' })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`quest:approve_${userId}`)
            .setLabel('Phê Duyệt (10 Ngày)')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`quest:reject_${userId}`)
            .setLabel('Từ Chối')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger)
        );

        await owner.send({ embeds: [embed], components: [row] });
      }
    } catch (err) {
      console.error('[QUEST AUTH] Không thể gửi tin nhắn cho Admin:', err.message);
    }
  }

  return true;
}

async function approveUser(userId, approverId, client, days = 10) {
  const db = getDb();
  const now = Date.now();
  const isAdmin = isOwner(userId);
  const durationMs = (parseInt(days, 10) || 10) * 24 * 60 * 60 * 1000;

  // CHỈ ADMIN MỚI ĐƯỢC GÓI VÔ THỜI HẠN (expires_at = 0).
  // Admin duyệt người dùng thì chỉ được gói 10 ngày (hoặc số ngày admin chỉ định, mặc định 10).
  const expiresAt = isAdmin ? 0 : (now + durationMs);

  db.prepare(`
    INSERT INTO quest_permissions (user_id, username, status, requested_at, approved_at, approved_by, expires_at)
    VALUES (?, ?, 'approved', ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      status = 'approved',
      approved_at = excluded.approved_at,
      approved_by = excluded.approved_by,
      expires_at = excluded.expires_at
  `).run(String(userId), String(userId), now, now, String(approverId), expiresAt);

  // Cập nhật hoặc đồng bộ vào bảng subscribers nếu người dùng đã có tài khoản
  const sub = db.prepare('SELECT * FROM quest_subscribers WHERE user_id = ?').get(String(userId));
  if (sub) {
    const targetExpires = (sub.expires_at && sub.expires_at > expiresAt && !isAdmin) ? sub.expires_at : expiresAt;
    db.prepare(`
      UPDATE quest_subscribers
      SET expires_at = ?, enabled = 1
      WHERE user_id = ?
    `).run(targetExpires, String(userId));
  }

  // Gửi thông báo DM cho người dùng
  if (client) {
    try {
      const targetUser = await client.users.fetch(userId).catch(() => null);
      if (targetUser) {
        const expDesc = isAdmin
          ? '👑 **Gói:** Vô thời hạn (Admin)'
          : `🎁 **Thời hạn gói:** 10 ngày trải nghiệm (Hết hạn vào <t:${Math.floor(expiresAt / 1000)}:D>)`;

        const embed = new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle('🎉 [LOWKEY QUEST] YÊU CẦU CỦA BẠN ĐÃ ĐƯỢC PHÊ DUYỆT!')
          .setDescription(
            `Admin <@${approverId}> đã **phê duyệt** cho phép bạn sử dụng hệ thống **Auto Quest & Săn điểm ORB**!\n\n` +
              `${expDesc}\n\n` +
              `👉 Bạn có thể vào máy chủ gõ lệnh **\`/quest\`** (hoặc \`/autoquest\`) để:\n` +
              `• Nhập Token tự động cày nhiệm vụ.\n` +
              `• Bật chế độ quét định kỳ nhận thưởng 24/7.\n` +
              `• Treo Voice Viewer 15 phút.`
          )
          .setFooter({ text: 'Chúc bạn cày được thật nhiều ORB!' })
          .setTimestamp();

        await targetUser.send({ embeds: [embed] }).catch(() => {});
      }
    } catch (err) {}
  }

  return true;
}

async function rejectUser(userId, approverId, client) {
  const db = getDb();

  db.prepare(`
    UPDATE quest_permissions
    SET status = 'rejected'
    WHERE user_id = ?
  `).run(String(userId));

  // Tắt tính năng tự động nếu đã có trong subscribers
  db.prepare('UPDATE quest_subscribers SET enabled = 0 WHERE user_id = ?').run(String(userId));

  if (client) {
    try {
      const targetUser = await client.users.fetch(userId).catch(() => null);
      if (targetUser) {
        const embed = new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle('❌ [LOWKEY QUEST] YÊU CẦU ĐÃ BỊ TỪ CHỐI')
          .setDescription(
            `Rất tiếc, yêu cầu xin cấp quyền sử dụng tính năng **Auto Quest** của bạn đã bị từ chối bởi Admin <@${approverId}>.`
          )
          .setFooter({ text: 'Liên hệ Admin nếu bạn có thắc mắc.' })
          .setTimestamp();

        await targetUser.send({ embeds: [embed] }).catch(() => {});
      }
    } catch (err) {}
  }

  return true;
}

function buildAccessGatePayload(user) {
  const status = getUserStatus(user.id);

  if (status === 'pending') {
    const embed = new EmbedBuilder()
      .setColor(0xfaa61a)
      .setTitle('⏳ YÊU CẦU ĐANG CHỜ PHÊ DUYỆT')
      .setDescription(
        `Yêu cầu sử dụng tính năng **Auto Quest & ORB** của bạn đã được gửi tới Admin <@${OWNER_ID}>.\n\n` +
          `• Vui lòng chờ Admin xem xét và bấm duyệt.\n` +
          `• Ngay khi được duyệt, bot sẽ gửi tin nhắn riêng (DM) thông báo cho bạn ngay lập tức!`
      )
      .setFooter({ text: 'Lowkey Auto Quest • Kiểm soát quyền truy cập' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('quest:hub')
        .setLabel('Quay lại Menu')
        .setEmoji('↩️')
        .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
  }

  if (status === 'rejected') {
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('❌ BẠN CHƯA ĐƯỢC CẤP QUYỀN')
      .setDescription(
        `Yêu cầu sử dụng tính năng **Auto Quest** của bạn đã bị từ chối.\n\n` +
          `Nếu đây là sự nhầm lẫn, bạn có thể bấm nút bên dưới để gửi lại yêu cầu xin cấp quyền tới Admin <@${OWNER_ID}>.`
      )
      .setFooter({ text: 'Lowkey Auto Quest • Kiểm soát quyền truy cập' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('quest:request_access')
        .setLabel('Gửi Lại Yêu Cầu')
        .setEmoji('📨')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('quest:hub')
        .setLabel('Quay lại Menu')
        .setEmoji('↩️')
        .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
  }

  if (status === 'expired') {
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('⌛ GÓI AUTO QUEST CỦA BẠN ĐÃ HẾT HẠN')
      .setDescription(
        `Gói trải nghiệm / sử dụng tính năng **Auto Quest & ORB** của bạn đã hết hạn.\n\n` +
          `• Vui lòng liên hệ Admin <@${OWNER_ID}> để được gia hạn thêm.\n` +
          `• Hoặc bạn có thể bấm nút bên dưới để gửi yêu cầu xin gia hạn tới Admin!`
      )
      .setFooter({ text: 'Lowkey Auto Quest • Hết hạn sử dụng' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('quest:request_access')
        .setLabel('Xin Gia Hạn Thêm')
        .setEmoji('📨')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('quest:hub')
        .setLabel('Quay lại Menu')
        .setEmoji('↩️')
        .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
  }

  // unregistered
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🔒 TÍNH NĂNG CẦN ĐƯỢC PHÊ DUYỆT')
    .setDescription(
      `Tính năng **Auto Quest & Săn điểm ORB tự động** là tính năng bảo mật nội bộ và cần được sự đồng ý của Admin <@${OWNER_ID}> trước khi dùng.\n\n` +
        `👉 Hãy bấm nút **"Gửi Yêu Cầu Phê Duyệt"** bên dưới. Bot sẽ gửi thông báo trực tiếp đến Admin để duyệt cho bạn!`
    )
    .setFooter({ text: 'Lowkey Auto Quest • Kiểm soát quyền truy cập' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('quest:request_access')
      .setLabel('Gửi Yêu Cầu Phê Duyệt')
      .setEmoji('📨')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('quest:hub')
      .setLabel('Quay lại Menu')
      .setEmoji('↩️')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function buildAdminListPayload() {
  const db = getDb();
  const all = db.prepare('SELECT * FROM quest_permissions ORDER BY requested_at DESC LIMIT 20').all();

  const approved = all.filter((x) => x.status === 'approved');
  const pending = all.filter((x) => x.status === 'pending');
  const rejected = all.filter((x) => x.status === 'rejected');

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🛡️ QUẢN LÝ PHÊ DUYỆT AUTO QUEST (DÀNH CHO ADMIN)')
    .setDescription(
      `Danh sách thành viên đăng ký sử dụng tính năng Auto Quest:\n\n` +
        `⏳ **Đang chờ duyệt (${pending.length}):**\n` +
        (pending.length > 0
          ? pending.map((p) => `• <@${p.user_id}> (\`${p.username}\`) - <t:${Math.floor(p.requested_at / 1000)}:R>`).join('\n')
          : '*(Không có yêu cầu nào)*\n') +
        `\n✅ **Đã phê duyệt (${approved.length}):**\n` +
        (approved.length > 0
          ? approved.map((a) => `• <@${a.user_id}> (\`${a.username}\`)`).join('\n')
          : '*(Chưa có thành viên nào)*\n') +
        `\n❌ **Đã từ chối (${rejected.length}):**\n` +
        (rejected.length > 0 ? rejected.map((r) => `• <@${r.user_id}> (\`${r.username}\`)`).join('\n') : '*(Không có)*')
    )
    .setFooter({ text: 'Admin ID: ' + OWNER_ID })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('quest:hub')
      .setLabel('Quay lại Menu')
      .setEmoji('↩️')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

module.exports = {
  OWNER_ID,
  isOwner,
  getUserStatus,
  isApproved,
  requestAccess,
  approveUser,
  rejectUser,
  buildAccessGatePayload,
  buildAdminListPayload,
};
