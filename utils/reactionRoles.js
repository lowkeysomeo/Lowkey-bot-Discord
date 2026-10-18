'use strict';
const {randomBytes}=require('node:crypto');
const {EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,PermissionFlagsBits:P}=require('discord.js');
const {getDb}=require('./database');
const {getPickLimit,isPickExpired}=require('./rolePickLimits');
const locks=new Map();
async function serial(key,fn){const task=(locks.get(key)||Promise.resolve()).catch(()=>{}).then(fn);locks.set(key,task);try{return await task;}finally{if(locks.get(key)===task)locks.delete(key);}}
function db(){const d=getDb();d.exec(`CREATE TABLE IF NOT EXISTS reaction_role_panels(id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,channel_id TEXT NOT NULL,message_id TEXT,title TEXT NOT NULL,description TEXT NOT NULL,choices TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 0,single_choice INTEGER NOT NULL DEFAULT 1);`);try{d.exec(`ALTER TABLE reaction_role_panels ADD COLUMN single_choice INTEGER NOT NULL DEFAULT 1;`);}catch(e){}return d;}
function fail(message){throw Object.assign(new Error(message),{status:400});}
const dangerous=['Administrator','ManageGuild','ManageRoles','ManageChannels','ManageWebhooks','KickMembers','BanMembers','ModerateMembers','ManageMessages','MentionEveryone','ManageThreads','ManageEvents','MuteMembers','DeafenMembers','MoveMembers'].reduce((a,k)=>a|(P[k]||0n),0n);
async function checkedRole(guild,id,me){
 const role=await guild.roles.fetch(id);
 if(!role||role.id===guild.id||role.managed||!me.permissions.has(P.ManageRoles)||me.roles.highest.comparePositionTo(role)<=0)fail('Role không còn khả dụng. Role bot phải nằm trên role tự nhận và bot cần quyền Manage Roles.');
 if((role.permissions.bitfield&dangerous)!==0n)fail('Không dùng role có quyền quản trị hoặc điều hành làm role tự nhận.');
 return role;
}
function list(guildId){return db().prepare('SELECT * FROM reaction_role_panels WHERE guild_id=? ORDER BY rowid DESC LIMIT 100').all(guildId).map(r=>({...r,choices:JSON.parse(r.choices),messageUrl:r.message_id?`https://discord.com/channels/${r.guild_id}/${r.channel_id}/${r.message_id}`:null}));}
function payload(row,now=Date.now()){const choices=typeof row.choices==='string'?JSON.parse(row.choices):row.choices;const rows=[];
 for(let i=0;i<choices.length;i+=5)rows.push(new ActionRowBuilder().addComponents(choices.slice(i,i+5).map((c,j)=>{
  const button=new ButtonBuilder().setCustomId(`rr:${row.id}:${i+j}`).setLabel(c.label).setStyle(ButtonStyle.Secondary).setDisabled(!row.active||isPickExpired(row.guild_id,c.roleId,now));
  if(c.emoji)button.setEmoji(c.emoji);
  return button;
 })));
 const expiryFields=choices.filter(c=>getPickLimit(row.guild_id,c.roleId)).map(c=>({name:'⏳ Thời hạn nhận role',value:`<@&${c.roleId}>: ${isPickExpired(row.guild_id,c.roleId,now)?'Đã hết hạn nhận. Thành viên đã nhận vẫn giữ role.':`Được nhận trước ${getPickLimit(row.guild_id,c.roleId).deadlineLabel}.`}`}));
 return {embeds:[new EmbedBuilder().addFields(expiryFields).setColor(0xb994e8).setTitle(row.title).setDescription(row.description).setFooter({text:row.active?'Bấm để nhận role • Bấm lại để bỏ role · VietNam Legacy':'Bảng nhận role đã đóng · VietNam Legacy'})],components:rows,allowedMentions:{parse:[]}};
}
async function create(guild,input){return serial(`panel:${guild.id}`,async()=>{
 if(!input||typeof input.title!=='string'||!input.title.trim()||input.title.length>150||typeof input.description!=='string'||!input.description.trim()||input.description.length>2000)fail('Nhập tiêu đề (tối đa 150 ký tự) và lời giới thiệu (tối đa 2000 ký tự).');
 if(!Array.isArray(input.choices)||input.choices.length<1||input.choices.length>10)fail('Mỗi bảng cần từ 1 đến 10 role.');
 if(db().prepare('SELECT COUNT(*) n FROM reaction_role_panels WHERE guild_id=? AND active=1').get(guild.id).n>=20)fail('Tối đa 20 bảng đang hoạt động. Hãy đóng bảng cũ trước.');
 if(typeof input.channelId!=='string'||!/^\d{17,20}$/.test(input.channelId))fail('Chọn kênh đăng bảng.');
 const me=await guild.members.fetchMe();const choices=[],seen=new Set();
 for(const c of input.choices){if(!c||typeof c.roleId!=='string'||!/^\d{17,20}$/.test(c.roleId)||seen.has(c.roleId))fail('Chọn các role khác nhau cho mỗi nút.');seen.add(c.roleId);const role=await checkedRole(guild,c.roleId,me);choices.push(await require('./reactionRoleEmoji').normalizeChoice(guild,c,role));}
 const channel=await guild.channels.fetch(input.channelId);
 if(!channel||![0,5].includes(channel.type)||!channel.permissionsFor(me)?.has([P.ViewChannel,P.SendMessages,P.EmbedLinks]))fail('Bot cần quyền xem kênh, gửi tin và nhúng liên kết tại kênh đã chọn.');
 const singleChoice=input.singleChoice===false||input.singleChoice===0?0:1;
 const row={id:randomBytes(8).toString('hex'),guild_id:guild.id,channel_id:channel.id,title:input.title.trim(),description:input.description.trim(),choices,active:0,single_choice:singleChoice};
 db().prepare('INSERT INTO reaction_role_panels(id,guild_id,channel_id,title,description,choices,single_choice) VALUES (?,?,?,?,?,?,?)').run(row.id,guild.id,channel.id,row.title,row.description,JSON.stringify(choices),singleChoice);
 try{const message=await channel.send(payload(row));db().prepare('UPDATE reaction_role_panels SET message_id=? WHERE id=?').run(message.id,row.id);await message.edit(payload({...row,active:1}));db().prepare('UPDATE reaction_role_panels SET active=1 WHERE id=?').run(row.id);return {id:row.id,messageUrl:`https://discord.com/channels/${guild.id}/${channel.id}/${message.id}`};}
 catch{fail('Chưa hoàn tất đăng bảng. Bảng chưa được kích hoạt; kiểm tra quyền bot rồi thử lại.');}
 });}
