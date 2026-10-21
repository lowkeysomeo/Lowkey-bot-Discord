'use strict';

/**
 * Lowkey Quest Shop System
 * Hệ thống buôn bán dịch vụ Auto Quest & Săn ORBs Discord tại kênh 1561060424491737118
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { getDb } = require('./database');
const { fetchUserInfo, fetchQuests, completeSingleQuest, isVideoQuest } = require('./questTokenWorker');
const { getSubscriber, registerSubscriber, scanUserQuests } = require('./questScheduler');
const { isOwner, approveUser } = require('./questAuth');

const TARGET_CHANNEL_ID = '1561060424491737118';
const OWNER_ID = process.env.BOT_OWNER_ID || '604729446649298963';
const SINGLE_QUEST_PRICE = 4000;      // 4.000đ / quest
const MONTHLY_PACKAGE_PRICE = 40000;  // 40.000đ / tháng (30 ngày)

const BANK_NAMES = {
  MB: 'MBBank (Quân Đội)',
  VCB: 'Vietcombank',
  ICB: 'VietinBank',
  TCB: 'Techcombank',
  ACB: 'ACB',
  TPB: 'TPBank',
  VPB: 'VPBank',
  BIDV: 'BIDV',
  STB: 'Sacombank',
  VIB: 'VIB',
  MSB: 'MSB',
  OCB: 'OCB',
  SHB: 'SHB',
  HDB: 'HDBank',
  LPB: 'LPBank',
};

const DEFAULT_PANEL_TITLE = '🏪 DỊCH VỤ AUTO QUEST & SĂN ORBS DISCORD TỰ ĐỘNG 24/7';
const DEFAULT_PANEL_FOOTER = 'Lowkey Auto Quest Shop • Uy tín - Tiện lợi - Tự động 100%';
const DEFAULT_PANEL_COLOR = '#5865f2';
const DEFAULT_PANEL_DESCRIPTION =
  `Chào mừng bạn đến với hệ thống tự động hoàn thành **Discord Quests** và săn điểm **ORB / Phần quà Discord** của Lowkey Bot!\n\n` +
  `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
  `### 📦 CÁC GÓI DỊCH VỤ ĐANG CUNG CẤP\n\n` +
  `**1️⃣ Gói Tùy Chọn Quest Lẻ — \`{single_price} / quest\`**\n` +
  `• Tự do tích chọn các nhiệm vụ bạn muốn làm trên tài khoản.\n` +
  `• Tiền thanh toán = \`Số lượng quest × {single_price}\`.\n` +
  `• Sau khi quét mã QR thanh toán, bot sẽ lập tức cày hoàn tất 100% nhiệm vụ ngay.\n\n` +
  `**2️⃣ Gói Tự Động Theo Tháng — \`{monthly_price} / tháng\` (30 ngày)**\n` +
  `• **KHÔNG GIỚI HẠN** số lượng nhiệm vụ trong suốt 1 tháng!\n` +
  `• Bot chạy nền 24/7 trên máy chủ: cứ có Quest mới là tự nhận, tự xem video / chơi game hoàn tất 100% và gửi thông báo DM nhắc bạn bấm Claim.\n` +
  `• Bạn hoàn toàn không cần bật máy tính, mở game hay treo máy.\n` +
  `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
  `🛡️ *Hệ thống chia nhịp tua an toàn, chống 400 Bad Request & bảo vệ tài khoản tối đa.*`;

function formatVnd(amount) {
  return `${Number(amount || 0).toLocaleString('vi-VN')} đ`;
}

function getBankConfig() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM quest_shop_config').all();
  const config = {};
  for (const r of rows) {
    config[r.key] = r.value;
  }
  return {
    bankId: config.bank_id || process.env.BANK_ID || 'MB',
    bankAccount: config.bank_account || process.env.BANK_ACCOUNT || '',
    bankName: config.bank_name || process.env.BANK_ACCOUNT_NAME || '',
    sepayApiKey: config.sepay_api_key || process.env.SEPAY_API_KEY || '',
    channelId: config.channel_id || process.env.QUEST_SHOP_CHANNEL_ID || TARGET_CHANNEL_ID,
    panelMessageId: config.panel_message_id || null,
    singleQuestPrice: parseInt(config.single_quest_price, 10) || SINGLE_QUEST_PRICE,
    monthlyPackagePrice: parseInt(config.monthly_package_price, 10) || MONTHLY_PACKAGE_PRICE,
    panelTitle: config.panel_title || DEFAULT_PANEL_TITLE,
    panelDescription: config.panel_description !== undefined && config.panel_description !== '' ? config.panel_description : DEFAULT_PANEL_DESCRIPTION,
    panelFooter: config.panel_footer || DEFAULT_PANEL_FOOTER,
    panelColor: config.panel_color || DEFAULT_PANEL_COLOR,
  };
}

function setBankConfig(key, value) {
  const db = getDb();
  db.prepare(`
    INSERT INTO quest_shop_config (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value || ''));
}

function getVietQrUrl(bankId, bankAccount, amount, memo, accountName) {
  let cleanMemo = (memo || '').trim();
  // Đảm bảo nội dung chuyển khoản luôn bắt đầu bằng tiền tố SEVQR để SePay nhận diện
  if (!cleanMemo.toUpperCase().startsWith('SEVQR')) {
    cleanMemo = `SEVQR ${cleanMemo}`.trim();
  }
  const safeBank = encodeURIComponent((bankId || 'MB').trim().toUpperCase());
  const safeAcc = encodeURIComponent((bankAccount || '').trim());
  const safeAmount = Math.max(0, parseInt(amount, 10) || 0);
  const safeMemo = encodeURIComponent(cleanMemo);
  const safeName = encodeURIComponent((accountName || '').trim());
  return `https://qr.sepay.vn/img?bank=${safeBank}&acc=${safeAcc}&amount=${safeAmount}&des=${safeMemo}&template=compact.png`;
}

function getVietQrIoUrl(bankId, bankAccount, amount, memo, accountName) {
  let cleanMemo = (memo || '').trim();
  if (!cleanMemo.toUpperCase().startsWith('SEVQR')) {
    cleanMemo = `SEVQR ${cleanMemo}`.trim();
  }
  const safeBank = encodeURIComponent((bankId || 'ICB').trim().toUpperCase());
  const safeAcc = encodeURIComponent((bankAccount || '').trim());
  const safeAmount = Math.max(0, parseInt(amount, 10) || 0);
  const safeMemo = encodeURIComponent(cleanMemo);
  const safeName = encodeURIComponent((accountName || '').trim());
  return `https://img.vietqr.io/image/${safeBank}-${safeAcc}-compact2.png?amount=${safeAmount}&addInfo=${safeMemo}&accountName=${safeName}`;
}

function generateOrderId(prefix = 'LQ') {
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `${prefix}${rand}`;
}

function createOrder({ userId, username, token, packageType, questIds = [], questNames = [], questCount = 1, amount }) {
  const db = getDb();
  const orderId = generateOrderId(packageType === 'monthly' ? 'LQM' : 'LQ');
  const now = Date.now();
  db.prepare(`
    INSERT INTO quest_orders (
      order_id, user_id, username, token, package_type,
      quest_ids_json, quest_names_json, quest_count, amount,
      status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(
    orderId,
    userId,
    username,
    token.trim(),
    packageType,
    JSON.stringify(questIds),
    JSON.stringify(questNames),
    questCount,
    amount,
    now
  );
  return getOrder(orderId);
}

function getOrder(orderId) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM quest_orders WHERE order_id = ?').get(orderId);
  if (!row) return null;
  return {
    ...row,
    quest_ids: row.quest_ids_json ? JSON.parse(row.quest_ids_json) : [],
    quest_names: row.quest_names_json ? JSON.parse(row.quest_names_json) : [],
  };
}

function updateOrderStatus(orderId, status, extra = {}) {
  const db = getDb();
  const now = Date.now();
  let paidAt = extra.paidAt !== undefined ? extra.paidAt : (status === 'paid' || status === 'completed' ? now : null);
  let completedAt = extra.completedAt !== undefined ? extra.completedAt : (status === 'completed' ? now : null);
  let errorMsg = extra.error || null;

  db.prepare(`
    UPDATE quest_orders SET
      status = ?,
      paid_at = coalesce(?, paid_at),
      completed_at = coalesce(?, completed_at),
      error_message = coalesce(?, error_message)
    WHERE order_id = ?
  `).run(status, paidAt, completedAt, errorMsg, orderId);
}

/**
 * Lấy danh sách giao dịch từ SePay (Hỗ trợ v1, v2, Bearer và Apikey)
 */
