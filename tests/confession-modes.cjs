const assert=require('node:assert/strict');
process.env.DB_PATH=':memory:';
const {getDb}=require('../utils/database');
const store=require('../utils/confessionStore');
const {saveOptions}=require('../utils/customization');
const panel=require('../utils/confessionPanel');
const {confess}=require('../utils/confessionSystem');
const sent=[];
let count=0;
const channel={id:'333',type:0,permissionsFor:()=>({has:()=>true}),messages:{fetch:async()=>message},send:async p=>{sent.push(p);return{id:String(++count),edit:async()=>{},startThread:async()=>{}}}};
let message={id:'1',author:{id:'999'},edit:async p=>{message.payload=p;}};
const guild={id:'111',name:'VietNam Legacy',channels:{fetch:async()=>channel},members:{me:{}}};
const user={id:'123456789012345678',username:'Tester',bot:false,displayAvatarURL:()=> 'https://cdn.discordapp.com/embed/avatars/0.png'};
function interaction(overrides={}){return {guild,guildId:guild.id,channelId:channel.id,user,member:{displayName:'Tên công khai'},client:{user:{id:'999'}},message,inGuild:()=>true,isButton:()=>true,deferReply:async()=>{},reply:async function(p){this.response=p;},editReply:async function(p){this.response=p;},showModal:async function(m){this.modal=m;},...overrides};}
async function main(){
 store.setChannel(guild.id,channel.id);saveOptions(guild.id,{confessionThreads:false,confessionCooldown:0});
 await panel.publishPanel(guild);assert.equal(sent.length,1);await panel.publishPanel(guild);assert.equal(sent.length,1);
 assert.equal(sent[0].components[0].toJSON().components.length,2);
 const anon=interaction({customId:'confession:open:anonymous'});await panel.openForm(anon);assert.match(anon.modal.toJSON().title,/ẩn danh/);
 const submission=interaction({customId:anon.modal.toJSON().custom_id,fields:{getTextInputValue:()=> 'Một lời nhắn ẩn danh'}});
 await panel.submitForm(submission);
 const anonJSON=JSON.stringify(sent.at(-1));assert(!anonJSON.includes(user.id));assert(!anonJSON.includes(user.username));assert(!anonJSON.includes('cdn.discordapp'));assert.match(anonJSON,/Người gửi ẩn danh/);
 const after=sent.length;await panel.submitForm(submission);assert.equal(sent.length,after);
 const pub=interaction({customId:'confession:open:public'});await panel.openForm(pub);assert.match(pub.modal.toJSON().title,/hiện tên/);
 const bad=interaction({guildId:'222',customId:pub.modal.toJSON().custom_id,fields:{getTextInputValue:()=> 'X'}});await panel.submitForm(bad);assert.equal(sent.length,after);
 const posted=interaction({customId:pub.modal.toJSON().custom_id,fields:{getTextInputValue:()=> 'Lời cảm ơn công khai'}});await panel.submitForm(posted);
 assert.equal(sent.at(-1).embeds[0].data.author.name,'Tên công khai');assert(JSON.stringify(sent.at(-1)).includes(user.id));assert.deepEqual(sent.at(-1).allowedMentions,{parse:[]});assert.match(posted.response,/công khai/);
 assert.equal(store.getConfig(guild.id).counter,2);
 const slash=interaction({options:{getString:key=>key==='content'?'Mặc định ẩn danh':null}});await confess(slash);assert(!JSON.stringify(sent.at(-1)).includes(user.id));
 const forged=interaction({customId:'confession:open:public',message:{id:'fake',author:{id:'999'}}});await panel.openForm(forged);assert(!forged.modal);
 const expired=interaction({customId:'confession:open:anonymous'});await panel.openForm(expired);getDb().prepare('UPDATE confession_forms SET expires=0').run();
 await panel.submitForm(interaction({customId:expired.modal.toJSON().custom_id,fields:{getTextInputValue:()=> 'late'}}));assert.equal(store.getConfig(guild.id).counter,3);
 saveOptions(guild.id,{confessionCooldown:60});const cooldown=interaction({options:{getString:k=>k==='content'?'Test':'public'}});await confess(cooldown);assert.match(cooldown.response,/chờ/);
 assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM confession_forms').get().n,0);
 console.log('PASS confession modes: anonymous privacy, explicit public identity, default anonymity, shared counter/cooldown, single-use guild/user-bound forms, expiry, panel reuse.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>getDb().close());