async function disable(guild,id){return serial(`panel:${guild.id}`,async()=>{
 const row=db().prepare('SELECT * FROM reaction_role_panels WHERE id=? AND guild_id=?').get(id,guild.id);if(!row)fail('Không tìm thấy bảng trong server này.');
 db().prepare('UPDATE reaction_role_panels SET active=0 WHERE id=?').run(id);
 try{const channel=await guild.channels.fetch(row.channel_id);const message=await channel.messages.fetch(row.message_id);await message.edit(payload({...row,active:0}));return {ok:true};}catch{return {ok:true,warning:'Đã vô hiệu hóa bảng. Chưa cập nhật được giao diện tin nhắn; các nút cũ sẽ không cấp role.'};}
 });}
async function handleButton(i){
 await i.deferReply({flags:64});
 if(!i.inGuild()||i.user.bot)return i.editReply('Chỉ thành viên server mới nhận được role.');
 const match=/^rr:([a-f0-9]{16}):(\d{1,2})$/.exec(i.customId);if(!match)return i.editReply('Nút không hợp lệ.');
 return serial(`panel:${i.guildId}`,()=>serial(`member:${i.guildId}:${i.user.id}`,async()=>{
 const row=db().prepare('SELECT * FROM reaction_role_panels WHERE id=? AND guild_id=?').get(match[1],i.guildId);
 if(!row||!row.active||row.channel_id!==i.channelId||row.message_id!==i.message.id||i.message.author.id!==i.client.user.id)return i.editReply('Bảng này đã đóng hoặc không còn hợp lệ.');
 const choices=JSON.parse(row.choices);
 const choice=choices[Number(match[2])];if(!choice)return i.editReply('Role không hợp lệ.');
 if(isPickExpired(i.guildId,choice.roleId))return replyExpired(i,row);
 try{const me=await i.guild.members.fetchMe();const role=await checkedRole(i.guild,choice.roleId,me);const member=await i.guild.members.fetch({user:i.user.id,force:true});const has=member.roles.cache.has(role.id);if(isPickExpired(i.guildId,choice.roleId))return replyExpired(i,row);if(has){await member.roles.remove(role.id,'Member tự bỏ role');}else{const isSingle=row.single_choice!==0;if(isSingle){const existingChoices=choices.filter(c=>c.roleId!==choice.roleId&&!isPickExpired(i.guildId,c.roleId)&&member.roles.cache.has(c.roleId));if(existingChoices.length>0){const currentLabels=existingChoices.map(c=>`**${c.label}**`).join(', ');return i.editReply({content:`⚠️ Bạn chỉ được chọn 1 role trong bảng này thôi (hiện bạn đang có ${currentLabels}). Hãy bấm lại vào nút ${currentLabels} để bỏ role trước khi chọn role khác nhé!`,allowedMentions:{parse:[]}});}}await member.roles.add(role.id,'Member tự nhận role');}return i.editReply({content:has?`Đã bỏ role **${choice.label}**. Bạn có thể nhận lại bất cứ lúc nào nhé.`:`✨ Bạn đã nhận role **${choice.label}**. Chào mừng bạn đến với nhóm!`,allowedMentions:{parse:[]}});}
 catch(error){return i.editReply(error.status?error.message:'Chưa thay đổi được role. Vui lòng nhờ admin kiểm tra quyền và vị trí role của bot.');}
 }));
}
// Kiểm tra lại ở máy chủ để nút cũ cũng không thể cấp role sau thời hạn.
async function replyExpired(interaction,row){
 await interaction.message.edit(payload(row)).catch(()=>{});
 return interaction.editReply({content:'⏳ Đợt nhận role này đã kết thúc từ 00:00 ngày 01/01/2027 (giờ Việt Nam). Thành viên đã nhận vẫn giữ role kỷ niệm; nút này không còn nhận hoặc bỏ role.',allowedMentions:{parse:[]}});
}