async function fetchSePayTransactions(apiKey) {
  if (!apiKey || !String(apiKey).trim()) {
    return { success: false, error: 'Chưa cấu hình API Token SePay', transactions: [] };
  }

  const rawKey = String(apiKey).trim().replace(/^["']|["']$/g, '');
  const cleanToken = rawKey.replace(/^(Bearer|Apikey)\s+/i, '');

  const endpoints = [
    { url: 'https://my.sepay.vn/userapi/transactions/list?limit=100', auth: `Bearer ${cleanToken}` },
    { url: 'https://my.sepay.vn/userapi/transactions/list?limit=100', auth: `Apikey ${cleanToken}` },
    { url: 'https://userapi.sepay.vn/v2/transactions?limit=100', auth: `Bearer ${cleanToken}` },
    { url: 'https://userapi.sepay.vn/v2/transactions?limit=100', auth: `Apikey ${cleanToken}` },
  ];

  let lastStatus = 0;
  let lastError = null;

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, {
        headers: {
          Authorization: ep.auth,
          'Content-Type': 'application/json',
          'User-Agent': 'LowkeyBot-QuestShop/1.0',
        },
        signal: AbortSignal.timeout(8000),
      });

      lastStatus = res.status;
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue;
      }

      const json = await res.json();
      let transactions = [];
      if (Array.isArray(json?.data)) {
        transactions = json.data;
      } else if (Array.isArray(json?.transactions)) {
        transactions = json.transactions;
      } else if (Array.isArray(json?.messages)) {
        transactions = json.messages;
      } else if (json?.messages && Array.isArray(json.messages.transactions)) {
        transactions = json.messages.transactions;
      } else if (Array.isArray(json)) {
        transactions = json;
      }

      return {
        success: true,
        status: res.status,
        endpoint: ep.url,
        authType: ep.auth.split(' ')[0],
        transactions,
      };
    } catch (err) {
      lastError = err.message;
    }
  }

  return { success: false, status: lastStatus, error: lastError, transactions: [] };
}

/**
 * Kiểm tra xem có giao dịch SePay nào khớp với đơn hàng không
 */
function matchTransactionWithOrder(transactions, order) {
  if (!Array.isArray(transactions) || transactions.length === 0 || !order) return null;

  const orderId = String(order.order_id).toUpperCase();
  const cleanOrderId = orderId.replace(/[^A-Z0-9]/g, '');
  const sevqrOrderId = `SEVQR${cleanOrderId}`;
  const expectedAmount = Math.round(parseFloat(order.amount || 0));

  return transactions.find((t) => {
    // 1. Kiểm tra số tiền chuyển vào
    const amountIn = Math.round(parseFloat(t.amount_in || t.amountIn || t.transferAmount || t.amount || 0));
    if (amountIn < expectedAmount) return false;

    // 2. Kiểm tra nội dung chuyển khoản
    const rawContent = String(
      t.transaction_content ||
      t.transactionContent ||
      t.description ||
      t.content ||
      t.order_code ||
      t.code ||
      t.reference_number ||
      t.referenceNumber ||
      ''
    ).toUpperCase();

    const cleanContent = rawContent.replace(/[^A-Z0-9]/g, '');
    const directCode = String(t.code || t.order_code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

    // Khớp mã đơn hàng (hỗ trợ cả trường hợp có SEVQR ở đầu, khoảng trắng, dấu gạch, hay prefix mã GD)
    return (
      rawContent.includes(orderId) ||
      cleanContent.includes(cleanOrderId) ||
      cleanContent.includes(sevqrOrderId) ||
      directCode.includes(cleanOrderId)
    );
  });
}

/**
 * Tự động kiểm tra thanh toán qua SePay API (nếu có key)
 */
async function checkSePayPayment(order) {
  const { sepayApiKey } = getBankConfig();
  if (!sepayApiKey) return false;

  try {
    console.log(`[SEPAY] 🔎 Đang kiểm tra đơn hàng #${order.order_id} (Cần: ${order.amount}đ)...`);
    const result = await fetchSePayTransactions(sepayApiKey);

    if (!result.success) {
      console.warn(`[SEPAY] ⚠️ Không thể lấy danh sách giao dịch SePay: ${result.error} (Status: ${result.status})`);
      return false;
    }

    const transactions = result.transactions;
    console.log(`[SEPAY] 📥 Nhận được ${transactions.length} giao dịch gần nhất từ SePay (${result.endpoint}).`);

    const match = matchTransactionWithOrder(transactions, order);
    if (match) {
      const amountIn = Math.round(parseFloat(match.amount_in || match.amountIn || match.transferAmount || match.amount || 0));
      console.log(`[SEPAY] ✅ Khớp thành công đơn #${order.order_id}! Số tiền thực nhận: ${amountIn}đ.`);
      return true;
    }

    console.log(
      `[SEPAY] ⏳ Chưa thấy GD khớp mã #${order.order_id}. GD gần nhất:`,
      transactions.slice(0, 3).map((t) => `[${t.amount_in || t.amountIn || t.amount}đ] ${t.transaction_content || t.description || t.content}`)
    );
    return false;
  } catch (err) {
    console.error('[SEPAY CHECK ERROR]', err.message);
    return false;
  }
}

/**
 * Xử lý đơn hàng sau khi đã xác nhận thanh toán (Tự động hoàn tất hoặc kích hoạt gói)
 */
async function processPaidOrder(orderId, client) {
  const order = getOrder(orderId);
  if (!order) return { success: false, error: 'Không tìm thấy đơn hàng' };

  updateOrderStatus(orderId, 'running', { paidAt: Date.now() });

  if (order.package_type === 'monthly') {
    // 1. Kích hoạt gói tháng (30 ngày)
    const existing = getSubscriber(order.user_id);
    const now = Date.now();
    const durationMs = 30 * 24 * 60 * 60 * 1000;
    let newExpiresAt = now + durationMs;
    if (existing?.expires_at && existing.expires_at > now) {
      newExpiresAt = existing.expires_at + durationMs;
    }

    registerSubscriber(
      order.user_id,
      order.token,
      order.username,
      1,
      'monthly',
      newExpiresAt
    );
    const daysRemaining = Math.max(30, Math.ceil((newExpiresAt - now) / (24 * 60 * 60 * 1000)));
    approveUser(order.user_id, 'Hệ thống Auto Quest Shop', client, daysRemaining);

    updateOrderStatus(orderId, 'completed', { completedAt: Date.now() });

    // Quét ngay lập tức để làm các quest đang có
    scanUserQuests({ user_id: order.user_id, token: order.token, notify_dm: 1 }, client).catch(() => {});

    // Gửi thông báo DM cho khách hàng
    if (client) {
      const user = await client.users.fetch(order.user_id).catch(() => null);
      if (user) {
        const expDate = new Date(newExpiresAt).toLocaleDateString('vi-VN');
        const embed = new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle('👑 [LOWKEY SHOP] KÍCH HOẠT GÓI AUTO QUEST THÁNG THÀNH CÔNG!')
          .setDescription(
            `Cảm ơn bạn đã mua **Gói Tự Động Theo Tháng** tại Lowkey Bot!\n\n` +
            `• **Mã đơn hàng:** \`${order.order_id}\`\n` +
            `• **Gói dịch vụ:** Tự động hoàn thành Quest Discord (Không giới hạn)\n` +
            `• **Hạn sử dụng:** 30 ngày (Đến ngày **${expDate}**)\n` +
            `• **Quyền lợi:** Bot quét nền 24/7, tự nhận nhiệm vụ, tự xem video, cày đủ tiến độ 100% và gửi báo cáo về DM để bạn bấm Claim nhận quà.`
          )
          .setFooter({ text: 'Lowkey Quest Shop • Dịch vụ tự động 24/7' })
          .setTimestamp();
        const dmSent = await user.send({ embeds: [embed] }).then(() => true).catch(() => false);
        if (!dmSent) {
          const { channelId } = getBankConfig();
          const targetId = channelId || TARGET_CHANNEL_ID;
          const ch = await client.channels.fetch(targetId).catch(() => null);
          if (ch && ch.isTextBased()) {
            ch.send({
              content: `🎉 Chúc mừng <@${order.user_id}>! Đơn hàng **#${order.order_id}** (Gói Auto Quest Tháng) đã được kích hoạt thành công!\n*(Hạn dùng: **${expDate}**. Vui lòng mở tin nhắn riêng (DM) để nhận báo cáo làm quest).*`,
            }).catch(() => {});
          }
        }
      }
    }

    return { success: true, type: 'monthly', expiresAt: newExpiresAt };
  } else {
    // 2. Chạy nhiệm vụ lẻ theo danh sách đã chọn
    let allQuests = [];
    try {
      allQuests = await fetchQuests(order.token);
    } catch (e) {
      console.error(`[QUEST SHOP] Lỗi fetch quests cho đơn #${order.order_id}:`, e.message);
    }

    let targetQuests = [];
    if (Array.isArray(order.quest_ids) && order.quest_ids.length > 0) {
      const selectedIds = new Set(order.quest_ids);
      targetQuests = allQuests.filter((q) => selectedIds.has(q.id));
    }
    // Nếu khách hàng không chọn cụ thể từ dropdown hoặc quest đã thay đổi, tự động chọn các quest chưa nhận thưởng theo số lượng quest_count
    if (targetQuests.length === 0) {
      const pending = allQuests.filter((q) => !q.user_status?.completed_at && !q.user_status?.claimed_at);
      targetQuests = pending.slice(0, Math.max(1, order.quest_count || 1));
    }

    const results = [];
    let completedCount = 0;

    for (const q of targetQuests) {
      try {
        const res = await completeSingleQuest(order.token, q, { autoClaim: false, heartbeatDelayMs: 1200 });
        if (res.completed || res.alreadyDone || res.progressPercent >= 100) {
          completedCount++;
          results.push({
            questId: q.id,
            name: res.questName || q.id,
            success: true,
            completed: true,
            message: res.alreadyDone
              ? 'Đã nhận thưởng trước đó'
              : (res.claimed ? 'Hoàn thành 100% & Đã nhận thưởng ORB' : 'Hoàn thành 100% (Vào Discord bấm Claim)'),
          });
        } else {
          results.push({
            questId: q.id,
            name: res.questName || q.id,
            success: false,
            completed: false,
            error: res.message || 'Không thể hoàn thành qua API',
          });
        }
      } catch (err) {
        results.push({
          questId: q.id,
          name: q.id,
          success: false,
          completed: false,
          error: err.message,
        });
      }
    }

    let finalStatus = 'completed';
    if (results.length === 0) {
      finalStatus = 'cancelled';
    } else if (completedCount === results.length) {
      finalStatus = 'completed';
    } else if (completedCount > 0) {
      finalStatus = 'partially_completed';
    } else {
      finalStatus = 'failed';
    }

    updateOrderStatus(orderId, finalStatus, {
      completedAt: finalStatus === 'completed' ? Date.now() : null,
      error: finalStatus !== 'completed' ? `${completedCount}/${results.length} hoàn tất` : null,
    });

    // Gửi thông báo DM cho khách hàng
    if (client) {
      const user = await client.users.fetch(order.user_id).catch(() => null);
      if (user) {
        const isAllDone = finalStatus === 'completed';
        const embedColor = isAllDone ? 0x57f287 : completedCount > 0 ? 0xfee75c : 0xed4245;
        const embedTitle = isAllDone
          ? '🎉 [LOWKEY SHOP] HOÀN TẤT ĐƠN HÀNG QUEST LẺ!'
          : completedCount > 0
          ? '⚡ [LOWKEY SHOP] HOÀN TẤT MỘT PHẦN ĐƠN HÀNG'
          : '⚠️ [LOWKEY SHOP] KẾT QUẢ XỬ LÝ ĐƠN HÀNG';

        let desc =
          `Đơn hàng **\`${order.order_id}\`** của bạn đã được bot xử lý:\n\n` +
          results
            .map((r, i) => {
              if (r.completed) {
                return `**${i + 1}. ${r.name}**\n↪ ✅ ${r.message}`;
              } else {
                return `**${i + 1}. ${r.name}**\n↪ ⚠️ ${r.error || r.message || 'Thất bại'}`;
              }
            })
            .join('\n\n');

        if (completedCount > 0) {
          desc += `\n\n🎁 **Nhiệm vụ đã hoàn thành 100%!** Vui lòng mở **Cài đặt -> Quests** trên Discord để tự bấm **Claim** nhận thưởng (Discord yêu cầu xác thực con người khi nhận quà).`;
        }

        const embed = new EmbedBuilder()
          .setColor(embedColor)
          .setTitle(embedTitle)
          .setDescription(desc)
          .setFooter({ text: 'Lowkey Quest Shop • Dịch vụ tự động 24/7' })
          .setTimestamp();

        const dmSent = await user.send({ embeds: [embed] }).then(() => true).catch(() => false);
        if (!dmSent) {
          const { channelId } = getBankConfig();
          const targetId = channelId || TARGET_CHANNEL_ID;
          const ch = await client.channels.fetch(targetId).catch(() => null);
          if (ch && ch.isTextBased()) {
            ch.send({
              content: isAllDone
                ? `🎉 Chúc mừng <@${order.user_id}>! Đơn hàng **#${order.order_id}** (${order.quest_count} nhiệm vụ) đã được hoàn tất 100%! Vui lòng vào Cài đặt -> Quests trên Discord để tự bấm Claim nhận quà nhé!`
                : `🎯 Thông báo <@${order.user_id}>: Đơn hàng **#${order.order_id}** đã được bot nhận (Accept) thành công! Vui lòng mở tin nhắn riêng (DM) để nhận hướng dẫn hoàn tất 1-click.`,
            }).catch(() => {});
          }
        }
      }
    }

    return { success: true, type: 'single', finalStatus, results };
  }
}

/**
 * Giao diện Bảng Cửa Hàng chính đặt tại kênh 1561060424491737118
 */
function buildShopPanelPayload() {
  const cfg = getBankConfig();
  const singlePriceStr = formatVnd(cfg.singleQuestPrice);
  const monthlyPriceStr = formatVnd(cfg.monthlyPackagePrice);

  let desc = cfg.panelDescription || DEFAULT_PANEL_DESCRIPTION;
  desc = desc
    .replaceAll('{single_price}', singlePriceStr)
    .replaceAll('{monthly_price}', monthlyPriceStr);

  let embedColor = 0x5865f2;
  if (cfg.panelColor) {
    const hex = cfg.panelColor.replace('#', '').trim();
    const parsed = parseInt(hex, 16);
    if (!isNaN(parsed)) embedColor = parsed;
  }

  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setTitle(cfg.panelTitle || DEFAULT_PANEL_TITLE)
    .setDescription(desc)
    .addFields(
      {
        name: '🎯 Mua Quest Lẻ',
        value: 'Bấm nút **Mua Quest Lẻ** bên dưới để chọn nhiệm vụ và quét mã QR.',
        inline: true,
      },
      {
        name: '👑 Mua Gói Tháng',
        value: 'Bấm nút **Mua Gói Tháng** để kích hoạt bot tự làm 30 ngày.',
        inline: true,
      },
      {
        name: '🔍 Kiểm Tra Tài Khoản',
        value: 'Kiểm tra gói cước đang dùng, token và các quest đang có.',
        inline: true,
      }
    )
    .setFooter({ text: cfg.panelFooter || DEFAULT_PANEL_FOOTER })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('qshop:buy_single')
      .setLabel(`🎯 Mua Quest Lẻ (${singlePriceStr}/nv)`)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('qshop:buy_monthly')
      .setLabel(`👑 Mua Gói Tháng (${monthlyPriceStr}/tháng)`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('qshop:check_status')
      .setLabel('🔍 Kiểm Tra Gói & Tài Khoản')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('qshop:token_guide')
      .setLabel('🔑 Hướng Dẫn Lấy Token')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1] };
}

