const assert = require('node:assert/strict');
process.env.DB_PATH = ':memory:';
const { Collection } = require('discord.js');
const { saveOptions, saveRewards, syncRewards, getOptions } = require('../utils/customization');
const { handleRoleUpdate, notifyRoles, findGrantors } = require('../utils/roleNotifications');
const { validateCustomization } = require('../dashboard/customization');
const { getDb } = require('../utils/database');
async function main() {
  const sent = [];
  let canSend = true;
  let failing = false;
  const guild = { id: '111111111111111111', name: 'Server thử',
    roles: { cache: new Collection(['level','special','member','game','ping','managed'].map(id => [id, {id, managed:id === 'managed'}])) },
    members: { me: { id: '444444444444444444' } }, channels: {} };
  const channel = { id:'222222222222222222', guildId:guild.id, type:0,
    permissionsFor:()=>({has:()=>canSend}), send:async payload=>{ if(failing) throw new Error('Mạng tạm lỗi'); sent.push(payload); } };
  guild.channels.fetch = async () => channel;
  const member = {id:'333333333333333333',guild,displayName:'Người thử',user:{bot:false,username:'Người thử',displayAvatarURL:()=> 'https://cdn.discordapp.com/embed/avatars/0.png'},roles:{cache:new Collection()}};
  member.roles.add = async id => member.roles.cache.set(id, {});
  member.roles.remove = async id => member.roles.cache.delete(id);
  const snapshot = (...ids) => ({roles:{cache:new Collection(ids.map(id=>[id,{}]))},partial:false});
  saveRewards(guild.id,'chat',[{level:2,roleId:'level'}]);
  await notifyRoles(member,['level']);
  assert.equal(sent.length,0,'Tắt thì không gửi');
  saveOptions(guild.id,{roleNoticeEnabled:true,roleNoticeChannel:channel.id,roleNoticeRoles:['special','managed','member'],roleNoticeExcludedRoles:['member']});
  await notifyRoles(member,['member','game','ping','managed']);
  assert.equal(sent.length,0,'Bỏ qua role thường, role hệ thống và danh sách loại trừ');
  await Promise.all([syncRewards(member,2,'chat'),notifyRoles(member,['level'])]);
  assert.equal(sent.length,1,'Lệnh cấp role và sự kiện không gửi trùng');
  const first = sent[0].embeds[0].toJSON();
  assert(first.fields[0].value.includes('Chat Level 2'));
  assert(first.fields[1].value.includes('<@444444444444444444>'));
  let auditCalls = 0;
  guild.members.me.permissions = { has: () => true };
  guild.fetchAuditLogs = async () => {
    auditCalls++;
    return { entries: new Collection(auditCalls === 1 ? [] : [
      ['other', {targetId:'other',executor:{id:'wrong'},createdTimestamp:Date.now(),changes:[{key:'$add',new:[{id:'special'}]}]}],
      ['remove', {targetId:member.id,executor:{id:'wrong'},createdTimestamp:Date.now(),changes:[{key:'$remove',new:[{id:'special'}]}]}],
      ['old', {targetId:member.id,executor:{id:'wrong'},createdTimestamp:Date.now()-60000,changes:[{key:'$add',new:[{id:'special'}]}]}],
      ['right', {targetId:member.id,executor:{id:'555555555555555555',bot:false},createdTimestamp:Date.now(),changes:[{key:'$add',new:[{id:'special'}]}]}],
    ]) };
  };
  member.roles.cache.set('special',{});
  await handleRoleUpdate(snapshot('level'),member);
  assert.equal(sent.length,2,'Nhận role đặc biệt từ bên ngoài');
  assert.equal(auditCalls,2,'Thử lại khi nhật ký đến chậm');
  assert(sent[1].embeds[0].toJSON().fields[1].value.includes('<@555555555555555555>'));
  assert(sent[1].embeds[0].toJSON().fields[0].value.includes('Admin bổ nhiệm'));
  guild.members.me.permissions = { has: () => false };
  assert.equal((await findGrantors(member,['special'],Date.now())).size,0);
  assert.equal(auditCalls,2,'Không đọc nhật ký khi thiếu quyền');
  assert.deepEqual(sent[1].allowedMentions,{parse:[],users:[member.id],roles:[]});
  assert(sent[1].embeds[0].toJSON().description.includes('<@&special>'));
  await handleRoleUpdate(snapshot('level','special'),member);
  assert.equal(sent.length,2,'Không gửi khi chỉ thay đổi biệt danh hoặc gỡ role');
  await handleRoleUpdate({partial:true},member);
  member.user.bot=true;
  await notifyRoles(member,['special']);
  member.user.bot=false;
  assert.equal(sent.length,2);
  getDb().prepare('DELETE FROM role_notice_history').run();
  failing=true; await notifyRoles(member,['special']); failing=false;
  await notifyRoles(member,['special']);
  assert.equal(sent.length,3,'Lỗi gửi không đánh dấu là đã gửi');
  assert(sent[2].embeds[0].toJSON().fields[0].value.includes('Được trao role trong server.'));
  saveOptions(guild.id,{roleNoticeMention:false});
  getDb().prepare('DELETE FROM role_notice_history').run();
  await notifyRoles(member,['special','level']);
  assert.equal(sent.length,4);
  assert.deepEqual(sent[3].allowedMentions.users,[]);
  assert.equal(sent[3].content,undefined);
  const other={...member,guild:{...guild,id:'other'}};
  await notifyRoles(other,['special']);
  assert.equal(sent.length,4,'Cấu hình không áp dụng sang server khác');
  getDb().prepare('DELETE FROM role_notice_history').run();
  canSend=false; await notifyRoles(member,['special']); canSend=true;
  assert.equal(sent.length,4);
  const channels=new Collection([[channel.id,channel]]);
  const validate=options=>validateCustomization({options},guild,channels,guild.roles.cache,{});
  assert.throws(()=>validate({roleNoticeRoles:['foreign']}));
  assert.throws(()=>validate({roleNoticeExcludedRoles:['special','special']}));
  assert.throws(()=>validate({roleNoticeChannel:''}));
  assert.throws(()=>validate({roleNoticeRoles:'special'}));
  assert.equal(validate({roleNoticeRoles:['special']}).roleNoticeRoles[0],'special');
  assert.equal(getOptions(guild.id).roleNoticeChannel,channel.id);
  getDb().prepare('DELETE FROM role_notice_history').run();
  saveRewards(guild.id,'voice',[{level:20,roleId:'level'}]);
  member.roles.cache.delete('level');
  member.roles.add = async id => {
    const before=snapshot(...member.roles.cache.keys());
    member.roles.cache.set(id,{});
    void handleRoleUpdate(before,member);
  };
  await syncRewards(member,25,'voice');
  const last=sent[sent.length-1].embeds[0].toJSON();
  assert(last.fields[0].value.includes('Voice Level 20'));
  assert(last.fields[0].value.includes('hiện tại Level 25'));
  getDb().prepare('DELETE FROM role_notice_history').run();
  guild.members.me.permissions = { has: () => true };
  guild.fetchAuditLogs = async () => ({ entries: new Collection([
    ['bot', { targetId:member.id, executor:{id:'666666666666666666',bot:true}, createdTimestamp:Date.now(), changes:[{key:'$add',new:[{id:'special'}]}] }],
  ]) });
  await notifyRoles(member,['special']);
  const botNotice = sent[sent.length-1];
  assert(botNotice.embeds[0].toJSON().fields[0].value.includes('Được cấp tự động bởi <@666666666666666666>'));
  assert(!botNotice.embeds[0].toJSON().fields[0].value.includes('Admin bổ nhiệm'));
  assert(botNotice.embeds[0].toJSON().fields[1].value.includes('<@666666666666666666>'));
  assert.deepEqual(botNotice.allowedMentions.users,[]);
  console.log('Đạt: role level/role khác, bộ lọc, chống trùng, không ping cả role, quyền kênh, lỗi gửi và cấu hình từng server.');
  getDb().close();
}
main().catch(error=>{console.error(error);process.exitCode=1;});
