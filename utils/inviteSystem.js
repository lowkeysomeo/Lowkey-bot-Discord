const { EmbedBuilder, PermissionFlagsBits: P } = require('discord.js');
const { getDb } = require('./database');
const { getOptions } = require('./customization');
const snapshots = new Map();
const initialized = new Set();
const queues = new Map();
const batches = new Map();
let timer;
let ticking = false;

function db() {
  const d = getDb();
  d.exec(`CREATE TABLE IF NOT EXISTS invite_members (
    guild_id TEXT NOT NULL, member_id TEXT NOT NULL, inviter_id TEXT,
    joined_at INTEGER NOT NULL, notified INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(guild_id,member_id));
    CREATE TABLE IF NOT EXISTS invite_awards (
    guild_id TEXT NOT NULL, user_id TEXT NOT NULL, role_id TEXT NOT NULL,
    PRIMARY KEY(guild_id,user_id));`);
  return d;
}
function count(guildId, userId) {
  return db().prepare('SELECT COUNT(*) n FROM invite_members WHERE guild_id=? AND inviter_id=?').get(guildId,userId).n;
}
function serial(guildId, task) {
  const p = (queues.get(guildId) || Promise.resolve()).catch(()=>{}).then(task);
  queues.set(guildId,p);
  return p.finally(()=>{if(queues.get(guildId)===p) queues.delete(guildId);});
}
function snapshot(invites) {
  return new Map([...invites.values()].map(i=>[i.code,{ uses:Number(i.uses)||0, inviter:i.inviter?.bot ? null : i.inviter?.id || null }]));
}
async function prime(guild) {
  return serial(guild.id,async()=>{
    try {
      const existing = await guild.members.fetch();
      // Thành viên có sẵn không trở thành lượt mời mới nếu rời rồi vào lại.
      db().transaction(()=>{
        for(const member of existing.values())db().prepare('INSERT OR IGNORE INTO invite_members VALUES (?,?,NULL,?,1)').run(guild.id,member.id,Date.now());
      })();
      snapshots.set(guild.id,snapshot(await guild.invites.fetch()));
      initialized.add(guild.id);
      console.log('[INVITES] Theo dõi server '+guild.id+'; đã ghi nhận '+existing.size+' thành viên có sẵn.');
    }
    catch(error) { snapshots.delete(guild.id); initialized.delete(guild.id); throw error; }
  });
}
function record(guildId, memberId, inviterId, bot=false) {
  return db().prepare('INSERT OR IGNORE INTO invite_members(guild_id,member_id,inviter_id,joined_at,notified) VALUES (?,?,?,?,?)')
    .run(guildId,memberId,bot || inviterId===memberId ? null : inviterId,Date.now(),bot?1:0).changes > 0;
}
function attribute(before, after, size) {
  if (!before) return null;
  let total=0;
  const inviters=new Set();
  for(const [code, item] of after) {
    const previous=before.get(code);
    // Link mới chưa có mốc so sánh hoặc lượt dùng giảm: không suy đoán người mời.
    if(!previous) { if(item.uses>0)return null; continue; }
    const delta=item.uses-previous.uses;
    if(delta<0)return null;
    if(delta>0){total+=delta;inviters.add(item.inviter);}
  }
  // Nhiều người vào cùng lúc qua các người mời khác nhau thì không thể ghép chắc chắn.
  return total===size && inviters.size===1 ? [...inviters][0] : null;
}
async function reward(guild,userId) {
  const options=getOptions(guild.id);
  if(!options.inviteEnabled)return;
  const total=count(guild.id,userId);
  const target=total>=100 ? options.inviteRole100 : total>=50 ? options.inviteRole50 : '';
  if(!target)return;
  const old=db().prepare('SELECT role_id FROM invite_awards WHERE guild_id=? AND user_id=?').get(guild.id,userId)?.role_id;
  if(old===target)return;
  const member=await guild.members.fetch(userId);
  if(member.user.bot)return;
  const me=guild.members.me || await guild.members.fetchMe();
  const role=await guild.roles.fetch(target);
  if(role?.permissions?.any([P.Administrator,P.ManageGuild,P.ManageRoles,P.ManageChannels,P.KickMembers,P.BanMembers,P.ModerateMembers]))throw Error('Role invite không được có quyền quản trị');
  if(!role || role.managed || role.id===guild.id || !me.permissions.has(P.ManageRoles) || me.roles.highest.comparePositionTo(role)<=0)throw Error('Bot chưa cấp được role invite '+target);
  // Cấp mốc mới thành công trước, sau đó mới thu hồi mốc cũ.
  if(!member.roles.cache.has(target))await member.roles.add(target,'Đạt '+(total>=100?100:50)+' lượt mời hợp lệ');
  const remove=new Set([old,total>=100?options.inviteRole50:null].filter(id=>id&&id!==target));
  for(const id of remove)if(member.roles.cache.has(id))await member.roles.remove(id,'Chuyển sang mốc invite cao hơn');
  db().prepare('INSERT INTO invite_awards VALUES (?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET role_id=excluded.role_id').run(guild.id,userId,target);
}
async function announce(guild,row) {
  const options=getOptions(guild.id);
  if(!options.inviteEnabled || !options.inviteChannel)return;
  const channel=await guild.channels.fetch(options.inviteChannel);
  const me=guild.members.me || await guild.members.fetchMe();
  if(!channel || channel.guildId!==guild.id || ![0,5].includes(channel.type)
    || !channel.permissionsFor(me)?.has([P.ViewChannel,P.SendMessages,P.EmbedLinks]))throw Error('Bot thiếu quyền gửi thông báo invite');
  const total=row.inviter_id ? count(guild.id,row.inviter_id) : null;
  const description='Chào mừng <@'+row.member_id+'> đến với **'+guild.name+'**! 🎉\n\n'+(row.inviter_id
    ? '🤝 **Người mời:** <@'+row.inviter_id+'>\n💌 **Tổng lượt mời hợp lệ:** **'+total+' người**\n\nCảm ơn đã giúp cộng đồng kết nối thêm một người bạn mới!'
    : '🔎 **Người mời:** Chưa xác định được.\nLượt tham gia này không được cộng cho bất kỳ ai.')+'\n\n🏅 Mốc thưởng: **50** và **100** lượt mời · Chỉ giữ role mốc cao nhất.';
  await channel.send({embeds:[new EmbedBuilder().setColor(options.inviteColor).setTitle('💌 Thêm một kết nối mới!').setDescription(description.slice(0,4096)).setTimestamp()],allowedMentions:{parse:[],users:[],roles:[]}});
  db().prepare('UPDATE invite_members SET notified=1 WHERE guild_id=? AND member_id=?').run(guild.id,row.member_id);
}
async function processBatch(guild,members) {
  return serial(guild.id,async()=>{
    if(!getOptions(guild.id).inviteEnabled){snapshots.delete(guild.id);return;}
    if(!initialized.has(guild.id))return; // Chờ dữ liệu ban đầu để không cộng nhầm người đã có trong server.
    const unique=[...new Map(members.map(m=>[m.id,m])).values()];
    let inviter=null;
    try {
      const next=snapshot(await guild.invites.fetch());
      inviter=attribute(snapshots.get(guild.id),next,unique.length);
      snapshots.set(guild.id,next);
    } catch(error) { snapshots.delete(guild.id); console.warn('[INVITES] Không đọc được lượt dùng:',error.message); }
    for(const member of unique) {
      const fresh=record(guild.id,member.id,inviter,member.user.bot);
      if(!fresh || member.user.bot)continue;
      const row=db().prepare('SELECT * FROM invite_members WHERE guild_id=? AND member_id=?').get(guild.id,member.id);
      if(row.inviter_id)await reward(guild,row.inviter_id).catch(e=>console.warn('[INVITES] Role sẽ thử lại:',e.message));
      await announce(guild,row).catch(e=>console.warn('[INVITES] Thông báo sẽ thử lại:',e.message));
    }
  });
}
function joined(member) {
  if(!getOptions(member.guild.id).inviteEnabled)return;
  let batch=batches.get(member.guild.id);
  if(!batch) {
    batch={members:[]};batches.set(member.guild.id,batch);
    batch.timer=setTimeout(()=>{
      batches.delete(member.guild.id);
      processBatch(member.guild,batch.members).catch(e=>console.error('[INVITES]',e.message));
    },1000);
  }
  batch.members.push(member);
}
function created(invite) {
  if(!invite.guild)return;
  void serial(invite.guild.id,async()=>{
    const current=snapshots.get(invite.guild.id);
    if(current&&!current.has(invite.code))current.set(invite.code,{uses:Number(invite.uses)||0,inviter:invite.inviter?.bot?null:invite.inviter?.id||null});
  }).catch(e=>console.error('[INVITES]',e.message));
}
async function tick(client) {
  if(ticking)return;ticking=true;
  try {
    for(const guild of client.guilds.cache.values()) {
      if(!getOptions(guild.id).inviteEnabled)continue;
      if(!initialized.has(guild.id)) {
        try { await prime(guild); } catch(e) { console.warn('[INVITES] Sẽ thử khởi tạo lại:',e.message); continue; }
      }
      await serial(guild.id,async()=>{
        for(const row of db().prepare('SELECT * FROM invite_members WHERE guild_id=? AND notified=0 ORDER BY joined_at LIMIT 20').all(guild.id))
          try{await announce(guild,row);}catch(e){console.warn('[INVITES]',e.message);break;}
        for(const row of db().prepare('SELECT inviter_id FROM invite_members WHERE guild_id=? AND inviter_id IS NOT NULL GROUP BY inviter_id HAVING COUNT(*)>=50').all(guild.id))
          try{await reward(guild,row.inviter_id);}catch(e){console.warn('[INVITES]',e.message);}
      });
    }
  } finally {ticking=false;}
}
function start(client) {
  // Dùng kênh khởi tạo từ Railway đúng một lần cho server gốc.
  if(process.env.GUILD_ID && process.env.INVITE_CHANNEL_ID) {
    const {getGuildSetting}=require('./guildSettings');
    let saved={};try{saved=JSON.parse(getGuildSetting(process.env.GUILD_ID,'DASHBOARD_OPTIONS')||'{}');}catch{}
    if(!Object.hasOwn(saved,'inviteEnabled'))require('./customization').saveOptions(process.env.GUILD_ID,{inviteEnabled:true,inviteChannel:process.env.INVITE_CHANNEL_ID});
  }
  for(const guild of client.guilds.cache.values())if(getOptions(guild.id).inviteEnabled)prime(guild).catch(e=>console.warn('[INVITES] Chưa có mốc ban đầu:',e.message));
  if(timer)clearInterval(timer);
  timer=setInterval(()=>tick(client).catch(e=>console.error('[INVITES]',e.message)),60000);timer.unref();
  console.log('[INVITES] Hệ thống lời mời đã sẵn sàng.');
}
module.exports={prime,record,count,attribute,reward,announce,processBatch,joined,created,start,tick};