/**
 * Màn hình nhắc dùng Token đã lưu cho khách hàng trong Shop
 */
function buildSavedTokenShopPayload(userId, packageType) {
  const sub = getSubscriber(userId);
  if (!sub || !sub.token || sub.token.length < 20) return null;

  const maskedToken = sub.token.length > 8 ? `••••••••${sub.token.slice(-4)}` : '••••••••';
  const isMonthly = packageType === 'monthly';
  const pkgName = isMonthly ? '👑 Gói Tháng (40.000đ / 30 Ngày)' : '🎯 Quest Lẻ (4.000đ / nv)';

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('⚡ TÀI KHOẢN DISCORD ĐÃ ĐƯỢC LƯU')
    .setDescription(
      `Chào bạn! Hệ thống nhận thấy bạn đã có tài khoản Discord lưu sẵn:\n` +
      `• **Tài khoản:** \`${sub.username || 'User'}\` (**\`${maskedToken}\`**)\n` +
      `• **Dịch vụ đang chọn:** **${pkgName}**\n\n` +
      `Bạn có muốn tiếp tục sử dụng tài khoản này không?\n\n` +
      `• Bấm **▶️ Dùng Token Đã Lưu** để tiếp tục ngay (không cần nhập lại token).\n` +
      `• Bấm **🔄 Nhập Token Khác** nếu bạn muốn mua cho tài khoản Discord khác hoặc token cũ đã đổi mật khẩu.\n` +
      `• Bấm **❌ Hủy** để đóng thông báo.`
    )
    .setFooter({ text: 'Lowkey Quest Shop • Token được ghi nhớ an toàn' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`qshop:use_saved:${packageType}`)
      .setLabel('Dùng Token Đã Lưu')
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`qshop:prompt_token:${packageType}`)
      .setLabel('Nhập Token Khác')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('qshop:cancel_prompt')
      .setLabel('Hủy')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Modal nạp Token cho khách hàng
 */
function buildTokenModal(packageType = 'single') {
  let title = 'Nạp Token Mua Quest Lẻ';
  if (packageType === 'monthly') title = 'Nạp Token Cho Gói Tháng';
  if (packageType === 'update') title = 'Cập Nhật Discord User Token';

  const modal = new ModalBuilder()
    .setCustomId(`qshop:modal_token:${packageType}`)
    .setTitle(title);

  const tokenInput = new TextInputBuilder()
    .setCustomId('user_token')
    .setLabel('Discord User Token của bạn')
    .setPlaceholder('Dán chuỗi User Token vào đây...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMinLength(20)
    .setMaxLength(250);

  modal.addComponents(new ActionRowBuilder().addComponents(tokenInput));
  return modal;
}

function isShopAdmin(user, guild = null) {
  if (!user) return false;
  if (isOwner(user.id)) return true;
  if (String(user.id) === OWNER_ID) return true;
  if (guild && guild.ownerId === user.id) return true;
  return false;
}

/**
 * Modal cấu hình tài khoản ngân hàng dành cho Admin
 */
function buildAdminConfigModal() {
  const bank = getBankConfig();
  const modal = new ModalBuilder()
    .setCustomId('qshop:modal_config')
    .setTitle('Cấu Hình Ngân Hàng & Thanh Toán');

  const bankIdInput = new TextInputBuilder()
    .setCustomId('bank_id')
    .setLabel('Mã Ngân Hàng (VD: MB, VCB, ACB, TPB, ICB)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('VD: MB, VCB, ACB, TPB, TCB, ICB...')
    .setRequired(true);
  if (bank.bankId && bank.bankId.trim()) {
    bankIdInput.setValue(bank.bankId.trim());
  } else {
    bankIdInput.setValue('MB');
  }

  const bankAccInput = new TextInputBuilder()
    .setCustomId('bank_account')
    .setLabel('Số Tài Khoản Nhận Tiền')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('VD: 0987654321 hoặc 1903...')
    .setRequired(true);
  if (bank.bankAccount && bank.bankAccount.trim()) {
    bankAccInput.setValue(bank.bankAccount.trim());
  }

  const bankNameInput = new TextInputBuilder()
    .setCustomId('bank_name')
    .setLabel('Tên Chủ Tài Khoản (In hoa không dấu)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('VD: NGUYEN VAN A')
    .setRequired(true);
  if (bank.bankName && bank.bankName.trim()) {
    bankNameInput.setValue(bank.bankName.trim());
  }

  const sepayKeyInput = new TextInputBuilder()
    .setCustomId('sepay_api_key')
    .setLabel('SePay API Token (Tùy chọn)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Dán SePay API Token nếu có...')
    .setRequired(false);
  if (bank.sepayApiKey && bank.sepayApiKey.trim()) {
    sepayKeyInput.setValue(bank.sepayApiKey.trim());
  }

  modal.addComponents(
    new ActionRowBuilder().addComponents(bankIdInput),
    new ActionRowBuilder().addComponents(bankAccInput),
    new ActionRowBuilder().addComponents(bankNameInput),
    new ActionRowBuilder().addComponents(sepayKeyInput)
  );

  return modal;
}

/**
 * Tạo màn hình chọn nhiệm vụ lẻ
 */
function buildQuestSelectionPayload(orderId, pendingQuests, username) {
  const cfg = getBankConfig();
  const singlePriceStr = formatVnd(cfg.singleQuestPrice);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎯 TÙY CHỌN CÁC NHIỆM VỤ BẠN MUỐN LÀM')
    .setDescription(
      `Tài khoản: **@${username}**\n` +
      `Đã tìm thấy **${pendingQuests.length}** nhiệm vụ chưa hoàn thành. Hãy chọn từ danh sách bên dưới:\n\n` +
      `• **Đơn giá:** \`${singlePriceStr} / quest\`\n` +
      `• Bạn có thể chọn **1 hoặc nhiều nhiệm vụ** cùng lúc.`
    )
    .setFooter({ text: 'Lowkey Quest Shop • Chọn xong hệ thống sẽ tạo mã QR' });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`qshop:select_quests:${orderId}`)
    .setPlaceholder('👉 Bấm vào đây để chọn nhiệm vụ...')
    .setMinValues(1)
    .setMaxValues(Math.min(pendingQuests.length, 25));

  for (const q of pendingQuests.slice(0, 25)) {
    const isVideo = isVideoQuest(q);
    const qName =
      q.config?.messages?.quest_name ||
      q.config?.messages?.game_title ||
      q.config?.messages?.game_name ||
      `Nhiệm vụ #${q.id}`;

    selectMenu.addOptions({
      label: qName.length > 95 ? qName.slice(0, 92) + '...' : qName,
      value: q.id,
      description: isVideo ? `Video Quest • ${singlePriceStr}` : `Game / Stream Quest • ${singlePriceStr}`,
      emoji: isVideo ? '🎬' : '🎮',
    });
  }

  const row = new ActionRowBuilder().addComponents(selectMenu);
  const cancelRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`qshop:cancel_order:${orderId}`)
      .setLabel('Hủy Đơn')
      .setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row, cancelRow] };
}