const panelRefreshState=new Map();
const refreshTimers=new WeakMap();
async function refreshTimedPanels(client,now=Date.now()){
 const rows=db().prepare('SELECT * FROM reaction_role_panels WHERE active=1 AND message_id IS NOT NULL').all();
 for(const initial of rows){
  if(!JSON.parse(initial.choices).some(c=>getPickLimit(initial.guild_id,c.roleId)))continue;
  await serial('panel:'+initial.guild_id,async()=>{
   const row=db().prepare('SELECT * FROM reaction_role_panels WHERE id=? AND active=1').get(initial.id);
   if(!row)return;
   const signature=JSON.stringify([row.message_id,row.choices,JSON.parse(row.choices).map(c=>isPickExpired(row.guild_id,c.roleId,now))]);
   if(panelRefreshState.get(row.id)===signature)return;
   const guild=client.guilds.cache.get(row.guild_id);if(!guild)return;
   try{
    const channel=await guild.channels.fetch(row.channel_id);
    const message=await channel.messages.fetch(row.message_id);
    if(message.author.id!==client.user.id)return;
    await message.edit(payload(row,now));
    panelRefreshState.set(row.id,signature);
   }catch(error){console.warn('[REACTION ROLE] Chưa cập nhật được thời hạn bảng '+row.id+': '+error.message);}
  });
 }
}
async function cleanupDuplicates(guild, panelId = null) {
 return serial(`cleanup:${guild.id}`, async () => {
  let rows;
  if (panelId) {
   rows = db().prepare('SELECT * FROM reaction_role_panels WHERE id=? AND guild_id=?').all(panelId, guild.id);
   if (!rows.length) fail('Không tìm thấy bảng trong server này.');
  } else {
   rows = db().prepare('SELECT * FROM reaction_role_panels WHERE guild_id=? AND active=1 AND single_choice!=0').all(guild.id);
  }
  if (!rows.length) return { success: true, panelsCount: 0, cleanedCount: 0, dmsSent: 0, cleanedUsers: [] };

  let members;
  try {
   const fetched = await guild.members.fetch();
   if (fetched instanceof Map || (fetched && typeof fetched.values === 'function')) {
    members = fetched;
   } else if (fetched) {
    members = new Map([[fetched.id || 'user', fetched]]);
   } else {
    members = guild.members.cache;
   }
  } catch {
   members = guild.members.cache;
  }

  let totalCleaned = 0;
  let dmsSent = 0;
  const cleanedUsers = [];

  for (const row of rows) {
   const choices = typeof row.choices === 'string' ? JSON.parse(row.choices) : row.choices;
   if (!Array.isArray(choices) || choices.length < 2) continue;

   const memberList = (members && typeof members.values === 'function')
    ? [...members.values()]
    : (Array.isArray(members) ? members : []);

   for (const member of memberList) {
    if (!member || member.user?.bot) continue;

    const owned = choices.filter(c => member.roles?.cache?.has(c.roleId));
    if (owned.length >= 2) {
     for (const c of owned) {
      try {
       await member.roles.remove(c.roleId, `Gỡ do pick trùng nhiều hơn 1 role (${row.title})`);
      } catch (err) {
       console.warn(`[REACTION ROLE CLEANUP] Không thể gỡ role ${c.roleId} của member ${member.id}: ${err.message}`);
      }
     }

     const labels = owned.map(c => `**${c.label}**`).join(', ');
     const messageUrl = row.message_id ? `https://discord.com/channels/${guild.id}/${row.channel_id}/${row.message_id}` : null;
     const linkNotice = messageUrl ? `\n👉 Bấm vào đây để chọn lại miền của bạn: ${messageUrl}` : '';
     const dmText = `Xin chào **${member.user?.displayName || member.user?.username || 'bạn'}**,\n\nHệ thống nhận thấy bạn đang chọn **${owned.length} role** trong bảng **${row.title}** (${labels}).\nTheo quy định của server, mỗi thành viên **chỉ được chọn 1 role** (ví dụ: chỉ chọn 1 trong 3 miền Bắc, Trung hoặc Nam).\n\nBot đã tự động gỡ các role này. Bạn vui lòng vào lại kênh để chọn đúng 1 role duy nhất nhé!${linkNotice}\n\n*VietNam Legacy trân trọng.*`;

     let sent = false;
     if (typeof member.send === 'function') {
      try {
       await member.send({ content: dmText, allowedMentions: { parse: [] } });
       sent = true;
       dmsSent++;
      } catch {}
     }

     totalCleaned++;
     cleanedUsers.push({
      userId: member.id,
      tag: member.user?.tag || member.user?.username || member.id,
      panelTitle: row.title,
      roles: owned.map(c => c.label),
      dmSent: sent,
     });

     if (process.env.DB_PATH !== ':memory:') {
      await new Promise(r => setTimeout(r, 200));
     }
    }
   }
  }

  return {
   success: true,
   panelsCount: rows.length,
   cleanedCount: totalCleaned,
   dmsSent,
   cleanedUsers,
  };
 });
}

