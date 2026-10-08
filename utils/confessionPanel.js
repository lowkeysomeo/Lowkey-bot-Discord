'use strict';
const {randomBytes}=require('node:crypto');
const {EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,ModalBuilder,TextInputBuilder,TextInputStyle,ChannelType,PermissionFlagsBits:P}=require('discord.js');
const {getDb}=require('./database');
const store=require('./confessionStore');
const {getOptions,template}=require('./customization');
const publishing=new Map();
function db(){
  const database=getDb();
  database.exec(`CREATE TABLE IF NOT EXISTS confession_panels (guild_id TEXT PRIMARY KEY,channel_id TEXT NOT NULL,message_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS confession_retired_panels (guild_id TEXT NOT NULL,channel_id TEXT NOT NULL,message_id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS confession_forms (token TEXT PRIMARY KEY,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,mode TEXT NOT NULL,expires INTEGER NOT NULL);`);
  database.prepare('DELETE FROM confession_forms WHERE expires <= ?').run(Date.now());
  return database;
}
function payload(guild){
  const options=getOptions(guild.id);
  const embed=new EmbedBuilder().setColor(options.confessionColor)
    .setTitle(template(options.confessionPanelTitle,{server:guild.name}).slice(0,256))
    .setDescription(template(options.confessionPanelText,{server:guild.name}).slice(0,2500))
    .addFields({name:'☀️ Đăng công khai',value:'Tên và ảnh đại diện của bạn sẽ xuất hiện cùng bài viết.',inline:true},
      {name:'🌙 Gửi ẩn danh',value:'Bài viết không hiển thị tài khoản hay ảnh đại diện của bạn.',inline:true})
    .setFooter({text:'VietNam Legacy • Một nơi để nói, một cộng đồng để lắng nghe.'});
  const icon=guild.iconURL?.({size:128});if(icon)embed.setThumbnail(icon);
  return {embeds:[embed],components:[new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('confession:open:public').setLabel('Đăng công khai').setEmoji('☀️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('confession:open:anonymous').setLabel('Gửi ẩn danh').setEmoji('🌙').setStyle(ButtonStyle.Secondary))],allowedMentions:{parse:[]}};
}
async function publishPanel(guild, {bump=false,existingOnly=false} = {}){
  const task=(publishing.get(guild.id) || Promise.resolve()).catch(()=>{}).then(async()=>{
    const previous=db().prepare('SELECT * FROM confession_panels WHERE guild_id=?').get(guild.id);
    if(existingOnly && !previous)return null;
    const config=store.getConfig(guild.id);
    if(!config)throw new Error('Hãy lưu kênh confession trước khi đăng bảng.');
    const channel=await guild.channels.fetch(config.channel_id).catch(()=>null);
    const me=guild.members.me || await guild.members.fetchMe();
    if(!channel || channel.type!==ChannelType.GuildText || !channel.permissionsFor(me)?.has([P.ViewChannel,P.SendMessages,P.EmbedLinks,P.ReadMessageHistory]))throw new Error('Bot cần quyền xem kênh, gửi tin, nhúng liên kết và đọc lịch sử trong kênh confession.');
    if(existingOnly && previous.channel_id!==channel.id)return null;
    let message;
    if(previous && previous.channel_id===channel.id){
      try {message=await channel.messages.fetch(previous.message_id);}
      catch(error){if(Number(error.code)!==10008)throw new Error('Chưa đọc được bảng cũ. Kiểm tra quyền bot rồi thử lại.');}
    }
    const oldMessage=message;
    if(message && !bump)await message.edit(payload(guild));
    else message=await channel.send(payload(guild));
    try { db().transaction(()=>{
      if(previous && previous.message_id!==message.id)db().prepare('INSERT OR IGNORE INTO confession_retired_panels VALUES (?,?,?)').run(guild.id,previous.channel_id,previous.message_id);
      db().prepare('INSERT INTO confession_panels VALUES (?,?,?) ON CONFLICT(guild_id) DO UPDATE SET channel_id=excluded.channel_id,message_id=excluded.message_id').run(guild.id,channel.id,message.id);
    }).immediate(); } catch(error) {
      if(message.id!==previous?.message_id)await message.delete().catch(()=>{});
      throw error;
    }
    for(const retired of db().prepare('SELECT * FROM confession_retired_panels WHERE guild_id=? LIMIT 20').all(guild.id)){
      let old;
      try {
        const oldChannel=retired.channel_id===channel.id ? channel : await guild.channels.fetch(retired.channel_id);
        old=oldMessage?.id===retired.message_id ? oldMessage : await oldChannel.messages.fetch(retired.message_id);
        await old.delete();
        db().prepare('DELETE FROM confession_retired_panels WHERE message_id=?').run(retired.message_id);
      } catch(error) {
        if(Number(error.code)===10008)db().prepare('DELETE FROM confession_retired_panels WHERE message_id=?').run(retired.message_id);
        else if(old)await old.edit({components:[]}).catch(()=>{});
      }
    }
    return {messageUrl:`https://discord.com/channels/${guild.id}/${channel.id}/${message.id}`};
  });
  publishing.set(guild.id,task);
  try{return await task;}finally{if(publishing.get(guild.id)===task)publishing.delete(guild.id);}
}
async function openForm(interaction){
  const mode=interaction.customId.split(':')[2];
  const reject=content=>interaction.reply({content,flags:64});
  if(!interaction.inGuild() || interaction.user.bot || !['public','anonymous'].includes(mode))return reject('Không thể mở ô viết từ nút này.');
  const panel=db().prepare('SELECT * FROM confession_panels WHERE guild_id=?').get(interaction.guildId);
  if(!panel || panel.message_id!==interaction.message.id || panel.channel_id!==interaction.channelId || interaction.message.author.id!==interaction.client.user.id || store.getConfig(interaction.guildId)?.channel_id!==panel.channel_id)return reject('Bảng này đã cũ. Admin hãy đăng lại bảng confession.');
  const options=getOptions(interaction.guildId);
  if(!options.confessionEnabled)return reject('Server hiện đang tắt gửi confession.');
  const token=randomBytes(16).toString('hex');
  db().prepare('DELETE FROM confession_forms WHERE guild_id=? AND user_id=?').run(interaction.guildId,interaction.user.id);
  db().prepare('INSERT INTO confession_forms VALUES (?,?,?,?,?)').run(token,interaction.guildId,interaction.user.id,mode,Date.now()+900000);
  const modal=new ModalBuilder().setCustomId(`confession:submit:${token}`).setTitle(mode==='public'?'☀️ Công khai — hiện tên của bạn':'🌙 Confession ẩn danh')
    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('content').setLabel(mode==='public'?'Nội dung đăng kèm tài khoản của bạn':'Nội dung không hiển thị người gửi').setStyle(TextInputStyle.Paragraph).setRequired(true).setMinLength(1).setMaxLength(options.confessionMaxLength).setPlaceholder('Viết điều bạn muốn chia sẻ tại đây…')));
  try{return await interaction.showModal(modal);}catch(error){db().prepare('DELETE FROM confession_forms WHERE token=?').run(token);throw error;}
}
async function submitForm(interaction){
  const match=/^confession:submit:([a-f0-9]{32})$/.exec(interaction.customId);
  if(!interaction.inGuild() || !match)return interaction.reply({content:'Ô viết không hợp lệ.',flags:64});
  const database=db();
  const form=database.transaction(()=>{
    const row=database.prepare('SELECT * FROM confession_forms WHERE token=? AND guild_id=? AND user_id=?').get(match[1],interaction.guildId,interaction.user.id);
    if(row)database.prepare('DELETE FROM confession_forms WHERE token=?').run(match[1]);
    return row;
  }).immediate();
  if(!form)return interaction.reply({content:'Ô viết đã hết hạn hoặc đã gửi. Hãy bấm nút trên bảng để mở lại nhé.',flags:64});
  return require('./confessionSystem').confess(interaction,{mode:form.mode,content:interaction.fields.getTextInputValue('content')});
}
async function command(interaction){
  if(!interaction.inGuild() || !interaction.memberPermissions?.has(P.Administrator))return interaction.reply({content:'Chỉ admin được đăng bảng confession.',flags:64});
  await interaction.deferReply({flags:64});
  try{const result=await publishPanel(interaction.guild);return interaction.editReply(`✅ Góc sẻ chia đã sẵn sàng!\n${result.messageUrl}`);}
  catch(error){return interaction.editReply(error.message);}
}
module.exports={publishPanel,openForm,submitForm,payload,command};