/**
 * Tạo màn hình thanh toán VietQR cho đơn hàng
 */

function fetchQrBuffer(url, timeoutMs = 3500) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    try {
      const https = require('node:https');
      const req = https.get(url, (res) => {
        // Hỗ trợ HTTP 301, 302 Redirect
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          clearTimeout(timer);
          return fetchQrBuffer(res.headers.location, Math.max(1000, timeoutMs - 500)).then(resolve);
        }
        if (res.statusCode !== 200) {
          clearTimeout(timer);
          return resolve(null);
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          clearTimeout(timer);
          resolve(Buffer.concat(chunks));
        });
        res.on('error', () => {
          clearTimeout(timer);
          resolve(null);
        });
      });
      req.on('error', () => {
        clearTimeout(timer);
        resolve(null);
      });
    } catch (_) {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

async function fetchQrBufferWithFallback(bankId, bankAccount, amount, memo, accountName) {
  const url1 = getVietQrUrl(bankId, bankAccount, amount, memo, accountName);
  const url2 = getVietQrIoUrl(bankId, bankAccount, amount, memo, accountName);

  let buf = await fetchQrBuffer(url1, 3500);
  if (buf && buf.length > 500) return { buffer: buf, url: url1 };

  buf = await fetchQrBuffer(url2, 3500);
  if (buf && buf.length > 500) return { buffer: buf, url: url2 };

  return { buffer: null, url: url1 };
}

async function buildPaymentPayload(order) {
  const ORDER_EXPIRE_MS = 10 * 60 * 1000; // 10 phút
  const createdAt = order.created_at || Date.now();
  const expiresAt = createdAt + ORDER_EXPIRE_MS;
  const now = Date.now();

  // Đơn hàng đã hoàn tất thành công: Đóng bảng thanh toán QR và hiển thị biên lai thành công
  if (order.status === 'completed') {
    const isMonthly = order.package_type === 'monthly';
    const completeEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(`🎉 ĐƠN HÀNG #${order.order_id} ĐÃ THANH TOÁN THÀNH CÔNG!`)
      .setDescription(
        `✅ Hệ thống SePay đã xác nhận thanh toán thành công **${formatVnd(order.amount)}**!\n\n` +
        `• **Gói dịch vụ:** ${isMonthly ? '👑 Gói Tự Động Theo Tháng (30 ngày)' : `🎯 Quest Lẻ (${order.quest_count} nhiệm vụ)`}\n` +
        `• **Trạng thái:** ✅ Đã hoàn tất 100% & nhận điểm ORBs vào tài khoản Discord.\n` +
        `• Bảng thanh toán mã QR này đã được đóng an toàn.`
      )
      .setFooter({ text: 'Lowkey Quest Shop • Cảm ơn bạn đã tin dùng dịch vụ!' })
      .setTimestamp();

    const closeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('qshop:dismiss_notice')
        .setLabel('Đóng Thông Báo')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Secondary)
    );

    return { content: null, embeds: [completeEmbed], components: [closeRow], files: [] };
  }

  // Đơn hàng quá 10 phút hoặc đã bị hủy
  if (now > expiresAt || order.status === 'cancelled') {
    const expiredEmbed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle(`❌ ĐƠN HÀNG #${order.order_id} ĐÃ HẾT HẠN`)
      .setDescription(
        `Đơn hàng này đã quá thời gian thanh toán (10 phút) và đã được hệ thống tự động hủy.\n\n` +
        `• Bạn vui lòng quay lại **Bảng Dịch Vụ Quest Shop** để tạo lại đơn hàng mới nhé!`
      )
      .setFooter({ text: 'Lowkey Quest Shop • Tự động hủy sau 10 phút' });
    return { content: null, embeds: [expiredEmbed], components: [], files: [] };
  }

  const bank = getBankConfig();
  const bankNameFull = BANK_NAMES[bank.bankId] || bank.bankId;
  const transferMemo = `SEVQR ${order.order_id}`;
  const qrUrl = getVietQrUrl(bank.bankId, bank.bankAccount, order.amount, transferMemo, bank.bankName);
  const qrIoUrl = getVietQrIoUrl(bank.bankId, bank.bankAccount, order.amount, transferMemo, bank.bankName);

  const isMonthly = order.package_type === 'monthly';
  const isChecking = (order.check_count || 0) > 0;

  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle(`💳 THANH TOÁN ĐƠN HÀNG #${order.order_id}`)
    .setDescription(
      `Vui lòng quét mã QR hoặc chuyển khoản chính xác thông tin bên dưới để hệ thống tự động xác nhận:\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `• **Gói dịch vụ:** ${isMonthly ? '👑 **Gói Tự Động Theo Tháng (30 ngày)**' : `🎯 **Quest Lẻ (${order.quest_count} nhiệm vụ)**`}\n` +
      `• **Số tiền:** **${formatVnd(order.amount)}**\n` +
      `• **Ngân hàng:** **${bank.bankId}** (${bankNameFull})\n` +
      `• **Số tài khoản:** \`${bank.bankAccount || '(Chưa cấu hình)'}\`\n` +
      `• **Chủ tài khoản:** **${bank.bankName || '(Chưa cấu hình)'}**\n` +
      `• **Nội dung chuyển khoản (BẮT BUỘC):** \`${transferMemo}\`\n` +
      `👉 *Bấm giữ để sao chép nội dung CK:*\n\`\`\`\n${transferMemo}\n\`\`\`\n` +
      `• ⏳ **Hạn thanh toán (10 phút):** Hết hạn <t:${Math.floor(expiresAt / 1000)}:R> lúc <t:${Math.floor(expiresAt / 1000)}:T>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚠️ **Lưu ý quan trọng:** Ghi đúng nội dung \`${transferMemo}\`. Sau 10 phút chưa thanh toán, đơn sẽ tự động hủy!` +
      (isChecking ? `\n\n⏳ *Hệ thống đang tự động kiểm tra SePay mỗi 15 giây... Vui lòng không bấm liên tục.*` : '')
    )
    .setFooter({
      text: isChecking
        ? 'Đã ghi nhận yêu cầu! Đang đợi SePay duyệt tự động...'
        : 'Chuyển xong hãy bấm nút "Đã Chuyển Tiền" (chỉ cần bấm 1 lần)!'
    })
    .setTimestamp();

  // Tải buffer ảnh để upload trực tiếp đính kèm (hỗ trợ 100% mọi nền tảng)
  const files = [];
  try {
    const { buffer: qrBuffer, url: finalQrUrl } = await fetchQrBufferWithFallback(
      bank.bankId,
      bank.bankAccount,
      order.amount,
      transferMemo,
      bank.bankName
    );

    if (qrBuffer && qrBuffer.length > 500) {
      files.push(new AttachmentBuilder(qrBuffer, { name: 'vietqr.png' }));
      embed.setImage('attachment://vietqr.png');
    } else {
      embed.setImage(finalQrUrl || qrUrl);
    }
  } catch (_) {
    embed.setImage(qrUrl);
  }

  // Đặt thumbnail để đảm bảo thiết bị di động luôn hiển thị ô QR
  embed.setThumbnail(qrIoUrl);

  const checkBtn = new ButtonBuilder()
    .setCustomId(`qshop:check_pay:${order.order_id}`)
    .setLabel(isChecking ? '⏳ Đang Đợi SePay Xác Nhận...' : '🔄 Đã Chuyển Tiền / Kiểm Tra')
    .setStyle(isChecking ? ButtonStyle.Secondary : ButtonStyle.Success)
    .setDisabled(isChecking);

  const cancelBtn = new ButtonBuilder()
    .setCustomId(`qshop:cancel_order:${order.order_id}`)
    .setLabel('❌ Hủy Đơn')
    .setStyle(ButtonStyle.Danger);

  const qrLinkBtn = new ButtonBuilder()
    .setLabel('Mở Mã QR (Trình Duyệt)')
    .setStyle(ButtonStyle.Link)
    .setURL(qrUrl)
    .setEmoji('🖼️');

  const row = new ActionRowBuilder().addComponents(checkBtn, cancelBtn, qrLinkBtn);

  // Content hiển thị link ảnh QR trực tiếp: Discord Client tự động preview ảnh QR to đùng ngay cả khi embed bị lỗi hiển thị
  const content =
    `💳 **MÃ QR THANH TOÁN TỰ ĐỘNG SEPAY — ĐƠN HÀNG #${order.order_id} (${formatVnd(order.amount)})**\n` +
    `👉 Mở app ngân hàng quét mã bên dưới (hoặc bấm nút **"Mở Mã QR (Trình Duyệt)"** nếu không thấy ảnh):\n` +
    `${qrUrl}`;

  return { content, embeds: [embed], components: [row], files };
}