function start(client){
 if(refreshTimers.has(client))return;
 // Đồng bộ ngay khi khởi động để xử lý cả trường hợp bot tắt qua giao thừa.
 const refresh=()=>refreshTimedPanels(client).catch(error=>console.error('[REACTION ROLE]',error.message));
 void refresh();
 const timer=setInterval(refresh,60_000);timer.unref?.();refreshTimers.set(client,timer);

 const autoCleanup = async () => {
  for (const guild of client.guilds.cache.values()) {
   try {
    const res = await cleanupDuplicates(guild);
    if (res.cleanedCount > 0) {
     console.log(`[REACTION ROLE] Tự động lọc thành công: Đã gỡ role của ${res.cleanedCount} thành viên pick trùng trong guild "${guild.name}" (${guild.id}).`);
    }
   } catch (err) {
    console.warn(`[REACTION ROLE] Lỗi auto-cleanup cho guild ${guild.id}: ${err.message}`);
   }
  }
 };

 if (process.env.DB_PATH !== ':memory:') {
  setTimeout(() => {
   void autoCleanup();
   const cleanupTimer = setInterval(autoCleanup, 30 * 60_000);
   cleanupTimer.unref?.();
  }, 10_000);
 }
}
module.exports={create,list,disable,handleButton,payload,checkedRole,start,refreshTimedPanels,cleanupDuplicates};
