'use strict';
process.env.DB_PATH=':memory:';
const assert=require('node:assert/strict');
const {saveOptions}=require('../utils/customization');
const security=require('../utils/securitySystem');
const {hasInvite, hasSuspiciousAd}=require('../utils/securityContent');
(async()=>{
// Kiểm tra nhận diện link mời Discord và server khác
for(const text of ['https://discord.gg/abc','DISCORD.COM/invite/ABC','discordapp.com/invite/a','https://discord.gg/%61bc','discord.gg/ab\u200Bcd','dsc.gg/myserver','t.me/mygroup','telegram.me/channel']) assert(hasInvite(text),text);
for(const text of ['https://notdiscord.gg/abc','https://discord.com.evil.test/invite/a','https://example.com']) assert(!hasInvite(text),text);

// Kiểm tra nhận diện link quảng cáo web / rút gọn / lừa đảo
for(const text of ['http://bit.ly/nitro-free','https://tinyurl.com/sale','https://dlscord-nitro.com/gift','Mua acc game giá rẻ tại https://shopacc.vn','Shop bot uy tín tại https://botdiscord.net','Tham gia server mới nhận quà https://myweb.com/join']) assert(hasSuspiciousAd(text),text);
for(const text of ['https://youtube.com/watch?v=123 Bài hát hay quá','https://github.com/nodejs/node','https://vnexpress.net/thoi-su','https://example.com']) assert(!hasSuspiciousAd(text),text);

let removed=0, timed=0, lastTimeoutMs=0;const gid='content-test';
const guild={id:gid,ownerId:'owner',client:{user:{id:'self'}},channels:{fetch:async()=>({send:async()=>{}})}};
const make=(id,content,channelId='111111111111111111',now=undefined)=>({guild,channelId,channel:{},author:{id,bot:false},member:{moderatable:true,timeout:async(ms)=>{timed++;lastTimeoutMs=ms;},roles:{cache:new Map()}},content,mentions:{users:new Map(),roles:new Map()},deletable:true,delete:async()=>removed++,_now:now});

// Chế độ delete chỉ xóa không timeout
saveOptions(gid,{securityEnabled:true,securitySpam:false,securityInvites:true,securityInviteAction:'delete',securityInviteChannels:'222222222222222222'});
assert.equal(await security.message(make('first','discord.gg/test')),true);assert.equal(removed,1);assert.equal(timed,0);
assert.equal(await security.message(make('partner','discord.gg/test','222222222222222222')),false);
assert.equal(await security.message(make('edit','discord.gg/test'),true),true);
assert.equal(await security.message(make('owner','discord.gg/test')),false);

// Chế độ mặc định của quảng cáo & link mời: XÓA TIN NHẮN và TIMEOUT 10 phút
saveOptions(gid,{securityEnabled:true,securitySpam:false,securityInvites:true,securityInviteAction:'timeout',securityInviteChannels:'222222222222222222'});
// 1. Link mời server khác (dsc.gg) -> xóa tin và timeout 10 phút
const inviteMsg = make('ad-user-1', 'Vào server giao lưu nha: https://dsc.gg/cool-server');
assert.equal(await security.message(inviteMsg), true);
assert.equal(lastTimeoutMs, 600000, 'Link mời server khác phải bị timeout 10 phút');

// 2. Link rút gọn lạ -> xóa tin và timeout 10 phút
const shortenerMsg = make('ad-user-2', 'Bấm vào link này: http://bit.ly/free-nitro');
assert.equal(await security.message(shortenerMsg), true);
assert.equal(lastTimeoutMs, 600000, 'Link rút gọn lạ phải bị timeout 10 phút');

// 3. Tin nhắn nghi ngờ quảng cáo web (có link + từ khóa bán acc/shop) -> xóa tin và timeout 10 phút
const adWebMsg = make('ad-user-3', 'Shop acc game uy tín giá rẻ xem ngay tại https://accgame.vn');
assert.equal(await security.message(adWebMsg), true);
assert.equal(lastTimeoutMs, 600000, 'Quảng cáo web kèm link phải bị timeout 10 phút');

// 4. Link bình thường không bị chặn (YouTube, GitHub, trang báo)
assert.equal(await security.message(make('normal-user', 'Nghe bài này đi mọi người https://youtube.com/watch?v=123')), false);
assert.equal(await security.message(make('normal-user-2', 'Đọc doc trên https://github.com/nodejs/node')), false);

// 5. Tái phạm quảng cáo / link mời trong vòng 24 giờ -> timeout 12 giờ
const repeatAd = make('ad-user-1', 'discord.gg/another-guild', '111111111111111111', Date.now() + 3600000);
assert.equal(await security.message(repeatAd), true);
assert.equal(lastTimeoutMs, 43200000, 'Tái phạm quảng cáo/link mời trong 24 giờ phải bị timeout 12 giờ');

// Test các tính năng khác: spam tin nhanh, lặp nội dung
saveOptions(gid,{securityInvites:false,securitySpam:true,securitySpamLimit:3});
const edit=make('edit-clean','hello');await security.message(edit,true);await security.message(edit,true);await security.message(edit,true);
const spam=make('spam','hello');await security.message(spam);await security.message(spam);await security.message(spam);
await security.message(spam);assert.equal(timed, 5, 'Không timeout liên tục một người khi còn cooldown 30s');
saveOptions(gid,{securitySpam:false,securityDuplicate:true,securityDuplicateLimit:2});
await security.message(make('repeat','Nội dung giống nhau'));assert.equal(await security.message(make('repeat','Nội dung giống nhau','333333333333333333')),true);
saveOptions(gid,{securityEnabled:false});assert.equal(await security.message(make('off','discord.gg/x')),false);

// Test quy tắc mention
saveOptions(gid, {
  securityEnabled: true,
  securitySpam: true,
  securityMentionEnabled: true,
  securityChatChannels: '222222222222222222',
  securityTimeoutMinutes: 10,
  securityRepeatTimeoutHours: 12
});

const baseTime = 1700000000000;

// Mention 1 người 3 lần trong 1 tin nhắn -> timeout 10 phút (600.000 ms)
const m1 = make('mention-user-1', '<@123456789012345678> chào bạn <@123456789012345678> alo <@123456789012345678>', '111111111111111111', baseTime);
const r1 = await security.message(m1);
assert.equal(r1, true, 'Tin nhắn mention 1 người 3 lần phải bị chặn');
assert.equal(lastTimeoutMs, 600000, 'Lần 1 mention 1 người 3 lần phải timeout 10 phút');

// Kênh ngoại lệ: không bị phạt
const mExempt = make('mention-user-exempt', '<@123456789012345678> <@123456789012345678> <@123456789012345678>', '222222222222222222', baseTime);
assert.equal(await security.message(mExempt), false, 'Kênh ngoại lệ không được phạt');

// Mention liên tục 10 người trong vòng 2 phút -> timeout 10 phút (600.000 ms)
const u2 = 'mention-continuous-user';
for (let i = 1; i <= 9; i++) {
  assert.equal(await security.message(make(u2, `<@${String(i).padStart(18, '1')}>`, '111111111111111111', baseTime + (i - 1) * 10000)), false, `Tag ${i} người chưa được timeout`);
}
assert.equal(await security.message(make(u2, '<@999999999999999999>', '111111111111111111', baseTime + 95000)), true, 'Tag đủ 10 người trong 2 phút phải timeout');
assert.equal(lastTimeoutMs, 600000, 'Lần 1 tag liên tục 10 người phải timeout 10 phút');

// Tái phạm mention trong vòng 24 giờ -> timeout 12 giờ (43.200.000 ms)
const repeat1h = make('mention-user-1', '<@888888888888888888> <@888888888888888888> <@888888888888888888>', '111111111111111111', baseTime + 3600000);
assert.equal(await security.message(repeat1h), true);
assert.equal(lastTimeoutMs, 43200000, 'Tái phạm trong vòng 24 giờ phải timeout 12 giờ');

// Tái phạm chéo giữa các luật mention trong vòng 24 giờ -> timeout 12 giờ
const repeatCross = make(u2, '<@777777777777777777> <@777777777777777777> <@777777777777777777>', '111111111111111111', baseTime + 7200000);
assert.equal(await security.message(repeatCross), true);
assert.equal(lastTimeoutMs, 43200000, 'Tái phạm chéo giữa các luật mention trong vòng 24 giờ phải timeout 12 giờ');

// Sau 24 giờ -> trở về timeout 10 phút
const u3 = 'user-24h-expired';
await security.message(make(u3, '<@555555555555555555> <@555555555555555555> <@555555555555555555>', '111111111111111111', baseTime));
assert.equal(lastTimeoutMs, 600000);
const after25h = make(u3, '<@555555555555555555> <@555555555555555555> <@555555555555555555>', '111111111111111111', baseTime + 25 * 3600 * 1000);
assert.equal(await security.message(after25h), true);
assert.equal(lastTimeoutMs, 600000, 'Sau 24 giờ vi phạm mới được tính lại mức ban đầu 10 phút');

// Kiểm tra bỏ qua lượt tag phát sinh từ Reply tin nhắn
saveOptions(gid, {
  securityEnabled: true,
  securitySpam: true,
  securityMentionEnabled: true,
  securityMentionLimit: 5,
  securityChatChannels: 'none',
  securityTimeoutMinutes: 10
});

// Tin nhắn Reply chứa 1 người được reply + 4 bạn bè (tổng 5 người trong mentions.users) -> KHÔNG bị phạt vì người được reply bị trừ ra (còn 4 < 5)
const replyUsersMap = new Map([
  ['replied-user-id', { id: 'replied-user-id' }],
  ['friend-1', { id: 'friend-1' }],
  ['friend-2', { id: 'friend-2' }],
  ['friend-3', { id: 'friend-3' }],
  ['friend-4', { id: 'friend-4' }]
]);
const replyMsg = {
  ...make('reply-author', 'Ê rủ thêm mấy bạn vào chơi', '111111111111111111', baseTime + 30 * 3600 * 1000),
  mentions: {
    users: replyUsersMap,
    roles: new Map(),
    repliedUser: { id: 'replied-user-id' }
  },
  reference: { messageId: 'orig-msg-123' }
};
assert.equal(await security.message(replyMsg), false, 'Tin nhắn reply không được tính lượt tag của người được reply');

// Tin nhắn KHÔNG PHẢI reply có 5 người trong mentions.users -> BỊ PHẠT vì đủ 5 người (mass mention)
const direct5UsersMap = new Map([
  ['user-a', { id: 'user-a' }],
  ['user-b', { id: 'user-b' }],
  ['user-c', { id: 'user-c' }],
  ['user-d', { id: 'user-d' }],
  ['user-e', { id: 'user-e' }]
]);
const direct5Msg = {
  ...make('direct-author', 'Tag 5 bạn trực tiếp', '111111111111111111', baseTime + 31 * 3600 * 1000),
  mentions: {
    users: direct5UsersMap,
    roles: new Map(),
    repliedUser: null
  }
};
assert.equal(await security.message(direct5Msg), true, 'Tag 5 người trực tiếp không phải reply phải bị phạt');

console.log('PASS security-content: invite, ad web, ngoại lệ, chỉnh sửa, đếm spam, lặp nhiều kênh, tag 3 lần/1 tin, tag liên tục 2m, tái phạm 24h và bỏ qua reply mention.');
})().catch(e=>{console.error(e);process.exitCode=1;});
