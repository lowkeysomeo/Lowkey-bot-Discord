'use strict';
const { randomInt, randomBytes } = require('node:crypto');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits: P } = require('discord.js');
const store = require('./giveawayStore');
const locks = new Map();
function serial(key, task) {
  const work = (locks.get(key) || Promise.resolve()).catch(() => {}).then(task);
  locks.set(key,work);
  return work.finally(() => { if (locks.get(key) === work) locks.delete(key); });
}
function problem(text) { const error = new Error(text); error.status = 400; throw error; }
const clean = text => String(text).replace(/@(everyone|here)/gi,'＠$1');
function duration(value) {
  const match = /^(\d+)\s*(m|h|d)$/i.exec(String(value).trim());
  const ms = match ? Number(match[1]) * ({m:60000,h:3600000,d:86400000}[match[2].toLowerCase()]) : 0;
  if (!Number.isSafeInteger(ms) || ms < 300000 || ms > 2592000000) problem('Thời lượng từ 5 phút đến 30 ngày. Ví dụ: 30m, 2h, 7d.');
  return ms;
}
function sample(users, size, previous = []) {
  const pool = [...new Set(users)].filter(id => !previous.includes(id));
  const result = [];
  while (pool.length && result.length < size) result.push(pool.splice(randomInt(pool.length),1)[0]);
  return result;
}
function card(row, total, test = false) {
  const done = row.status !== 'active' && !test;
  const cancelled = row.status === 'cancelled';
  const winners = JSON.parse(row.winners);
  const embed = new EmbedBuilder().setColor(cancelled ? 0x64748b : done ? 0xf0b84a : 0x9b72ee)
    .setTitle(`${test ? '🧪 BẢN THỬ · ' : ''}${cancelled ? 'GIVEAWAY ĐÃ HỦY' : done ? '🏆 CHÚC MỪNG NHỮNG CHỦ NHÂN MAY MẮN' : '🎉 MỘT MÓN QUÀ, THÊM NIỀM VUI'}`)
    .setDescription(`**${clean(row.prize)}**\n\n${clean(row.description) || 'Một món quà nhỏ dành cho cộng đồng. Chúc bạn có thật nhiều may mắn!'}\n\n${cancelled ? 'Giveaway đã được ban tổ chức hủy. Cảm ơn bạn đã quan tâm và hẹn gặp ở chương trình tiếp theo.' : done ? (winners.length ? `✨ **Người thắng cuộc**\n${winners.map((id,i) => `${i+1}. <@${id}>`).join('\n')}\n\nCảm ơn tất cả thành viên đã tham gia. Hẹn gặp bạn trong những giveaway tiếp theo!` : 'Chưa có thành viên đủ điều kiện để chọn người thắng. Cảm ơn bạn đã quan tâm!') : 'Bấm **🎉 Tham gia** bên dưới để ghi danh. Bấm lại nếu bạn muốn rút lượt.'}`)
    .addFields({name:'🎁 Phần thưởng',value:clean(row.prize),inline:true},{name:'🏅 Số người thắng',value:String(row.winner_count),inline:true},
      {name:'👥 Lượt tham gia',value:String(total),inline:true},{name:done ? '🗓 Thời gian dự kiến' : '⏳ Đóng nhận lượt',value:`<t:${Math.floor(row.ends_at/1000)}:F> · <t:${Math.floor(row.ends_at/1000)}:R>`},
      {name:'📋 Điều kiện',value:row.required_role ? `Là thành viên server và có role <@&${row.required_role}> khi tham gia và lúc quay.` : 'Là thành viên server; mỗi tài khoản có một lượt. Tài khoản bot không tham gia.'},
      {name:'🤝 Ban tổ chức',value:`<@${row.host_id}>`})
    .setFooter({text:`VietNam Legacy • ${test ? 'Bản thử không nhận lượt tham gia' : `Giveaway ${row.id}${row.round > 1 ? ` • Quay lại lần ${row.round-1}` : ''}`} • Quà do ban tổ chức trao`}).setTimestamp();
  return { embeds:[embed], components: done ? [] : [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`giveaway:join:${row.id}`).setStyle(ButtonStyle.Primary).setEmoji('🎉').setLabel(`Tham gia · ${total}`).setDisabled(test))], allowedMentions:{parse:[]} };
}
async function checkedChannel(guild,id) {
  const channel = await guild.channels.fetch(id).catch(() => null);
  if (!channel || channel.guildId !== guild.id || ![ChannelType.GuildText,ChannelType.GuildAnnouncement].includes(channel.type)) problem('Hãy chọn kênh văn bản của server này.');
  const me = guild.members.me || await guild.members.fetchMe();
  if (!channel.permissionsFor(me)?.has([P.ViewChannel,P.SendMessages,P.EmbedLinks,P.ReadMessageHistory])) problem('Bot cần quyền Xem kênh, Gửi tin nhắn, Nhúng liên kết và Đọc lịch sử tin nhắn.');
  return channel;
}
async function create(guild,hostId,input,test = false) {
  return serial(`create:${guild.id}`, async () => {
    if (!input || typeof input !== 'object') problem('Thông tin giveaway không hợp lệ.');
    const prize = typeof input.prize === 'string' ? input.prize.trim() : '';
    const description = input.description === undefined ? '' : typeof input.description === 'string' ? input.description.trim() : null;
    const n = Number(input.winners);
    if (!prize || prize.length > 200 || description === null || description.length > 1500 || !Number.isInteger(n) || n < 1 || n > 20) problem('Phần thưởng 1–200 ký tự, lời nhắn tối đa 1.500 ký tự, số người thắng 1–20.');
    const ms = duration(input.duration);
    const channel = await checkedChannel(guild,input.channelId);
    const role = input.requiredRole || null;
    if (role && (typeof role !== 'string' || !/^\d{1,20}$/.test(role) || !(await guild.roles.fetch(role).catch(() => null)) || role === guild.id)) problem('Role điều kiện không thuộc server này.');
    if (!test && store.activeCount(guild.id) >= 50) problem('Server đang có 50 giveaway. Hãy kết thúc bớt trước khi tạo mới.');
    const now = Date.now();
    const row = {id:randomBytes(8).toString('hex'),guild_id:guild.id,channel_id:channel.id,host_id:hostId,prize,description,winner_count:n,required_role:role,ends_at:now+ms,created_at:now};
    if (!test) store.create(row);
    let message;
    try { message = await channel.send({...card({...row,status:'active',winners:'[]',round:0},0,test),nonce:row.id,enforceNonce:true}); }
    catch { if (!test) store.patch(row.id,{status:'cancelled',updated:1,notice_state:'sent'}); problem('Chưa gửi được giveaway. Kiểm tra quyền của bot rồi thử lại.'); }
    if (!test) store.patch(row.id,{message_id:message.id,status:'active'});
    return {id:row.id,messageUrl:`https://discord.com/channels/${guild.id}/${channel.id}/${message.id}`};
  });
}
async function eligible(guild,row) {
  const result = [];
  const ids = store.entries(row.id);
  // Kiểm tra thành viên theo từng nhóm nhỏ trước khi quay thưởng.
  for (let i=0;i<ids.length;i+=10) {
    const batch = await Promise.all(ids.slice(i,i+10).map(async id => {
      try { const member = await guild.members.fetch({user:id,force:true}); return !member.user.bot && (!row.required_role || member.roles.cache.has(row.required_role)) ? id : null; }
      catch (error) { if (Number(error.code) === 10007) return null; throw error; }
    }));
    result.push(...batch.filter(Boolean));
  }
  return result;
}
async function publish(guild,row) {
  const channel = await checkedChannel(guild,row.channel_id);
  const message = await channel.messages.fetch(row.message_id);
  await message.edit(card(row,store.count(row.id)));
  store.patch(row.id,{updated:1,last_error:null,retry_at:0});
  const winners = JSON.parse(row.winners);
  if (row.status !== 'ended' || !winners.length) { store.patch(row.id,{notice_state:'sent'}); return; }
  if (row.notice_state !== 'pending') return;
  // Lưu trạng thái trước khi gửi để bot khởi động lại không tag người thắng lần nữa.
  store.patch(row.id,{notice_state:'sending'});
  try {
    const notice = await channel.send({content:`🎊 **${row.round > 1 ? 'KẾT QUẢ QUAY LẠI' : 'GIVEAWAY ĐÃ TÌM ĐƯỢC CHỦ NHÂN MAY MẮN!'}**\n\nChúc mừng ${winners.map(id=>`<@${id}>`).join(', ')}!\n🎁 Bạn đã được chọn nhận **${clean(row.prize)}**.\n\nVui lòng liên hệ ban tổ chức <@${row.host_id}> để nhận quà. Cảm ơn mọi người đã cùng tham gia và tạo nên một cộng đồng thật vui! 💜\n\n📌 https://discord.com/channels/${row.guild_id}/${row.channel_id}/${row.message_id}`,
      allowedMentions:{parse:[],users:winners},nonce:`${row.id}-${row.round}`,enforceNonce:true});
    store.patch(row.id,{notice_state:'sent',notice_id:notice.id});
  } catch { store.patch(row.id,{notice_state:'uncertain',last_error:'Chưa xác nhận gửi tin tag người thắng. Kết quả vẫn được lưu tại bài giveaway.'}); }
}
async function act(guild,id,action) {
  if (!['end','cancel','reroll'].includes(action)) problem('Thao tác giveaway không hợp lệ.');
  return serial(id,async () => {
    let row = store.get(id);
    if (!row || row.guild_id !== guild.id || !row.message_id) problem('Không tìm thấy giveaway trong server này.');
    if (action === 'cancel') {
      if (row.status !== 'active') problem('Chỉ hủy giveaway đang mở.');
      if (!store.finish(id,'active',row.round,{status:'cancelled',winners:row.winners,round:row.round})) problem('Giveaway vừa được cập nhật. Hãy tải lại để xem kết quả.');
    } else {
      if ((action === 'end' && row.status !== 'active') || (action === 'reroll' && row.status !== 'ended')) problem(action === 'end' ? 'Giveaway đã kết thúc.' : 'Chỉ quay lại giveaway đã kết thúc.');
      const oldWinners = action === 'reroll' ? JSON.parse(row.winners) : [];
      const selected = sample(await eligible(guild,row),row.winner_count,oldWinners);
      if (action === 'reroll' && !selected.length) problem('Không còn người tham gia đủ điều kiện ngoài danh sách thắng hiện tại.');
      if (!store.finish(id,row.status,row.round,{status:'ended',winners:JSON.stringify(selected),round:row.round+1})) problem('Giveaway vừa được cập nhật. Hãy tải lại để xem kết quả.');
    }
    row = store.get(id);
    try { await publish(guild,row); }
    catch { store.patch(id,{retry_at:Date.now()+60000,last_error:'Kết quả đã lưu; bot sẽ thử cập nhật bài đăng sau.'}); }
    return {ok:true, ...store.get(id)};
  });
}
async function handleButton(interaction) {
  await interaction.deferReply({flags:64});
  const match = /^giveaway:join:([a-f0-9]{16})$/.exec(interaction.customId);
  if (!interaction.inGuild() || !match || interaction.user.bot) return interaction.editReply('Nút giveaway không hợp lệ.');
  return serial(match[1],async () => {
    const row = store.get(match[1]);
    if (!row || row.guild_id !== interaction.guildId || row.channel_id !== interaction.channelId || row.message_id !== interaction.message.id || interaction.message.author.id !== interaction.client.user.id) return interaction.editReply('Giveaway này không có trong dữ liệu của bot.');
    if (row.status !== 'active' || row.ends_at <= Date.now()) return interaction.editReply('Giveaway đã đóng nhận lượt. Kết quả sẽ được cập nhật tại bài đăng.');
    const member = await interaction.guild.members.fetch({user:interaction.user.id,force:true});
    const already = store.entries(row.id).includes(member.id);
    if (!already && row.required_role && !member.roles.cache.has(row.required_role)) return interaction.editReply({content:`Bạn cần role <@&${row.required_role}> để tham gia giveaway này.`,allowedMentions:{parse:[]}});
    const result = store.toggle(row.id,interaction.user.id);
    await interaction.message.edit(card(row,result.count)).catch(() => {});
    return interaction.editReply(result.joined ? '🎉 Đã ghi danh thành công! Chúc bạn may mắn. Bấm lại nút nếu muốn rút lượt.' : 'Đã rút lượt tham gia. Bạn có thể tham gia lại trước khi giveaway đóng nhé.');
  });
}
async function tick(client) {
  for (const row of store.drafts()) {
    const guild = client.guilds.cache.get(row.guild_id);
    if (!guild || Date.now()-row.created_at < 60000) continue;
    await serial(row.id,async () => {
      if (store.get(row.id).status !== 'draft') return;
      try {
        const channel = await checkedChannel(guild,row.channel_id);
        const recent = await channel.messages.fetch({limit:100});
        const message = recent.find(m => m.author.id === client.user.id && m.components.some(actionRow => actionRow.components.some(c => c.customId === `giveaway:join:${row.id}`)));
        if (message) store.patch(row.id,{message_id:message.id,status:'active'});
        else store.patch(row.id,{status:'cancelled',updated:1,notice_state:'sent',last_error:'Bài đăng chưa hoàn tất trước khi bot khởi động lại. Hãy tạo giveaway mới.'});
      } catch { /* Giữ bản nháp để thử lại khi bot có quyền trong kênh. */ }
    });
  }
  for (const row of store.pending(Date.now())) {
    const guild = client.guilds.cache.get(row.guild_id);
    if (!guild) continue;
    try {
      if (row.status === 'active') await act(guild,row.id,'end');
      else await serial(row.id, () => publish(guild,store.get(row.id)));
    } catch { store.patch(row.id,{retry_at:Date.now()+60000,last_error:'Chưa thể kiểm tra thành viên hoặc cập nhật Discord. Bot sẽ thử lại.'}); }
  }
}
function start(client) {
  store.recoverNotices();
  let running = false;
  const run = async () => { if (running) return; running=true; try { await tick(client); } catch (error) { console.error('[GIVEAWAY]',error.name); } finally { running=false; } };
  void run();
  const timer = setInterval(run,15000); timer.unref();
  console.log('[GIVEAWAY] Giveaway system ready.');
  return timer;
}
async function command(interaction) {
  if (!interaction.memberPermissions?.has(P.Administrator)) return interaction.reply({content:'Chỉ admin server được quản lý giveaway.',flags:64});
  await interaction.deferReply({flags:64});
  const action = interaction.options.getSubcommand();
  if (action === 'list') {
    const rows=store.list(interaction.guildId).filter(r=>r.status==='active');
    return interaction.editReply({content:rows.length ? rows.map(r=>`🎉 **${clean(r.prize)}** · ID: \`${r.id}\` · <t:${Math.floor(r.ends_at/1000)}:R>`).join('\n').slice(0,1900) : 'Server chưa có giveaway đang mở.',allowedMentions:{parse:[]}});
  }
  try {
    if (action === 'create') {
      const result = await create(interaction.guild,interaction.user.id,{prize:interaction.options.getString('prize',true),duration:interaction.options.getString('duration',true),winners:interaction.options.getInteger('winners',true),channelId:interaction.options.getChannel('channel',true).id,description:interaction.options.getString('description') || '',requiredRole:interaction.options.getRole('role')?.id});
      return interaction.editReply(`✅ Giveaway đã sẵn sàng!\n${result.messageUrl}\nID quản lý: \`${result.id}\``);
    }
    const result = await act(interaction.guild,interaction.options.getString('id',true),action);
    return interaction.editReply(result.last_error || (result.notice_state === 'uncertain' ? 'Đã lưu kết quả tại bài giveaway; chưa xác nhận gửi được tin tag người thắng.' : '✅ Đã cập nhật giveaway thành công.'));
  } catch (error) { if (!error.status) console.error('[GIVEAWAY]',error.name); return interaction.editReply(error.status ? error.message : 'Chưa thể xử lý giveaway. Vui lòng thử lại sau.'); }
}
module.exports = { create,act,handleButton,start,tick,card,duration,sample,command };
