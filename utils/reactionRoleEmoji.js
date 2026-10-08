'use strict';
function invalid(message){throw Object.assign(new Error(message),{status:400});}
const customToken=/<a?:[A-Za-z0-9_]+:\d{17,20}>|:[A-Za-z0-9_]{2,32}:/g;
async function resolveEmoji(guild,value){
 if(!value)return null;
 if(typeof value!=='string'||value.length>100)invalid('Emoji không hợp lệ. Chọn emoji của server hoặc nhập một emoji như 💜.');
 const text=value.trim();if(!text)return null;
 const mention=/^<a?:[A-Za-z0-9_]+:(\d{17,20})>$/.exec(text);
 const named=/^:([A-Za-z0-9_]{2,32}):$/.exec(text);
 if(mention||named||/^\d{17,20}$/.test(text)){
  const emojis=await guild.emojis.fetch();
  const emoji=named?emojis.find(e=>e.name===named[1]):emojis.get(mention?mention[1]:text);
  const me=guild.members.me||await guild.members.fetchMe();
  if(!emoji||emoji.available===false||(emoji.roles?.cache?.size&&!emoji.roles.cache.some(r=>me.roles.cache.has(r.id))))invalid('Emoji không có trong server hoặc bot không được dùng emoji đó. Hãy chọn lại emoji.');
  return {id:emoji.id,name:emoji.name,animated:Boolean(emoji.animated)};
 }
 const segments=[...new Intl.Segmenter('vi',{granularity:'grapheme'}).segment(text)];
 if(segments.length!==1||!/[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(text))invalid('Nhập một emoji (ví dụ 💜), :tên_emoji: hoặc mã <:tên:ID>. Không nhập cả chữ vào ô Emoji.');
 return {name:text};
}
async function normalizeChoice(guild,choice,role){
 if(choice.label!==undefined&&typeof choice.label!=='string')invalid('Tên nút không hợp lệ.');
 const source=choice.label||role.name;
 const embedded=source.match(customToken)||[];
 if(embedded.length>1)invalid('Mỗi nút chỉ dùng một emoji. Hãy để tên miền trong ô Tên nút.');
 const emoji=await resolveEmoji(guild,choice.emoji||embedded[0]);
 const label=(source.replace(customToken,'').trim()||role.name).trim();
 if(!label||label.length>80)invalid('Tên nút cần từ 1 đến 80 ký tự.');
 return {roleId:role.id,label,...(emoji?{emoji}:{})};
}
module.exports={resolveEmoji,normalizeChoice};
