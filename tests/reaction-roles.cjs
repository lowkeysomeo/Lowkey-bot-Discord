const assert=require('node:assert/strict');
process.env.DB_PATH=':memory:';
const {PermissionFlagsBits:P,PermissionsBitField,Collection}=require('discord.js');
const {getDb}=require('../utils/database');
let rr=require('../utils/reactionRoles');
const gid='111111111111111111',cid='222222222222222222',rid='333333333333333333',rid2='444444444444444444';
const role={id:rid,name:'Miền Bắc',managed:false,permissions:new PermissionsBitField(0n)};
const role2={id:rid2,name:'Miền Nam',managed:false,permissions:new PermissionsBitField(0n)};
const me={permissions:new PermissionsBitField(P.ManageRoles),roles:{highest:{comparePositionTo:()=>1}}};
const roles=new Collection(),changes=[];
const member={roles:{cache:roles,add:async id=>{roles.set(id,id===rid2?role2:role);changes.push('add');},remove:async id=>{roles.delete(id);changes.push('remove');}}};
const messages=new Map();let next=0,failEdit=false,failSend=false;
const channel={id:cid,type:0,permissionsFor:()=>({has:()=>true}),messages:{fetch:async id=>messages.get(id)},send:async payload=>{if(failSend)throw new Error('send fail');const msg={id:String(++next),author:{id:'bot'},payload,edit:async p=>{if(failEdit)throw new Error('edit fail');msg.payload=p;}};messages.set(msg.id,msg);return msg;}};
const guild={id:gid,channels:{fetch:async()=>channel},roles:{fetch:async id=>id===rid?role:id===rid2?role2:null},members:{fetchMe:async()=>me,fetch:async()=>member}};
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

 console.log('PASS reaction roles: toggles, concurrency, persistence, binding/isolation, privilege/hierarchy checks, disabled/failed panels and admin command.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>getDb().close());