/**
 * Tạo màn hình kiểm tra gói cước & tài khoản của người dùng
 */
async function buildStatusPayload(userId) {
  const sub = getSubscriber(userId);
  if (!sub) {
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('🔍 KIỂM TRA TÀI KHOẢN & GÓI CƯỚC')
      .setDescription(
        `Bạn hiện chưa đăng ký gói Auto Quest nào trên hệ thống.\n\n` +
        `• Để mua nhiệm vụ lẻ: Hãy bấm **Mua Quest Lẻ (4.000đ/nv)**\n` +
        `• Để dùng trọn gói 30 ngày: Hãy bấm **Mua Gói Tháng (40.000đ/tháng)**`
      );
    return { embeds: [embed] };
  }

  let userInfo = null;
  let tokenValid = false;
  let allQuests = [];

  try {
    userInfo = await fetchUserInfo(sub.token);
    tokenValid = true;
    allQuests = await fetchQuests(sub.token);
  } catch (err) {
    tokenValid = false;
  }

  const now = Date.now();
  const isMonthly = sub.package_type === 'monthly';
  let planStatusText = '🎯 Gói Quest Lẻ';
  if (isMonthly) {
    if (sub.expires_at && sub.expires_at > 0) {
      if (sub.expires_at > now) {
        const daysLeft = Math.ceil((sub.expires_at - now) / (24 * 60 * 60 * 1000));
        const expDate = new Date(sub.expires_at).toLocaleDateString('vi-VN');
        planStatusText = `👑 **Gói Tháng VIP** (Còn **${daysLeft} ngày** — Hết hạn: **${expDate}**)`;
      } else {
        planStatusText = `⚠️ **Gói Tháng (Đã hết hạn)**`;
      }
    } else {
      planStatusText = `👑 **Gói Tháng VIP (Vô thời hạn)**`;
    }
  }

  const completedQuests = allQuests.filter((q) => q.user_status?.completed_at || q.user_status?.claimed_at);
  const pendingQuests = allQuests.filter((q) => !q.user_status?.completed_at && !q.user_status?.claimed_at);

  const embed = new EmbedBuilder()
    .setColor(tokenValid ? 0x57f287 : 0xed4245)
    .setTitle('🔍 THÔNG TIN GÓI CƯỚC & TÀI KHOẢN CỦA BẠN')
    .setDescription(
      `• **Discord liên kết:** ${userInfo ? `**${userInfo.global_name || userInfo.username}** (@${userInfo.username})` : `<@${userId}>`}\n` +
      `• **Trạng thái Token:** ${tokenValid ? '✅ **Hợp lệ & Sẵn sàng hoạt động**' : '❌ **Token hết hạn hoặc mật khẩu đã đổi**'}\n` +
      `• **Gói cước hiện tại:** ${planStatusText}\n` +
      `• **Tự động quét nền 24/7:** ${sub.enabled ? '🟢 **Đang bật**' : '🔴 **Đang tắt**'}\n` +
      `• **Thông báo DM:** ${sub.notify_dm ? '🔔 **Bật**' : '🔕 **Tắt**'}\n` +
      `• **Lần quét gần nhất:** ${sub.last_checked_at ? `<t:${Math.floor(sub.last_checked_at / 1000)}:R>` : 'Chưa quét'}`
    )
    .addFields(
      {
        name: `⏳ Nhiệm vụ đang mở (${pendingQuests.length})`,
        value: pendingQuests.length > 0
          ? pendingQuests.map((q) => `• ${q.config?.messages?.quest_name || q.config?.messages?.game_title || q.id}`).slice(0, 5).join('\n')
          : 'Không có nhiệm vụ nào cần làm.',
        inline: false,
      },
      {
        name: `✅ Nhiệm vụ đã hoàn thành (${completedQuests.length})`,
        value: completedQuests.length > 0
          ? completedQuests.map((q) => `• ${q.config?.messages?.quest_name || q.config?.messages?.game_title || q.id}`).slice(0, 5).join('\n')
          : 'Chưa có nhiệm vụ nào hoàn thành.',
        inline: false,
      }
    )
    .setFooter({ text: 'Lowkey Quest Shop • Thông tin trực tuyến từ Discord' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('qshop:update_token')
      .setLabel('🔄 Cập Nhật Token Mới')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('qshop:scan_now')
      .setLabel('⚡ Quét & Làm Ngay')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('qshop:toggle_dm')
      .setLabel(sub.notify_dm ? '🔕 Tắt Thông Báo DM' : '🔔 Bật Thông Báo DM')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Xử lý mọi tương tác từ Shop (Buttons, Modals, Select Menus)
 */
async function handleShopInteraction(interaction, client) {
  const customId = interaction.customId || '';

  // 1. Mua Quest Lẻ
  if (customId === 'qshop:buy_single') {
    const savedPrompt = buildSavedTokenShopPayload(interaction.user.id, 'single');
    if (savedPrompt) {
      return interaction.reply({ flags: 64, ...savedPrompt });
    }
    return interaction.showModal(buildTokenModal('single'));
  }

  // 2. Mua Gói Tháng
  if (customId === 'qshop:buy_monthly') {
    const savedPrompt = buildSavedTokenShopPayload(interaction.user.id, 'monthly');
    if (savedPrompt) {
      return interaction.reply({ flags: 64, ...savedPrompt });
    }
    return interaction.showModal(buildTokenModal('monthly'));
  }

  // Khách chọn nhập Token khác / mới
  if (customId.startsWith('qshop:prompt_token:')) {
    const packageType = customId.split(':')[2] || 'single';
    return interaction.showModal(buildTokenModal(packageType));
  }

  // Hủy thao tác dùng token đã lưu
  if (customId === 'qshop:cancel_prompt') {
    return interaction.update({
      content: '❌ Đã hủy thao tác.',
      embeds: [],
      components: [],
    });
  }

  // Khách chọn Dùng Token Đã Lưu (Không cần nhập lại)
  if (customId.startsWith('qshop:use_saved:')) {
    const packageType = customId.split(':')[2] || 'single';
    await interaction.update({
      content: '⏳ Đang khởi tạo hóa đơn thanh toán cho bạn...',
      embeds: [],
      components: [],
      files: [],
    });

    const sub = getSubscriber(interaction.user.id);
    if (!sub || !sub.token || sub.token.length < 20) {
      return interaction.followUp({
        flags: 64,
        content: '⚠️ Không tìm thấy token đã lưu. Vui lòng bấm tạo đơn lại để nhập token mới.',
        embeds: [],
        components: [],
      });
    }

    let userInfo;
    try {
      userInfo = await fetchUserInfo(sub.token);
    } catch (err) {
      // Token hết hạn / 401
      const db = getDb();
      try {
        db.prepare('UPDATE quest_subscribers SET enabled = 0 WHERE user_id = ?').run(interaction.user.id);
      } catch (e) {}

      const expiredEmbed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('❌ TOKEN ĐÃ LƯU ĐÃ HẾT HẠN HOẶC KHÔNG HỢP LỆ')
        .setDescription(
          `Token đã lưu của tài khoản **@${sub.username || 'User'}** không thể xác thực (lỗi: ${err.message}).\n\n` +
          `• Có thể bạn vừa đổi mật khẩu Discord, đổi 2FA hoặc đăng xuất khỏi Discord.\n` +
          `• Hãy bấm **🔄 Nhập Token Mới** bên dưới để cập nhật lại token mới nhé!`
        );

      const changeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`qshop:prompt_token:${packageType}`)
          .setLabel('Nhập Token Mới')
          .setEmoji('🔄')
          .setStyle(ButtonStyle.Primary)
      );

      return interaction.followUp({ flags: 64, embeds: [expiredEmbed], components: [changeRow] });
    }

    const username = userInfo.global_name || userInfo.username;

    if (packageType === 'single') {
      let quests = [];
      try {
        quests = await fetchQuests(sub.token);
      } catch (e) {
        return interaction.followUp({ flags: 64, content: `❌ Không thể tải danh sách Quest: ${e.message}`, embeds: [], components: [] });
      }

      const pendingQuests = quests.filter((q) => !q.user_status?.completed_at && !q.user_status?.claimed_at);
      if (pendingQuests.length === 0) {
        return interaction.followUp({
          flags: 64,
          content: `ℹ️ Tài khoản **@${username}** hiện không có nhiệm vụ Discord nào chưa hoàn thành! Hãy quay lại khi Discord ra mắt Quest mới nhé.`,
          embeds: [],
          components: [],
        });
      }

      const cfg = getBankConfig();
      const order = createOrder({
        userId: interaction.user.id,
        username,
        token: sub.token,
        packageType: 'single',
        questCount: 1,
        amount: cfg.singleQuestPrice,
      });

      const payload = buildQuestSelectionPayload(order.order_id, pendingQuests, username);
      return interaction.followUp({ flags: 64, ...payload });
    } else {
      const cfg = getBankConfig();
      const order = createOrder({
        userId: interaction.user.id,
        username,
        token: sub.token,
        packageType: 'monthly',
        questCount: 999,
        amount: cfg.monthlyPackagePrice,
      });

      const payload = await buildPaymentPayload(order);
      return interaction.followUp({ flags: 64, ...payload });
    }
  }

  // 3. Cài Đặt Ngân Hàng (Admin)
  if (customId === 'qshop:admin_config') {
    if (!isShopAdmin(interaction.user, interaction.guild)) {
      return interaction.reply({
        content: `❌ Nút này chỉ dành cho Admin của Bot (ID: \`${OWNER_ID}\`) hoặc Chủ Server!`,
        flags: 64,
      });
    }
    return interaction.showModal(buildAdminConfigModal());
  }

  // 4. Modal Submit Cài Đặt Ngân Hàng
  if (interaction.isModalSubmit() && customId === 'qshop:modal_config') {
    if (!isShopAdmin(interaction.user, interaction.guild)) return;
    const bankId = interaction.fields.getTextInputValue('bank_id').trim().toUpperCase();
    const bankAccount = interaction.fields.getTextInputValue('bank_account').trim();
    const bankName = interaction.fields.getTextInputValue('bank_name').trim().toUpperCase();
    const sepayApiKey = interaction.fields.getTextInputValue('sepay_api_key').trim();

    await interaction.deferReply({ flags: 64 });

    setBankConfig('bank_id', bankId);
    setBankConfig('bank_account', bankAccount);
    setBankConfig('bank_name', bankName);
    setBankConfig('sepay_api_key', sepayApiKey);

    let sepayStatusText = 'Chưa cài đặt (Duyệt thủ công 1-click)';
    if (sepayApiKey) {
      const testRes = await fetchSePayTransactions(sepayApiKey);
      if (testRes.success) {
        sepayStatusText = `✅ **Kết nối SePay thành công!** (Nhận diện ${testRes.transactions.length} giao dịch gần nhất qua ${testRes.authType} - Tự động duyệt BẬT)`;
      } else {
        sepayStatusText = `⚠️ **Kết nối SePay thất bại (${testRes.error || `HTTP ${testRes.status}`})**\n  *Lưu ý: Bạn hãy vào my.sepay.vn -> Cấu hình công ty -> API Access để copy đúng API Token nhé.*`;
      }
    }

    return interaction.editReply({
      content:
        `✅ **Đã lưu cấu hình thanh toán thành công!**\n\n` +
        `• Ngân hàng: **${bankId}**\n` +
        `• Số tài khoản: \`${bankAccount}\`\n` +
        `• Chủ tài khoản: **${bankName}**\n` +
        `• Trạng thái SePay: ${sepayStatusText}`,
    });
  }

  // 5. Modal Submit Token (Single, Monthly, hoặc Update)
  if (interaction.isModalSubmit() && customId.startsWith('qshop:modal_token:')) {
    const packageType = customId.split(':')[2];
    const rawToken = interaction.fields.getTextInputValue('user_token').trim();

    await interaction.deferReply({ flags: 64 });

    let userInfo;
    try {
      userInfo = await fetchUserInfo(rawToken);
    } catch (err) {
      return interaction.editReply({
        content: `❌ **Token không hợp lệ hoặc đã hết hạn!** Vui lòng kiểm tra lại token và thử lại nhé.\n*(Chi tiết: ${err.message})*`,
      });
    }

    const username = userInfo.global_name || userInfo.username;

    // Tự động ghi nhớ / lưu token vào hệ thống để các lần sau không cần nhập lại
    try {
      registerSubscriber(interaction.user.id, rawToken, username, 1);
    } catch (e) {}

    if (packageType === 'update') {
      return interaction.editReply({
        content: `✅ **Đã cập nhật Token thành công!**\nTài khoản **@${username}** đã được ghi nhớ và sẵn sàng hoạt động tự động.`,
      });
    }

    if (packageType === 'single') {
      // Lấy danh sách quests để cho khách chọn
      let quests = [];
      try {
        quests = await fetchQuests(rawToken);
      } catch (e) {
        return interaction.editReply({ content: `❌ Không thể tải danh sách Quest: ${e.message}` });
      }

      const pendingQuests = quests.filter((q) => !q.user_status?.completed_at && !q.user_status?.claimed_at);
      if (pendingQuests.length === 0) {
        return interaction.editReply({
          content: `ℹ️ Tài khoản **@${username}** hiện không có nhiệm vụ Discord nào chưa hoàn thành! Hãy quay lại khi Discord ra mắt Quest mới nhé.`,
        });
      }

      // Tạo đơn nháp
      const cfg = getBankConfig();
      const order = createOrder({
        userId: interaction.user.id,
        username,
        token: rawToken,
        packageType: 'single',
        questCount: 1,
        amount: cfg.singleQuestPrice,
      });

      const payload = buildQuestSelectionPayload(order.order_id, pendingQuests, username);
      return interaction.editReply(payload);
    } else {
      // Gói Tháng: Tạo ngay đơn
      const cfg = getBankConfig();
      const order = createOrder({
        userId: interaction.user.id,
        username,
        token: rawToken,
        packageType: 'monthly',
        questCount: 999,
        amount: cfg.monthlyPackagePrice,
      });

      const payload = await buildPaymentPayload(order);
      return interaction.editReply(payload);
    }
  }

  // 6. Select Menu: Khách hàng chọn danh sách quest lẻ
  if (interaction.isStringSelectMenu() && customId.startsWith('qshop:select_quests:')) {
    const orderId = customId.split(':')[2];
    const selectedIds = interaction.values;
    const order = getOrder(orderId);

    if (!order) {
      return interaction.reply({ content: '❌ Không tìm thấy thông tin đơn hàng này.', flags: 64 });
    }

    await interaction.update({
      content: '⏳ Đang tạo hóa đơn thanh toán cho các nhiệm vụ bạn đã chọn...',
      embeds: [],
      components: [],
      files: [],
    });

    // Lấy lại danh sách tên nhiệm vụ
    let quests = [];
    try {
      quests = await fetchQuests(order.token);
    } catch (e) {}

    const selectedQuests = quests.filter((q) => selectedIds.includes(q.id));
    const questNames = selectedQuests.map(
      (q) => q.config?.messages?.quest_name || q.config?.messages?.game_title || q.id
    );

    const cfg = getBankConfig();
    const questCount = selectedIds.length;
    const totalAmount = questCount * cfg.singleQuestPrice;

    // Cập nhật đơn hàng
    const db = getDb();
    db.prepare(`
      UPDATE quest_orders SET
        quest_ids_json = ?,
        quest_names_json = ?,
        quest_count = ?,
        amount = ?
      WHERE order_id = ?
    `).run(JSON.stringify(selectedIds), JSON.stringify(questNames), questCount, totalAmount, orderId);

    const updatedOrder = getOrder(orderId);
    const payload = await buildPaymentPayload(updatedOrder);
    return interaction.followUp({ flags: 64, ...payload });
  }

  // 7. Khách bấm [🔄 Đã Chuyển Tiền / Kiểm Tra]
  if (customId.startsWith('qshop:check_pay:')) {
    const orderId = customId.split(':')[2];
    const order = getOrder(orderId);

    if (!order) {
      return interaction.reply({ content: '❌ Đơn hàng không tồn tại hoặc đã bị hủy.', flags: 64 });
    }

    if (order.status === 'completed') {
      const payload = await buildPaymentPayload(order);
      if (typeof interaction.update === 'function') {
        return interaction.update(payload);
      }
      return interaction.reply({ content: 'Đơn hàng này đã hoàn thành!', flags: 64 });
    }

    const tenMinutesMs = 10 * 60 * 1000;
    if (order.status === 'cancelled' || Date.now() - order.created_at > tenMinutesMs) {
      if (order.status !== 'cancelled') {
        updateOrderStatus(order.order_id, 'cancelled', { error: 'Hết hạn thanh toán (quá 10 phút)' });
      }
      const expiredPayload = await buildPaymentPayload({ ...order, status: 'cancelled' });
      if (typeof interaction.update === 'function') {
        return interaction.update(expiredPayload);
      }
      return interaction.reply({ content: 'Đơn hàng này đã hết hạn (quá 10 phút) và đã được hủy tự động.', flags: 64 });
    }

    if (order.check_count > 0 && !isOwner(interaction.user.id)) {
      return interaction.reply({
        content: `⏳ **Bạn đã gửi yêu cầu xác nhận đơn hàng #${order.order_id} rồi!**\n\n• Hệ thống và SePay đang tự động quét kiểm tra mỗi 15 giây.\n• Vui lòng **không bấm liên tục** để tránh quá tải.\n• Khi nhận được tiền, bot sẽ tự động thực hiện nhiệm vụ và gửi thông báo DM cho bạn ngay lập tức!`,
        flags: 64,
      });
    }

    // Cập nhật ngay trên bảng mã QR hiện tại (đóng bảng in-place)
    if (typeof interaction.deferUpdate === 'function') {
      await interaction.deferUpdate();
    } else if (typeof interaction.deferReply === 'function') {
      await interaction.deferReply({ flags: 64 });
    }

    // Bước 1: Kiểm tra thanh toán SePay (thử 2 lần cách nhau 2.5s phòng khi ngân hàng trễ vài giây)
    let autoPaid = await checkSePayPayment(order);
    if (!autoPaid) {
      await new Promise((r) => setTimeout(r, 2500));
      autoPaid = await checkSePayPayment(order);
    }

    if (autoPaid) {
      // ĐÓNG BẢNG MÃ QR NGAY LẬP TỨC VÀ BÁO NHẬN ĐƯỢC TIỀN
      const processingEmbed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle(`🎉 ĐÃ NHẬN ĐƯỢC TIỀN ĐƠN HÀNG #${order.order_id}!`)
        .setDescription(
          `✅ Hệ thống SePay đã xác nhận thanh toán thành công **${formatVnd(order.amount)}**!\n\n` +
          `⏳ **Đang tự động cày nhiệm vụ và nhận điểm ORBs cho bạn...** Vui lòng đợi trong giây lát!`
        )
        .setFooter({ text: 'Lowkey Quest Shop • Bảng thanh toán QR đã đóng' })
        .setTimestamp();

      await interaction.editReply({
        content: null,
        embeds: [processingEmbed],
        components: [],
      });

      // Xử lý hoàn thành đơn hàng & gửi thông báo DM cho khách hàng
      const res = await processPaidOrder(order.order_id, client);

      let resultEmbed;
      if (res.type === 'monthly') {
        const expDate = new Date(res.expiresAt).toLocaleDateString('vi-VN');
        resultEmbed = new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle(`👑 KÍCH HOẠT GÓI THÁNG THÀNH CÔNG — ĐƠN #${order.order_id}`)
          .setDescription(
            `Cảm ơn bạn đã đăng ký **Gói Tự Động Theo Tháng (30 Ngày)** tại Lowkey Bot!\n\n` +
            `• **Mã đơn hàng:** \`${order.order_id}\`\n` +
            `• **Số tiền:** **${formatVnd(order.amount)}** (Đã nhận qua SePay)\n` +
            `• **Hạn sử dụng:** Đến ngày **${expDate}**\n` +
            `• **Trạng thái:** ✅ Bot đang chạy ngầm 24/7, tự động cày tất cả nhiệm vụ và tích lũy điểm ORB vào tài khoản của bạn!`
          )
          .setFooter({ text: 'Lowkey Quest Shop • Bảng thanh toán đã đóng' })
          .setTimestamp();
      } else {
        const results = res.results || [];
        resultEmbed = new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle(`🎉 HOÀN TẤT ĐƠN HÀNG #${order.order_id} — ĐÃ NHẬN THƯỞNG!`)
          .setDescription(
            `Đơn hàng Quest Lẻ của bạn đã được bot thực hiện xong 100%:\n\n` +
            (results.length > 0
              ? results.map((r, i) => `**${i + 1}. ${r.name}**\n↪ ${r.success ? '✅ ' + r.message : '⚠️ ' + r.error}`).join('\n\n')
              : '✅ Hoàn thành 100% các nhiệm vụ đã chọn!') +
            `\n\n🎁 **Phần thưởng & Điểm ORBs** đã được chuyển thẳng vào tài khoản Discord của bạn. Mở **Cài đặt -> Quests** để kiểm tra nhé!`
          )
          .setFooter({ text: 'Lowkey Quest Shop • Bảng thanh toán đã đóng' })
          .setTimestamp();
      }

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('qshop:dismiss_notice')
          .setLabel('Đóng Thông Báo')
          .setEmoji('🗑️')
          .setStyle(ButtonStyle.Secondary)
      );

      return interaction.editReply({
        content: null,
        embeds: [resultEmbed],
        components: [closeRow],
      });
    }

    // Nếu SePay chưa nhận được: Cập nhật thông báo nhắc nhở nhưng KHÔNG KHÓA NÚT bấm vĩnh viễn
    const checkCount = (order.check_count || 0) + 1;
    const db = getDb();
    db.prepare('UPDATE quest_orders SET check_count = ?, checked_at = ? WHERE order_id = ?').run(checkCount, Date.now(), order.order_id);

    // Gửi thông báo tới Admin nếu chưa gửi
    if (checkCount === 1) {
      const adminUser = await client.users.fetch(OWNER_ID).catch(() => null);
      if (adminUser) {
        const adminEmbed = new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle('🔔 [LOWKEY SHOP] YÊU CẦU XÁC NHẬN THANH TOÁN MỚI')
          .setDescription(
            `Khách hàng **<@${order.user_id}>** (${order.username}) vừa bấm báo đã chuyển tiền:\n\n` +
            `• **Mã đơn:** \`${order.order_id}\`\n` +
            `• **Loại gói:** ${order.package_type === 'monthly' ? '👑 **Gói Tháng (40.000đ)**' : `🎯 **Quest Lẻ (${order.quest_count} nv - ${formatVnd(order.amount)})**`}\n` +
            `• **Số tiền:** **${formatVnd(order.amount)}**\n` +
            `• **Nội dung CK:** \`SEVQR ${order.order_id}\`\n\n` +
            `*Hệ thống đang tự động quét SePay. Nếu bạn đã thấy tiền vào tài khoản ngân hàng, có thể bấm nút xanh bên dưới để duyệt ngay!*`
          )
          .setTimestamp();

        const adminRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`qshop:admin_approve:${order.order_id}`)
            .setLabel('✅ Xác Nhận Đã Nhận Tiền')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`qshop:admin_reject:${order.order_id}`)
            .setLabel('❌ Chưa Nhận Được Tiền')
            .setStyle(ButtonStyle.Danger)
        );

        adminUser.send({ embeds: [adminEmbed], components: [adminRow] }).catch(() => {});
      }
    }

    const payload = await buildPaymentPayload(order);
    payload.content =
      `⏳ **ĐÃ GHI NHẬN YÊU CẦU: Chưa thấy giao dịch chuyển khoản cho đơn #${order.order_id}!**\n` +
      `• Nếu bạn vừa chuyển tiền, vui lòng đợi 10-20 giây để ngân hàng chuyển tiếp qua SePay rồi bấm lại nút **Đã Chuyển Tiền / Kiểm Tra** nhé.\n` +
      `• Vui lòng đảm bảo nội dung chuyển khoản chính xác là: \`SEVQR ${order.order_id}\`.\n` +
      `• Hạn thanh toán: còn <t:${Math.floor((order.created_at + tenMinutesMs) / 1000)}:R>.`;

    return interaction.editReply(payload);
  }

  // 8. Admin bấm duyệt thanh toán 1-Click
  if (customId.startsWith('qshop:admin_approve:')) {
    if (!isOwner(interaction.user.id)) return;
    const orderId = customId.split(':')[2];
    const order = getOrder(orderId);

    if (!order) {
      return interaction.reply({ content: '❌ Đơn hàng không tồn tại.', flags: 64 });
    }

    await interaction.deferUpdate();

    const res = await processPaidOrder(order.order_id, client);

    return interaction.editReply({
      content: `✅ **ĐÃ XÁC NHẬN ĐƠN HÀNG \`${orderId}\` THÀNH CÔNG!** Bot đã chạy xong và thông báo cho khách hàng qua DM.`,
      components: [],
    });
  }

  // 9. Admin bấm từ chối thanh toán
  if (customId.startsWith('qshop:admin_reject:')) {
    if (!isOwner(interaction.user.id)) return;
    const orderId = customId.split(':')[2];
    await interaction.deferUpdate();
    return interaction.editReply({
      content: `❌ Đã đánh dấu đơn hàng \`${orderId}\` là chưa nhận được tiền.`,
      components: [],
    });
  }

  // 10. Hủy Đơn Hàng
  if (customId.startsWith('qshop:cancel_order:')) {
    const orderId = customId.split(':')[2];
    updateOrderStatus(orderId, 'cancelled');
    return interaction.update({
      content: `❌ **Đã hủy đơn hàng \`${orderId}\`.** Bạn có thể tạo lại đơn bất cứ lúc nào!`,
      embeds: [],
      components: [],
    });
  }

  // 11. Đóng thông báo hoàn tất đơn hàng
  if (customId === 'qshop:dismiss_notice') {
    return interaction.update({
      content: '✅ **Đã đóng thông báo đơn hàng.** Cảm ơn bạn đã tin dùng dịch vụ Lowkey Shop!',
      embeds: [],
      components: [],
    });
  }

  // 12. Kiểm tra gói & tài khoản
  if (customId === 'qshop:check_status') {
    await interaction.deferReply({ flags: 64 });
    const payload = await buildStatusPayload(interaction.user.id);
    return interaction.editReply(payload);
  }

  // 13. Hướng dẫn lấy Token
  if (customId === 'qshop:token_guide') {
    const { buildTokenGuidePayload } = require('./questManager');
    const payload = buildTokenGuidePayload();
    return interaction.reply({ flags: 64, ...payload });
  }

  // 14. Quét ngay bây giờ (từ menu check status)
  if (customId === 'qshop:scan_now') {
    const sub = getSubscriber(interaction.user.id);
    if (!sub || !sub.token) {
      return interaction.reply({ content: '❌ Bạn chưa có tài khoản lưu trong hệ thống.', flags: 64 });
    }
    const { executeAutoQuestFlow } = require('./questManager');
    return executeAutoQuestFlow(interaction, sub.token, interaction.user.id, sub.username || interaction.user.username);
  }

  // 15. Bật/Tắt DM
  if (customId === 'qshop:toggle_dm') {
    const { toggleNotifyDm } = require('./questScheduler');
    const newState = toggleNotifyDm(interaction.user.id);
    return interaction.reply({
      content: newState ? '🔔 Đã **BẬT** nhận thông báo DM khi có kết quả làm quest!' : '🔕 Đã **TẮT** nhận thông báo DM.',
      flags: 64,
    });
  }

  // 16. Cập nhật Token mới
  if (customId === 'qshop:update_token') {
    return interaction.showModal(buildTokenModal('update'));
  }
}

