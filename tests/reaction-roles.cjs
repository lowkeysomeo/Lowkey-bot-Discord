const assert=require('node:assert/strict');
process.env.DB_PATH=':memory:';
const {PermissionFlagsBits:P,PermissionsBitField,Collection}=require('discord.js');
const {getDb}=require('../utils/database');
let rr=require('../utils/reactionRoles');
const gid='111111111111111111',cid='222222222222222222',rid='333333333333333333',rid2='444444444444444444';
const role={id:rid,name:'Miền Bắc',managed:false,permissions:new PermissionsBitField(0n)};
const role2={id:rid2,name:'Miền Nam',managed:false,permissions:new PermissionsBitField(0n)};
const me={permissions:new PermissionsBitField(P.ManageRoles),roles:{highest:{comparePositionTo:()=>1}}};
const roles=new Collection(),changes=[],sentDMs=[];
const member={id:'user',user:{id:'user',username:'testuser',displayName:'Test User',bot:false},roles:{cache:roles,add:async id=>{roles.set(id,id===rid2?role2:role);changes.push('add');},remove:async id=>{roles.delete(id);changes.push('remove');}},send:async payload=>{sentDMs.push(payload);}};
const messages=new Map();let next=0,failEdit=false,failSend=false;
const channel={id:cid,type:0,permissionsFor:()=>({has:()=>true}),messages:{fetch:async id=>messages.get(id)},send:async payload=>{if(failSend)throw new Error('send fail');const msg={id:String(++next),author:{id:'bot'},payload,edit:async p=>{if(failEdit)throw new Error('edit fail');msg.payload=p;}};messages.set(msg.id,msg);return msg;}};
const guild={id:gid,channels:{fetch:async()=>channel},roles:{fetch:async id=>id===rid?role:id===rid2?role2:null},members:{fetchMe:async()=>me,fetch:async opts=>opts?.user?member:new Map([[member.id,member]]),cache:new Map([[member.id,member]])}};
const input={channelId:cid,title:'Choose',description:'Welcome',choices:[{roleId:rid,label:'Miền Bắc'}]};
function interaction(row,extra={},index=0){if(typeof extra==='number'){index=extra;extra={};}return {guild,guildId:gid,channelId:cid,user:{id:'user'},client:{user:{id:'bot'}},message:messages.get(row.message_id),customId:`rr:${row.id}:${index}`,inGuild:()=>true,deferReply:async()=>{},editReply:async function(p){this.response=p;},...extra};}
async function main(){
 const created=await rr.create(guild,input);let row=rr.list(gid)[0];assert.equal(row.id,created.id);assert.equal(row.active,1);assert.equal(messages.get(row.message_id).payload.components[0].toJSON().components[0].disabled,false);
 await rr.handleButton(interaction(row));assert(roles.has(rid));await rr.handleButton(interaction(row));assert(!roles.has(rid));
 await Promise.all([rr.handleButton(interaction(row)),rr.handleButton(interaction(row))]);assert(!roles.has(rid));assert.deepEqual(changes,['add','remove','add','remove']);
 const count=changes.length;
 await rr.handleButton(interaction(row,{guildId:'other'}));await rr.handleButton(interaction(row,{channelId:'other'}));await rr.handleButton(interaction(row,{message:{id:'fake',author:{id:'bot'}}}));await rr.handleButton(interaction(row,{message:{id:row.message_id,author:{id:'imposter'}}}));assert.equal(changes.length,count);
 role.permissions=new PermissionsBitField(P.Administrator);await assert.rejects(rr.create(guild,input),/quản trị/);await rr.handleButton(interaction(row));assert.equal(changes.length,count);role.permissions=new PermissionsBitField(0n);
 role.managed=true;await assert.rejects(rr.create(guild,input),/khả dụng/);role.managed=false;
 me.roles.highest.comparePositionTo=()=>0;await assert.rejects(rr.create(guild,input),/khả dụng/);me.roles.highest.comparePositionTo=()=>1;
 await assert.rejects(rr.create(guild,{...input,choices:[input.choices[0],input.choices[0]]}),/khác nhau/);
 await assert.rejects(rr.create(guild,{...input,choices:[]}),/1 đến 10/);
 await assert.rejects(rr.disable({...guild,id:'other'},row.id),/Không tìm/);
 delete require.cache[require.resolve('../utils/reactionRoles')];rr=require('../utils/reactionRoles');await rr.handleButton(interaction(row));assert(roles.has(rid),'module reload retains persisted mapping');
 failEdit=true;const result=await rr.disable(guild,row.id);assert(result.warning);await rr.handleButton(interaction(row));assert(roles.has(rid),'closed panel does not remove existing roles');failEdit=false;
 failSend=true;await assert.rejects(rr.create(guild,input));failSend=false;assert.equal(rr.list(gid).filter(r=>r.active).length,0);
 failEdit=true;await assert.rejects(rr.create(guild,input));failEdit=false;assert.equal(rr.list(gid).filter(r=>r.active).length,0);
 const command=require('../commands/admin/reactionrole');assert.equal(command.data.toJSON().name,'reactionrole');let denied;await command.execute({inGuild:()=>true,memberPermissions:new PermissionsBitField(0n),reply:async p=>denied=p});assert.match(denied.content,/admin/);

 // Kiểm tra tính năng chỉ được pick 1 role trong bảng (single choice / độc quyền)
 roles.clear(); changes.length=0;
 const regionalInput={channelId:cid,title:'Ba Miền',description:'Chọn miền',choices:[{roleId:rid,label:'Miền Bắc'},{roleId:rid2,label:'Miền Nam'}]};
 const regionalPanel=await rr.create(guild,regionalInput);
 const regionalRow=rr.list(gid)[0];
 // Bấm Miền Bắc -> nhận Miền Bắc thành công
 await rr.handleButton(interaction(regionalRow,0));
 assert(roles.has(rid)); assert(!roles.has(rid2));
 // Bấm Miền Nam trong khi đang có Miền Bắc -> BỊ CHẶN, không cho nhận thêm
 const blockedInteraction=interaction(regionalRow,1);
 await rr.handleButton(blockedInteraction);
 assert(roles.has(rid)); assert(!roles.has(rid2),'Không được nhận thêm role thứ hai');
 assert.match(blockedInteraction.response.content,/chỉ được chọn 1 role/);
 assert.match(blockedInteraction.response.content,/Miền Bắc/);
 // Bấm lại Miền Bắc -> bỏ role Miền Bắc
 await rr.handleButton(interaction(regionalRow,0));
 assert(!roles.has(rid)); assert(!roles.has(rid2));
 // Sau khi đã bỏ role cũ -> bấm Miền Nam nhận thành công
 await rr.handleButton(interaction(regionalRow,1));
 assert(!roles.has(rid)); assert(roles.has(rid2));

 // Kiểm tra tính năng lọc và xóa role của người pick 2 role trở lên, gửi thông báo DM
 // 1. Member chỉ có 1 role hợp lệ -> KHÔNG bị gỡ, không gửi DM
 roles.clear();
 roles.set(rid, role);
 sentDMs.length = 0;
 let cleanResult = await rr.cleanupDuplicates(guild, regionalRow.id);
 assert.equal(cleanResult.cleanedCount, 0, 'Member có 1 role hợp lệ không bị xóa');
 assert.equal(sentDMs.length, 0, 'Không gửi DM cho người chỉ có 1 role');
 assert(roles.has(rid), 'Role hợp lệ vẫn được giữ nguyên');

 // 2. Member có từ 2 role trở lên (ví dụ: Miền Bắc + Miền Nam) -> XÓA CẢ 2, gửi DM
 roles.set(rid2, role2);
 assert(roles.has(rid) && roles.has(rid2), 'Member đang có cả 2 role');
 cleanResult = await rr.cleanupDuplicates(guild, regionalRow.id);
 assert.equal(cleanResult.cleanedCount, 1, 'Đã lọc và xử lý 1 vi phạm');
 assert.equal(cleanResult.dmsSent, 1, 'Đã gửi 1 DM');
 assert(!roles.has(rid), 'Đã xóa role Miền Bắc');
 assert(!roles.has(rid2), 'Đã xóa role Miền Nam');
 assert.equal(sentDMs.length, 1, 'Đã gửi tin nhắn DM');
 assert.match(sentDMs[0].content, /Miền Bắc/);
 assert.match(sentDMs[0].content, /Miền Nam/);
 assert.match(sentDMs[0].content, /chỉ được chọn 1 role/);

 // 3. Kiểm tra slash command cleanup
 let commandReply;
 await command.execute({
  inGuild: () => true,
  guild,
  guildId: gid,
  memberPermissions: new PermissionsBitField(P.Administrator),
  options: {
   getSubcommand: () => 'cleanup',
   getString: () => regionalRow.id
  },
  deferReply: async () => {},
  editReply: async (p) => { commandReply = p; }
 });
 assert.match(commandReply, /Không có thành viên nào vi phạm|Đã dọn dẹp xong/);

 console.log('PASS reaction roles: toggles, concurrency, persistence, binding/isolation, privilege/hierarchy checks, disabled/failed panels, single choice limit, and duplicate cleanup with DM.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>getDb().close());
