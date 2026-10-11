const { randomUUID }=require('node:crypto');
const { EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,PermissionFlagsBits:P }=require('discord.js');
const {getDb}=require('./database');
const {getOptions}=require('./customization');
const locks=new Set();
const sensitive=[P.Administrator,P.ManageGuild,P.ManageRoles,P.ManageChannels,P.ManageWebhooks,P.BanMembers,P.KickMembers,P.ModerateMembers,P.MentionEveryone];
function db(){const d=getDb();d.exec(`CREATE TABLE IF NOT EXISTS security_reviews (id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,kind TEXT NOT NULL,role_id TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'pending',snapshot TEXT NOT NULL DEFAULT '{}',channel_id TEXT,message_id TEXT,created_at INTEGER NOT NULL)`);return d;}
function pending(guild,id,kind){return db().prepare("SELECT * FROM security_reviews WHERE guild_id=? AND user_id=? AND kind=? AND status='pending' ORDER BY created_at DESC LIMIT 1").get(guild,id,kind);}
function memberLeft(member){db().prepare("UPDATE security_reviews SET status='expired' WHERE guild_id=? AND user_id=? AND status IN ('pending','approved')").run(member.guild.id,member.id);}
function trusted(m,o){return m.id===m.guild.ownerId || m.id===m.guild.client.user.id || o.securityTrusted.split(/[\s,]+/).includes(m.id);}
const days=t=>Math.max(0,Math.floor((Date.now()-t)/86400000));
function buttons(row,disabled=false){return new ActionRowBuilder().addComponents((row.kind==='bot'?[['allow','Cho phép bot',ButtonStyle.Success],['kick','Đuổi bot',ButtonStyle.Danger],['ban','Cấm bot',ButtonStyle.Danger]]:[['grant','Vẫn cấp role',ButtonStyle.Success]]).map(([action,label,style])=>new ButtonBuilder().setCustomId(`security:${row.id}:${action}`).setLabel(label).setStyle(style).setDisabled(disabled)));}
async function post(member,row,description){
 const channel=await member.guild.channels.fetch(getOptions(member.guild.id).securityLogChannel);
 const embed=new EmbedBuilder().setColor(0xef4444).setTitle(row.kind==='bot'?'🤖 Bot mới đang chờ bạn xét duyệt':'⚠️ Phát hiện cấp role quản trị đáng ngờ').setDescription(description.slice(0,4000)).setFooter({text:member.guild.name+' • Chỉ chủ server được xét duyệt'}).setTimestamp();
 const msg=await channel.send({embeds:[embed],components:[buttons(row)],allowedMentions:{parse:[]}});
 db().prepare('UPDATE security_reviews SET channel_id=?,message_id=? WHERE id=?').run(channel.id,msg.id,row.id);
}
function create(member,kind,role='',snapshot={}){const row={id:randomUUID(),kind};db().prepare('INSERT INTO security_reviews (id,guild_id,user_id,kind,role_id,snapshot,created_at) VALUES (?,?,?,?,?,?,?)').run(row.id,member.guild.id,member.id,kind,role,JSON.stringify(snapshot),Date.now());return row;}
async function strip(member,row){
 const saved=JSON.parse(row.snapshot||'{}');saved.roles||=[];saved.managed||={};
 // Lưu trước khi gỡ để việc khởi động lại không làm mất dữ liệu xét duyệt.
 for(const role of member.roles.cache.values()){
  if(role.id===member.guild.id)continue;
  if(role.managed){
   if(role.tags?.botId!==member.id)continue;
   if(role.permissions.bitfield!==0n){
    saved.managed[role.id]??=role.permissions.bitfield.toString();
    db().prepare('UPDATE security_reviews SET snapshot=? WHERE id=?').run(JSON.stringify(saved),row.id);
    await role.setPermissions(0n,'Bot mới chờ chủ server xét duyệt');
   }
  }else{
   if(!role.editable)throw Error('Role bot bảo vệ phải cao hơn '+role.name);
   if(!saved.roles.includes(role.id))saved.roles.push(role.id);
   db().prepare('UPDATE security_reviews SET snapshot=? WHERE id=?').run(JSON.stringify(saved),row.id);
   await member.roles.remove(role.id,'Bot mới chờ xét duyệt');
  }
 }
 const fresh=await member.guild.members.fetch({user:member.id,force:true});
 if(fresh.permissions.any(sensitive))throw Error('Bot vẫn có quyền nhạy cảm từ role hoặc quyền @everyone.');
}
async function botJoined(member){
 const o=getOptions(member.guild.id);
 if(!member.user.bot || !o.securityEnabled || !o.securityBotApproval || trusted(member,o))return;
 if(pending(member.guild.id,member.id,'bot'))return;
 const row=create(member,'bot');
 try{await strip(member,{...row,snapshot:'{}'});}
 catch(error){
  if(member.kickable){await member.kick('Không thể cách ly an toàn bot mới');db().prepare("UPDATE security_reviews SET status='kicked' WHERE id=?").run(row.id);}
  throw Error('Cách ly bot '+member.id+' thất bại: '+error.message+(member.kickable?' Đã đuổi bot để bảo vệ server.':' Không đủ quyền đuổi bot.'));
 }
 const age=days(member.user.createdTimestamp);
 await post(member,row,`Bot **${member.user.tag}** (\`${member.id}\`) vừa vào **${member.guild.name}**.\n\n🔒 Đã gỡ các role có thể gỡ và tắt quyền role riêng của bot. Trong lúc chờ, việc cấp lại role sẽ bị gỡ tự động. Bot vẫn có thể nhận quyền cơ bản từ @everyone và quyền riêng của kênh.\n\nChỉ cho phép nếu bạn chủ động thêm bot này; nếu không, hãy đuổi hoặc cấm.\n\n${age<o.securityAccountDays?'⚠️':'ℹ️'} Tài khoản bot được tạo **${age} ngày** trước.`);
}
async function memberUpdated(before,member){
 const o=getOptions(member.guild.id);if(!o.securityEnabled || trusted(member,o))return;
 const key=member.guild.id+':'+member.id;if(locks.has(key))return;locks.add(key);
 try{
  const row=pending(member.guild.id,member.id,'bot');
  if(row){try{await strip(member,row);}catch(error){if(member.kickable){await member.kick('Không thể giữ bot trong trạng thái cách ly');db().prepare("UPDATE security_reviews SET status='kicked' WHERE id=?").run(row.id);}throw error;}return;}
  if(!o.securityRoleGuard)return;
  const account=days(member.user.createdTimestamp), tenure=days(member.joinedTimestamp||Date.now());
  if(account>=o.securityAccountDays && tenure>=o.securityMemberDays)return;
  for(const role of member.roles.cache.values()){
   if(before.roles.cache.has(role.id)||!role.permissions.any(sensitive))continue;
   if(db().prepare("SELECT id FROM security_reviews WHERE guild_id=? AND user_id=? AND role_id=? AND status='approved' AND kind='role'").get(member.guild.id,member.id,role.id))continue;
   if(!role.editable || role.managed)throw Error('Không gỡ được role nhạy cảm '+role.name+' khỏi '+member.id);
   await member.roles.remove(role.id,'Tài khoản mới nhận role nhạy cảm, chờ chủ server duyệt');
   if(db().prepare("SELECT id FROM security_reviews WHERE guild_id=? AND user_id=? AND role_id=? AND status='pending' AND kind='role'").get(member.guild.id,member.id,role.id))continue;
   const review=create(member,'role',role.id);
   await post(member,review,`Role **${role.name}** có quyền nhạy cảm vừa được cấp cho <@${member.id}>.\n\n⚠️ Tuổi tài khoản: **${account} ngày**; thời gian ở server: **${tenure} ngày**.\n✅ Đã tự động gỡ role. Chỉ bấm **Vẫn cấp role** nếu bạn đã kiểm tra và tin cậy thành viên này.`);
  }
 }finally{locks.delete(key);}
}
async function roleUpdated(before,role){
 const o=getOptions(role.guild.id);if(!o.securityEnabled)return;
 for(const row of db().prepare("SELECT * FROM security_reviews WHERE guild_id=? AND kind='bot' AND status='pending'").all(role.guild.id)){
  const member=await role.guild.members.fetch(row.user_id).catch(e=>{if(e.code===10007)return null;throw e;});
  if(member?.roles.cache.has(role.id))await memberUpdated({roles:{cache:new Map()}},member);
 }
}
async function handleButton(i){
 if(!i.inGuild()||i.user.id!==i.guild.ownerId)return i.reply({content:'Chỉ chủ server được xét duyệt bảo vệ.',flags:64});
 await i.deferReply({flags:64});
 const [,id,action]=i.customId.split(':');const row=db().prepare('SELECT * FROM security_reviews WHERE id=?').get(id);
 if(!row||row.guild_id!==i.guildId||row.channel_id!==i.channelId||row.message_id!==i.message.id||row.status!=='pending')return i.editReply('Yêu cầu đã được xử lý hoặc không còn hợp lệ.');
 if(!(row.kind==='bot'?['allow','kick','ban']:['grant']).includes(action))return i.editReply('Thao tác không hợp lệ.');
 const key=row.guild_id+':'+row.user_id;if(locks.has(key))return i.editReply('Đang xử lý, vui lòng thử lại.');locks.add(key);
 try{
  const member=await i.guild.members.fetch(row.user_id);
  if(action==='grant'){
   const role=await i.guild.roles.fetch(row.role_id);if(!role?.editable||role.managed)throw Error('Role đã xóa hoặc bot không đủ quyền cấp lại.');
   await member.roles.add(role.id,'Chủ server đã xét duyệt role');
  }else if(action==='allow'){
   const saved=JSON.parse(row.snapshot);
   for(const [id,permissions] of Object.entries(saved.managed||{})){
    const role=await i.guild.roles.fetch(id);if(!role || role.tags?.botId!==member.id || role.permissions.bitfield!==0n)throw Error('Role bot đã thay đổi, cần kiểm tra trước khi khôi phục.');
    await role.setPermissions(BigInt(permissions),'Chủ server đã cho phép bot');
   }
   for(const id of saved.roles||[]){const role=await i.guild.roles.fetch(id);if(!role?.editable)throw Error('Không khôi phục được role '+id);await member.roles.add(id,'Chủ server đã cho phép bot');}
  }else if(action==='kick'){if(!member.kickable)throw Error('Không đủ quyền đuổi bot.');await member.kick('Chủ server từ chối bot');}
  else{if(!member.bannable)throw Error('Không đủ quyền cấm bot.');await member.ban({reason:'Chủ server từ chối bot'});}
  db().prepare('UPDATE security_reviews SET status=? WHERE id=?').run(['grant','allow'].includes(action)?'approved':action,id);
  await i.message.edit({components:[buttons(row,true)]}).catch(()=>{});
  return await i.editReply(({grant:'✅ Đã cấp lại role.',allow:'✅ Đã cho phép bot và khôi phục các role/quyền đã lưu.',kick:'👢 Đã đuổi bot.',ban:'🔨 Đã cấm bot.'})[action]);
 }catch(error){
  if(action==='allow'){
   try{const member=await i.guild.members.fetch(row.user_id);await strip(member,row);}catch(revokeError){console.error('[SECURITY REVIEW] Không cách ly lại được:',revokeError.message);}
  }
  return await i.editReply('Không hoàn tất: '+error.message);
 }
 finally{locks.delete(key);}
}
module.exports={botJoined,memberUpdated,roleUpdated,handleButton,buttons,sensitive,memberLeft};
