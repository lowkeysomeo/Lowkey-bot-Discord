const assert=require('node:assert/strict');
process.env.DB_PATH=':memory:';
const {PermissionFlagsBits:P,PermissionsBitField,Collection}=require('discord.js');
const {getDb}=require('../utils/database');
let rr=require('../utils/reactionRoles');
const gid='111111111111111111',cid='222222222222222222',rid='333333333333333333';
const role={id:rid,name:'Game',managed:false,permissions:new PermissionsBitField(0n)};
const me={permissions:new PermissionsBitField(P.ManageRoles),roles:{highest:{comparePositionTo:()=>1}}};
const roles=new Collection(),changes=[];
const member={roles:{cache:roles,add:async id=>{roles.set(id,role);changes.push('add');},remove:async id=>{roles.delete(id);changes.push('remove');}}};
const messages=new Map();let next=0,failEdit=false,failSend=false;
const channel={id:cid,type:0,permissionsFor:()=>({has:()=>true}),messages:{fetch:async id=>messages.get(id)},send:async payload=>{if(failSend)throw new Error('send fail');const msg={id:String(++next),author:{id:'bot'},payload,edit:async p=>{if(failEdit)throw new Error('edit fail');msg.payload=p;}};messages.set(msg.id,msg);return msg;}};
const guild={id:gid,channels:{fetch:async()=>channel},roles:{fetch:async id=>id===rid?role:null},members:{fetchMe:async()=>me,fetch:async()=>member}};
const input={channelId:cid,title:'Choose',description:'Welcome',choices:[{roleId:rid,label:'🎮 Game'}]};
function interaction(row,extra={}){return {guild,guildId:gid,channelId:cid,user:{id:'user'},client:{user:{id:'bot'}},message:messages.get(row.message_id),customId:`rr:${row.id}:0`,inGuild:()=>true,deferReply:async()=>{},editReply:async function(p){this.response=p;},...extra};}
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
 console.log('PASS reaction roles: toggles, concurrency, persistence, binding/isolation, privilege/hierarchy checks, disabled/failed panels and admin command.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>getDb().close());