let orderCheckerTimer = null;

function startOrderChecker(client) {
  if (orderCheckerTimer) return;
  orderCheckerTimer = setInterval(async () => {
    try {
      const db = getDb();
      const tenMinutesMs = 10 * 60 * 1000;
      const tenMinutesAgo = Date.now() - tenMinutesMs;

      // 1. Tự động hủy các đơn hàng tạo quá 10 phút chưa thanh toán
      db.prepare(`
        UPDATE quest_orders
        SET status = 'cancelled', error_message = 'Hết hạn thanh toán (quá 10 phút)'
        WHERE status = 'pending' AND created_at < ?
      `).run(tenMinutesAgo);

      const { sepayApiKey } = getBankConfig();
      if (!sepayApiKey) return;

      // 2. Chỉ kiểm tra các đơn hàng pending còn trong thời hạn 10 phút
      const pendingOrders = db.prepare(
        "SELECT * FROM quest_orders WHERE status = 'pending' AND created_at >= ? ORDER BY created_at DESC LIMIT 20"
      ).all(tenMinutesAgo);

      if (!pendingOrders || pendingOrders.length === 0) return;

      const fetchResult = await fetchSePayTransactions(sepayApiKey);
      if (!fetchResult.success || !Array.isArray(fetchResult.transactions) || fetchResult.transactions.length === 0) {
        return;
      }

      for (const order of pendingOrders) {
        const match = matchTransactionWithOrder(fetchResult.transactions, order);
        if (match) {
          console.log(`[SEPAY AUTO-POLL] 🎉 Phát hiện đơn hàng #${order.order_id} đã thanh toán thành công!`);
          await processPaidOrder(order.order_id, client).catch(console.error);
        }
      }
    } catch (err) {
      console.error('[SEPAY POLLER ERROR]', err.message);
    }
  }, 15000);
  if (orderCheckerTimer.unref) orderCheckerTimer.unref();
}

