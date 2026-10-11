process.env.DB_PATH=':memory:';
const assert=require('node:assert/strict');
const {Collection,PermissionFlagsBits:P}=require('discord.js');
const {initializeDatabase,getDb}=require('../utils/database');initializeDatabase();
const {saveOptions}=require('../utils/customization');
const review=require('../utils/securityReview');
let sent=[],removed=[],added=[],kicks=0;
const role={id:'staff',name:'Quản trị',editable:true,managed:false,permissions:{any:()=>true}};
const managed={id:'bot-role',managed:true,tags:{botId:'newbot'},permissions:{bitfield:P.Administrator},setPermissions:async p=>{managed.permissions.bitfield=p;}};
const channel={id:'logs',send:async p=>{sent.push(p);return {id:'msg'+sent.length};}};
const guild={id:'review-guild',name:'Việt Nam',ownerId:'owner',client:{user:{id:'self'}},channels:{fetch:async()=>channel},roles:{fetch:async id=>id==='staff'?role:managed},members:{fetch:async input=>members.get(typeof input==='string'?input:input.user)}};
function make(id,bot=false){const roles=new Collection([[bot?'bot-role':'staff',bot?managed:role]]);return {id,guild,user:{bot,tag:'Test#1234',createdTimestamp:Date.now()-86400000},joinedTimestamp:Date.now(),kickable:true,kick:async()=>kicks++,permissions:{any:()=>bot&&managed.permissions.bitfield!==0n},roles:{cache:roles,remove:async id=>{roles.delete(id);removed.push(id);},add:async id=>{roles.set(id,id==='staff'?role:managed);added.push(id);}}};}
const members=new Map([['newuser',make('newuser')],['newbot',make('newbot',true)]]);
function interaction(row,user='owner',action='grant'){return {inGuild:()=>true,user:{id:user},guild,guildId:guild.id,channelId:row.channel_id,message:{id:row.message_id,edit:async()=>{}},customId:`security:${row.id}:${action}`,reply:async p=>p.content,deferReply:async()=>{},editReply:async t=>t};}
(async()=>{
 saveOptions(guild.id,{securityEnabled:true,securityLogChannel:'logs'});
 await review.memberUpdated({roles:{cache:new Collection()}},members.get('newuser'));
 assert.deepEqual(removed,['staff']);assert.match(sent[0].embeds[0].toJSON().title,/đáng ngờ/);
 let row=getDb().prepare("SELECT * FROM security_reviews WHERE kind='role'").get();
 assert.match(await review.handleButton(interaction(row,'admin')),/Chỉ chủ server/);assert.equal(added.length,0);
 assert.match(await review.handleButton(interaction(row)),/Đã cấp/);assert.equal(added.length,1);
 assert.match(await review.handleButton(interaction(row)),/đã được xử lý/);
 await review.memberUpdated({roles:{cache:new Collection()}},members.get('newuser'));assert.equal(removed.length,1,'Approved grant is not reverted');
 await review.botJoined(members.get('newbot'));assert.equal(managed.permissions.bitfield,0n);
 assert.match(sent[1].embeds[0].toJSON().title,/xét duyệt/);
 row=getDb().prepare("SELECT * FROM security_reviews WHERE kind='bot'").get();
 // Mô phỏng role được cấp lại trong lúc chờ.
 members.get('newbot').roles.cache.set('staff',role);
 await review.memberUpdated({roles:{cache:new Collection()}},members.get('newbot'));
 assert(!members.get('newbot').roles.cache.has('staff'));
 const forged={...interaction(row,'owner','allow'),guildId:'other'};assert.match(await review.handleButton(forged),/không còn hợp lệ/);
 assert.match(await review.handleButton(interaction(row,'owner','allow')),/Đã cho phép/);
 assert.equal(managed.permissions.bitfield,P.Administrator);assert(members.get('newbot').roles.cache.has('staff'));
 const json=review.buttons({id:'123',kind:'bot'},true).toJSON();assert(json.components.every(b=>b.disabled));
 assert.equal(kicks,0);console.log('PASS security review: Vietnamese embeds/buttons, role removal, owner-only approval, replay/guild binding, bot quarantine and role regrant, persisted snapshots, permission restoration.');
})().catch(e=>{console.error(e);process.exitCode=1;});
