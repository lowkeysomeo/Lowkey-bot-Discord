'use strict';
const {randomBytes}=require('node:crypto');
const {EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,PermissionFlagsBits:P}=require('discord.js');
const {getDb}=require('./database');
const locks=new Map();
async function serial(key,fn){const task=(locks.get(key)||Promise.resolve()).catch(()=>{}).then(fn);locks.set(key,task);try{return await task;}finally{if(locks.get(key)===task)locks.delete(key);}}
function db(){const d=getDb();d.exec(`CREATE TABLE IF NOT EXISTS reaction_role_panels(id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,channel_id TEXT NOT NULL,message_id TEXT,title TEXT NOT NULL,description TEXT NOT NULL,choices TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 0);`);return d;}
function fail(message){throw Object.assign(new Error(message),{status:400});}
const dangerous=['Administrator','ManageGuild','ManageRoles','ManageChannels','ManageWebhooks','KickMembers','BanMembers','ModerateMembers','ManageMessages','MentionEveryone','ManageThreads','ManageEvents','MuteMembers','DeafenMembers','MoveMembers'].reduce((a,k)=>a|(P[k]||0n),0n);
async function checkedRole(guild,id,me){
 const role=await guild.roles.fetch(id);
 if(!role||role.id===guild.id||role.managed||!me.permissions.has(P.ManageRoles)||me.roles.highest.comparePositionTo(role)<=0)fail('Role không còn khả dụng. Role bot phải nằm trên role tự nhận và bot cần quyền Manage Roles.');
 if((role.permissions.bitfield&dangerous)!==0n)fail('Không dùng role có quyền quản trị hoặc điều hành làm role tự nhận.');
 return role;
}
function list(guildId){return db().prepare('SELECT * FROM reaction_role_panels WHERE guild_id=? ORDER BY rowid DESC LIMIT 100').all(guildId).map(r=>({...r,choices:JSON.parse(r.choices),messageUrl:r.message_id?`https://discord.com/channels/${r.guild_id}/${r.channel_id}/${r.message_id}`:null}));}
function payload(row){const choices=typeof row.choices==='string'?JSON.parse(row.choices):row.choices;const rows=[];
 for(let i=0;i<choices.length;i+=5)rows.push(new ActionRowBuilder().addComponents(choices.slice(i,i+5).map((c,j)=>new ButtonBuilder().setCustomId(`rr:${row.id}:${i+j}`).setLabel(c.label).setStyle(ButtonStyle.Secondary).setDisabled(!row.active))));
 return {embeds:[new EmbedBuilder().setColor(0xb994e8).setTitle(row.title).setDescription(row.description).setFooter({text:row.active?'Bấm để nhận role • Bấm lại để bỏ role · VietNam Legacy':'Bảng nhận role đã đóng · VietNam Legacy'})],components:rows,allowedMentions:{parse:[]}};
}
async function create(guild,input){return serial(`panel:${guild.id}`,async()=>{
 if(!input||typeof input.title!=='string'||!input.title.trim()||input.title.length>150||typeof input.description!=='string'||!input.description.trim()||input.description.length>2000)fail('Nhập tiêu đề (tối đa 150 ký tự) và lời giới thiệu (tối đa 2000 ký tự).');
 if(!Array.isArray(input.choices)||input.choices.length<1||input.choices.length>10)fail('Mỗi bảng cần từ 1 đến 10 role.');
 if(db().prepare('SELECT COUNT(*) n FROM reaction_role_panels WHERE guild_id=? AND active=1').get(guild.id).n>=20)fail('Tối đa 20 bảng đang hoạt động. Hãy đóng bảng cũ trước.');
 if(typeof input.channelId!=='string'||!/^\d{17,20}$/.test(input.channelId))fail('Chọn kênh đăng bảng.');
 const me=await guild.members.fetchMe();const choices=[],seen=new Set();
 for(const c of input.choices){if(!c||typeof c.roleId!=='string'||!/^\d{17,20}$/.test(c.roleId)||seen.has(c.roleId))fail('Chọn các role khác nhau cho mỗi nút.');seen.add(c.roleId);const role=await checkedRole(guild,c.roleId,me);const label=c.label||role.name;if(typeof label!=='string'||!label.trim()||label.length>80)fail('Tên nút cần từ 1 đến 80 ký tự.');choices.push({roleId:role.id,label:label.trim()});}
 const channel=await guild.channels.fetch(input.channelId);
 if(!channel||![0,5].includes(channel.type)||!channel.permissionsFor(me)?.has([P.ViewChannel,P.SendMessages,P.EmbedLinks]))fail('Bot cần quyền xem kênh, gửi tin và nhúng liên kết tại kênh đã chọn.');
 const row={id:randomBytes(8).toString('hex'),guild_id:guild.id,channel_id:channel.id,title:input.title.trim(),description:input.description.trim(),choices,active:0};
 db().prepare('INSERT INTO reaction_role_panels(id,guild_id,channel_id,title,description,choices) VALUES (?,?,?,?,?,?)').run(row.id,guild.id,channel.id,row.title,row.description,JSON.stringify(choices));
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
 const choice=JSON.parse(row.choices)[Number(match[2])];if(!choice)return i.editReply('Role không hợp lệ.');
 try{const me=await i.guild.members.fetchMe();const role=await checkedRole(i.guild,choice.roleId,me);const member=await i.guild.members.fetch({user:i.user.id,force:true});const has=member.roles.cache.has(role.id);if(has)await member.roles.remove(role.id,'Member tự bỏ role');else await member.roles.add(role.id,'Member tự nhận role');return i.editReply({content:has?`Đã bỏ role **${choice.label}**. Bạn có thể nhận lại bất cứ lúc nào nhé.`:`✨ Bạn đã nhận role **${choice.label}**. Chào mừng bạn đến với nhóm!`,allowedMentions:{parse:[]}});}
 catch(error){return i.editReply(error.status?error.message:'Chưa thay đổi được role. Vui lòng nhờ admin kiểm tra quyền và vị trí role của bot.');}
 }));
}
module.exports={create,list,disable,handleButton,payload,checkedRole};