/**
 * Đảm bảo Bảng Cửa Hàng tồn tại ở kênh TARGET_CHANNEL_ID
 */
async function ensureShopPanel(client) {
  startOrderChecker(client);
  try {
    const { channelId, panelMessageId } = getBankConfig();
    const targetId = channelId || TARGET_CHANNEL_ID;
    const channel = await client.channels.fetch(targetId).catch(() => null);

    if (!channel || !channel.isTextBased()) {
      console.warn(`[QUEST SHOP] Không tìm thấy kênh cửa hàng (ID: ${targetId}).`);
      return null;
    }

    const payload = buildShopPanelPayload();

    if (panelMessageId) {
      const existingMsg = await channel.messages.fetch(panelMessageId).catch(() => null);
      if (existingMsg) {
        await existingMsg.edit(payload).catch(() => {});
        console.log(`[QUEST SHOP] Đã đồng bộ bảng cửa hàng tại kênh #${channel.name} (${targetId}).`);
        return existingMsg;
      }
    }

    // Nếu chưa có tin nhắn, gửi tin nhắn mới và lưu ID
    const newMsg = await channel.send(payload);
    setBankConfig('panel_message_id', newMsg.id);
    newMsg.pin().catch(() => {});
    console.log(`[QUEST SHOP] Đã khởi tạo bảng cửa hàng mới tại kênh #${channel.name} (${targetId}).`);
    return newMsg;
  } catch (err) {
    console.warn('[QUEST SHOP] Không thể thiết lập bảng cửa hàng:', err.message);
    return null;
  }
}

module.exports = {
  TARGET_CHANNEL_ID,
  OWNER_ID,
  SINGLE_QUEST_PRICE,
  MONTHLY_PACKAGE_PRICE,
  BANK_NAMES,
  getBankConfig,
  setBankConfig,
  getVietQrUrl,
  createOrder,
  getOrder,
  updateOrderStatus,
  processPaidOrder,
  buildShopPanelPayload,
  buildTokenModal,
  buildAdminConfigModal,
  buildQuestSelectionPayload,
  buildPaymentPayload,
  buildStatusPayload,
  buildSavedTokenShopPayload,
  isShopAdmin,
  handleShopInteraction,
  ensureShopPanel,
  startOrderChecker,
  fetchSePayTransactions,
  matchTransactionWithOrder,
  checkSePayPayment,
  DEFAULT_PANEL_TITLE,
  DEFAULT_PANEL_DESCRIPTION,
  DEFAULT_PANEL_FOOTER,
  DEFAULT_PANEL_COLOR,
};
