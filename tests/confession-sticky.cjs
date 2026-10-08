const assert=require('node:assert/strict');
process.env.DB_PATH=':memory:';
const {getDb}=require('../utils/database');
const store=require('../utils/confessionStore');
const {saveOptions}=require('../utils/customization');
const panel=require('../utils/confessionPanel');
const {confess}=require('../utils/confessionSystem');
const messages=new Map(),events=[];
let next=0,failSend=false,failDelete=false;
const isPanel=p=>p.components?.[0]?.toJSON().components[0].custom_id==='confession:open:public';
const channel={id:'333',type:0,permissionsFor:()=>({has:()=>true}),messages:{fetch:async id=>{if(!messages.has(id))throw Object.assign(new Error('missing'),{code:10008});return messages.get(id);}},send:async payload=>{
 const kind=isPanel(payload)?'panel':'post';if(kind==='panel'&&failSend)throw new Error('send failed');
 const message={id:String(++next),payload,kind,author:{id:'999'},edit:async p=>{message.payload={...message.payload,...p};},delete:async()=>{if(failDelete)throw new Error('delete failed');events.push('delete');messages.delete(message.id);},startThread:async()=>events.push('thread')};
 messages.set(message.id,message);events.push(kind);return message;
}};
const guild={id:'111',name:'Test',channels:{fetch:async()=>channel},members:{me:{}}};
const active=()=>getDb().prepare('SELECT message_id FROM confession_panels WHERE guild_id=?').get(guild.id)?.message_id;
function interaction(){return {guild,guildId:guild.id,user:{id:'123',username:'Test',displayAvatarURL:()=> 'https://cdn.discordapp.com/embed/avatars/0.png'},inGuild:()=>true,deferReply:async()=>{},editReply:async function(p){this.response=p;}};}
async function post(mode='anonymous'){const i=interaction();await confess(i,{mode,content:'Test confession'});assert.match(i.response,/✅/);}
async function main(){
 store.setChannel(guild.id,channel.id);saveOptions(guild.id,{confessionThreads:true,confessionCooldown:0});
 await post();assert.equal(active(),undefined);assert.equal(messages.size,1);
 await panel.publishPanel(guild);const first=active();
 const form={...interaction(),channelId:channel.id,client:{user:{id:'999'}},customId:'confession:open:anonymous',message:messages.get(first),showModal:async function(m){this.modal=m;}};
 await panel.openForm(form);
 events.length=0;await post('public');assert.deepEqual(events,['post','thread','panel','delete']);assert(!messages.has(first));
 await panel.submitForm({...interaction(),customId:form.modal.toJSON().custom_id,fields:{getTextInputValue:()=> 'Opened before bump'}});
 assert.equal(store.getConfig(guild.id).counter,3);
 await Promise.all([post(),post('public')]);assert.equal([...messages.values()].filter(m=>m.kind==='panel').length,1);
 const before=active();failSend=true;await post();assert.equal(active(),before);assert(messages.has(before));failSend=false;
 failDelete=true;await post();assert.notEqual(active(),before);assert.deepEqual(messages.get(before).payload.components,[]);assert.equal(getDb().prepare('SELECT COUNT(*) n FROM confession_retired_panels').get().n,1);
 failDelete=false;await post();assert(!messages.has(before));assert.equal(getDb().prepare('SELECT COUNT(*) n FROM confession_retired_panels').get().n,0);
 assert.equal([...messages.values()].filter(m=>m.kind==='post').length,8);
 assert.equal([...messages.values()].filter(m=>m.kind==='panel').length,1);
 assert.equal([...messages.values()].at(-1).id,active());
 assert.equal(store.getConfig(guild.id).counter,8);
 console.log('PASS sticky confession: ordering, both modes, concurrency, pending forms, send failure, delete retry, preserved posts and counter.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>getDb().close());
