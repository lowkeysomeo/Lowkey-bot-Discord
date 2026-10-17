'use strict';
process.env.DB_PATH=':memory:';
const assert=require('node:assert/strict');
const {saveOptions}=require('../utils/customization');
const security=require('../utils/securitySystem');
const {hasInvite}=require('../utils/securityContent');
(async()=>{
for(const text of ['https://discord.gg/abc','DISCORD.COM/invite/ABC','discordapp.com/invite/a','https://discord.gg/%61bc','discord.gg/ab\u200Bcd']) assert(hasInvite(text),text);
for(const text of ['https://notdiscord.gg/abc','https://discord.com.evil.test/invite/a','https://example.com']) assert(!hasInvite(text),text);
let removed=0, timed=0, lastTimeoutMs=0;const gid='content-test';
const guild={id:gid,ownerId:'owner',client:{user:{id:'self'}},channels:{fetch:async()=>({send:async()=>{}})}};
const make=(id,content,channelId='111111111111111111',now=undefined)=>({guild,channelId,channel:{},author:{id,bot:false},member:{moderatable:true,timeout:async(ms)=>{timed++;lastTimeoutMs=ms;},roles:{cache:new Map()}},content,mentions:{users:new Map(),roles:new Map()},deletable:true,delete:async()=>removed++,_now:now});
saveOptions(gid,{securityEnabled:true,securitySpam:false,securityInvites:true,securityInviteChannels:'222222222222222222'});
assert.equal(await security.message(make('first','discord.gg/test')),true);assert.equal(removed,1);assert.equal(timed,0);
assert.equal(await security.message(make('partner','discord.gg/test','222222222222222222')),false);
assert.equal(await security.message(make('edit','discord.gg/test'),true),true);
assert.equal(await security.message(make('owner','discord.gg/test')),false);
saveOptions(gid,{securityInvites:false,securitySpam:true,securitySpamLimit:3});
const edit=make('edit-clean','hello');await security.message(edit,true);await security.message(edit,true);await security.message(edit,true);assert.equal(timed,0);
const spam=make('spam','hello');await security.message(spam);await security.message(spam);await security.message(spam);assert.equal(timed,1);
await security.message(spam);assert.equal(timed,1,'Không timeout liên tục một người');
saveOptions(gid,{securitySpam:false,securityDuplicate:true,securityDuplicateLimit:2});
await security.message(make('repeat','Nội dung giống nhau'));assert.equal(await security.message(make('repeat','Nội dung giống nhau','333333333333333333')),true);
assert.equal(timed,2);
saveOptions(gid,{securityEnabled:false});assert.equal(await security.message(make('off','discord.gg/x')),false);

// Test quy tắc mention mới
saveOptions(gid, {
  securityEnabled: true,
  securitySpam: true,
  securityMentionEnabled: true,
  securityChatChannels: '222222222222222222',
  securityTimeoutMinutes: 10,
  securityRepeatTimeoutHours: 12
});

const baseTime = 1700000000000;

// 1. Mention 1 người 3 lần trong 1 tin nhắn -> timeout 10 phút (600.000 ms)
const m1 = make('mention-user-1', '<@123456789012345678> chào bạn <@123456789012345678> alo <@123456789012345678>', '111111111111111111', baseTime);
const r1 = await security.message(m1);
assert.equal(r1, true, 'Tin nhắn mention 1 người 3 lần phải bị chặn');
assert.equal(lastTimeoutMs, 600000, 'Lần 1 mention 1 người 3 lần phải timeout 10 phút');

// Kênh ngoại lệ: không bị phạt
const mExempt = make('mention-user-exempt', '<@123456789012345678> <@123456789012345678> <@123456789012345678>', '222222222222222222', baseTime);
assert.equal(await security.message(mExempt), false, 'Kênh ngoại lệ không được phạt');

// 2. Mention liên tục từ người này qua người khác trong vòng 2 phút -> timeout 10 phút (600.000 ms)
const u2 = 'mention-continuous-user';
// Tin 1 tại t=0: tag người A -> không phạt
assert.equal(await security.message(make(u2, '<@111111111111111111>', '111111111111111111', baseTime)), false);
// Tin 2 tại t=30s: tag người B -> không phạt
assert.equal(await security.message(make(u2, '<@222222222222222222>', '111111111111111111', baseTime + 30000)), false);
// Tin 3 tại t=60s: tag người C (3 người trong 2 phút) -> timeout 10 phút
assert.equal(await security.message(make(u2, '<@333333333333333333>', '111111111111111111', baseTime + 60000)), true);
assert.equal(lastTimeoutMs, 600000, 'Lần 1 tag liên tục nhiều người phải timeout 10 phút');

// 3. Tái phạm các trường hợp trên trong vòng 24 giờ -> timeout 12 giờ (43.200.000 ms)
// mention-user-1 tái phạm sau 1 giờ (trong vòng 24h)
const repeat1h = make('mention-user-1', '<@888888888888888888> <@888888888888888888> <@888888888888888888>', '111111111111111111', baseTime + 3600000);
assert.equal(await security.message(repeat1h), true);
assert.equal(lastTimeoutMs, 43200000, 'Tái phạm trong vòng 24 giờ phải timeout 12 giờ');

// mention-continuous-user tái phạm bằng cách tag 3 lần 1 người sau 2 giờ (trong vòng 24h)
const repeatCross = make(u2, '<@777777777777777777> <@777777777777777777> <@777777777777777777>', '111111111111111111', baseTime + 7200000);
assert.equal(await security.message(repeatCross), true);
assert.equal(lastTimeoutMs, 43200000, 'Tái phạm chéo giữa các luật mention trong vòng 24 giờ phải timeout 12 giờ');

// 4. Sau 24 giờ (25 giờ sau vi phạm) -> trở về timeout 10 phút (không còn 12 giờ)
const u3 = 'user-24h-expired';
await security.message(make(u3, '<@555555555555555555> <@555555555555555555> <@555555555555555555>', '111111111111111111', baseTime));
assert.equal(lastTimeoutMs, 600000);
const after25h = make(u3, '<@555555555555555555> <@555555555555555555> <@555555555555555555>', '111111111111111111', baseTime + 25 * 3600 * 1000);
assert.equal(await security.message(after25h), true);
assert.equal(lastTimeoutMs, 600000, 'Sau 24 giờ vi phạm mới được tính lại mức ban đầu 10 phút');

console.log('PASS security-content: invite, ngoại lệ, chỉnh sửa, đếm spam, lặp nhiều kênh, chống phạt trùng, tag 3 lần/1 tin (10m), tag liên tục 2m (10m) và tái phạm 24h (12h).');
})().catch(e=>{console.error(e);process.exitCode=1;});
