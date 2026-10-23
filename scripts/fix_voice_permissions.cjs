require('dotenv').config();
const token = (process.env.TOKEN || process.env.DISCORD_TOKEN || '').replace(/^["']|["']$/g, '').trim();
const { Client, GatewayIntentBits, PermissionFlagsBits, ChannelType } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

client.once('ready', async () => {
  try {
    console.log(`[BOT] Logged in as ${client.user.tag}`);
    const guildId = process.env.GUILD_ID || '1555173619129122866';
    const guild = client.guilds.cache.get(guildId) || client.guilds.cache.first();

    if (!guild) {
      console.error(`[ERROR] Guild ${guildId} not found!`);
      process.exit(1);
    }

    console.log(`[FIX] Processing guild: "${guild.name}" (${guild.id})`);
    const me = guild.members.me;
    console.log('[BOT PERMS]', {
      ManageRoles: me.permissions.has(PermissionFlagsBits.ManageRoles),
      ManageChannels: me.permissions.has(PermissionFlagsBits.ManageChannels),
      Administrator: me.permissions.has(PermissionFlagsBits.Administrator)
    });

    if (!me.permissions.has(PermissionFlagsBits.ManageRoles) && !me.permissions.has(PermissionFlagsBits.Administrator)) {
      throw new Error('Bot thiếu quyền ManageRoles/Administrator để sửa quyền vai trò @everyone!');
    }

    // 1. Cập nhật quyền @everyone ở cấp Server: BẬT Use Voice Activity (UseVAD)
    const everyoneRole = guild.roles.everyone;
    const currentHasVAD = everyoneRole.permissions.has(PermissionFlagsBits.UseVAD);
    console.log(`[EVERYONE] Hiện tại UseVAD: ${currentHasVAD}`);

    if (!currentHasVAD) {
      console.log('[EVERYONE] Đang thêm quyền UseVAD (Sử dụng hoạt động thoại) cho @everyone...');
      const newPerms = everyoneRole.permissions.add(PermissionFlagsBits.UseVAD, PermissionFlagsBits.Speak);
      await everyoneRole.setPermissions(newPerms, 'Tắt bắt buộc Push-to-Talk toàn server, cho phép nói tự do');
      console.log('[EVERYONE] ✅ Đã cập nhật thành công: @everyone hiện đã có quyền Use Voice Activity!');
    } else {
      console.log('[EVERYONE] ✅ @everyone đã có sẵn quyền Use Voice Activity.');
    }

    // 2. Lấy danh sách kênh
    await guild.channels.fetch();
    const channels = guild.channels.cache;

    // Tìm Category Cinema
    const cinemaCategory = channels.find(c => {
      const isCat = c.type === ChannelType.GuildCategory;
      return isCat && /(?:cinema|rạp\s*phim)/i.test(c.name || '');
    });

    const cinemaChannelIds = new Set(['1561644668280774707', '1561645344796713031', '1561645508739727461']);
    const cinemaVoiceChannels = channels.filter(c => {
      const isVoice = c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice;
      if (!isVoice) return false;
      if (cinemaChannelIds.has(c.id)) return true;
      if (cinemaCategory && c.parentId === cinemaCategory.id) return true;
      return /(?:cinema|rạp\s*phim)/i.test(c.name || '');
    });

    console.log(`\n[CINEMA] Tìm thấy category: ${cinemaCategory ? cinemaCategory.name : 'Không có'}`);
    console.log(`[CINEMA] Tìm thấy ${cinemaVoiceChannels.size} phòng chiếu phim:`);
    for (const [id, vc] of cinemaVoiceChannels) {
      console.log(`  - #${vc.name} (id: ${id})`);
    }

    // 3. Đặt quyền RIÊNG cho 3 phòng Cinema (và Cinema Category nếu có):
    // BẮT BUỘC Push-to-Talk: Speak: true, UseVAD: false (Deny UseVAD)
    const targets = [];
    if (cinemaCategory) targets.push(cinemaCategory);
    for (const vc of cinemaVoiceChannels.values()) {
      if (!targets.some(t => t.id === vc.id)) targets.push(vc);
    }

    console.log(`\n[CINEMA] Đang áp dụng quyền BẮT BUỘC Push-to-Talk (Deny UseVAD) cho ${targets.length} mục Cinema...`);
    for (const target of targets) {
      try {
        await target.permissionOverwrites.edit(everyoneRole, {
          Speak: true,
          UseVAD: false, // Bắt buộc Push to Talk (chặn Voice Activity tự do)
          UseEmbeddedActivities: true,
          UseSoundboard: false,
          UseExternalSounds: false,
          SendVoiceMessages: false,
        }, { reason: 'VNL Cinema: Bắt buộc dùng Push-to-Talk (chặn Voice Activity) để tránh ồn khi chiếu phim' });
        console.log(`  ✅ Đã cập nhật quyền Push-to-Talk cho: #${target.name} (${target.id})`);
      } catch (err) {
        console.error(`  ❌ Lỗi khi cập nhật #${target.name}:`, err.message);
      }
    }

    // 4. Kiểm tra các kênh thoại thông thường khác: Đảm bảo không bị Deny UseVAD
    console.log(`\n[REGULAR CHANNELS] Kiểm tra các phòng voice thông thường...`);
    const regularVoiceChannels = channels.filter(c => {
      const isVoice = c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice;
      return isVoice && !targets.some(t => t.id === c.id);
    });

    for (const [id, vc] of regularVoiceChannels) {
      const ow = vc.permissionOverwrites.cache.get(everyoneRole.id);
      if (ow && ow.deny.has(PermissionFlagsBits.UseVAD)) {
        console.log(`  ⚠️ Kênh #${vc.name} đang bị DENY UseVAD! Đang gỡ bỏ...`);
        // Gỡ Deny UseVAD
        await vc.permissionOverwrites.edit(everyoneRole, {
          UseVAD: null
        }, { reason: 'Cho phép nói tự do (Voice Activity) ở kênh thông thường' });
        console.log(`  ✅ Đã mở UseVAD cho #${vc.name}`);
      }
    }

    console.log(`\n[DONE] Hoàn tất toàn bộ việc cập nhật quyền Voice!`);
  } catch (err) {
    console.error('[FATAL ERROR]', err);
  } finally {
    client.destroy();
    process.exit(0);
  }
});

client.login(token).catch(e => {
  console.error('[LOGIN ERROR]', e.message);
  process.exit(1);
});
