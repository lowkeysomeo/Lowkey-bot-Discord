const assert=require('node:assert/strict');
process.env.DB_PATH=':memory:';
const {Collection}=require('discord.js');
const {normalizeChoice,resolveEmoji}=require('../utils/reactionRoleEmoji');
const {payload}=require('../utils/reactionRoles');
const id='1557708572106686477';
const emoji={id,name:'mien_bac',animated:false,available:true,roles:{cache:new Collection()}};
const guild={emojis:{fetch:async()=>new Collection([[id,emoji]])},members:{me:{roles:{cache:new Collection()}}}};
const role={id:'1555179504539017216',name:'Miền Bắc'};
async function main(){
 for(const text of [`<:mien_bac:${id}>`,':mien_bac:',id])assert.deepEqual(await resolveEmoji(guild,text),{id,name:'mien_bac',animated:false});
 const choice=await normalizeChoice(guild,{label:`<:mien_bac:${id}>`},role);assert.equal(choice.label,'Miền Bắc');assert.equal(choice.emoji.id,id);
 const both=await normalizeChoice(guild,{label:`<:mien_bac:${id}> Miền Bắc`},role);assert.equal(both.label,'Miền Bắc');
 const rendered=payload({id:'abcd',title:'Ba miền',description:'Hello',active:1,choices:[choice]}).components[0].toJSON().components[0];assert.equal(rendered.label,'Miền Bắc');assert.equal(rendered.emoji.id,id);assert(!rendered.label.includes('<:'));
 const unicode=await normalizeChoice(guild,{label:'Miền Bắc',emoji:'💜'},role);assert.equal(unicode.emoji.name,'💜');
 assert.equal((await resolveEmoji(guild,'🇻🇳')).name,'🇻🇳');assert.equal((await resolveEmoji(guild,'👨‍👩‍👧‍👦')).name,'👨‍👩‍👧‍👦');assert.equal((await resolveEmoji(guild,'1️⃣')).name,'1️⃣');
 await assert.rejects(resolveEmoji(guild,':missing:'),/không có/);await assert.rejects(resolveEmoji(guild,'<:outside:1557708572106686400>'),/không có/);
 await assert.rejects(resolveEmoji(guild,'abc'),/Nhập một emoji/);await assert.rejects(resolveEmoji(guild,'💜💜'),/Nhập một emoji/);
 await assert.rejects(normalizeChoice(guild,{label:`<:mien_bac:${id}> <:mien_bac:${id}>`},role),/một emoji/);
 emoji.available=false;await assert.rejects(resolveEmoji(guild,':mien_bac:'),/không có/);emoji.available=true;
 emoji.roles.cache.set('restricted',{id:'restricted'});await assert.rejects(resolveEmoji(guild,':mien_bac:'),/không có/);emoji.roles.cache.clear();
 assert.equal(JSON.parse(JSON.stringify(choice)).emoji.id,id);
 assert.equal(payload({id:'abcd',title:'Closed',description:'Hello',active:0,choices:[choice]}).components[0].toJSON().components[0].disabled,true);
 console.log('PASS reaction role emoji: custom codes, names, IDs, Unicode, old label conversion, payload emoji, guild/access validation, closed panels.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
