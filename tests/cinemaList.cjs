'use strict';
const assert = require('node:assert/strict');
process.env.DB_PATH = ':memory:';
process.env.CINEMA_ENABLED = 'true';
const cinema = require('../utils/cinema');
const { movieDetails, formatDuration } = require('../utils/movieCatalog');
const command = require('../commands/fun/cinemalist');
assert.equal(movieDetails('Bẫy Tiền Vietsub - Motchill.mp4', 1027658862).title, 'Bẫy Tiền');
assert.equal(movieDetails('Phí Phông- Quỷ Máu Rừng Thiêng Vietsub - Motchill.mp4', 2106145509).title, 'Phí Phông – Quỷ Máu Rừng Thiêng');
assert.equal(movieDetails('thanh-xuan-18-2.mp4', 1045179373).title, 'Thanh Xuân 18x2');
assert.equal(movieDetails('Bẫy Tiền Vietsub - Motchill.mp4', 99).durationSeconds, null);
assert.equal(movieDetails('rừng-thiêng-vietsub.mp4').title, 'Rừng Thiêng');
assert.equal(formatDuration(6530), '1 giờ 48 phút 50 giây');
assert.equal(formatDuration(7241), '2 giờ 00 phút 41 giây');
assert.equal(formatDuration(7442), '2 giờ 04 phút 02 giây');
assert.equal(formatDuration(null), 'Chưa cập nhật');
const sample = { key: 'secret-file.mp4', title: 'Bẫy Tiền', source: 'https://private.example/secret-file.mp4', size: 1027658862, durationSeconds: 6530, lastModified: new Date('2026-10-19T10:00:00Z') };
const origListUploadedMovies = cinema.listUploadedMovies;
async function run(movies, tab) {
  cinema.listUploadedMovies = async () => movies;
  let reply;
  const callbacks = {};
  await command.execute({ inGuild: () => true, options: { getString: () => tab }, guildId: '111', user: { id: '222' }, deferReply: async () => {}, editReply: async payload => {
    reply = payload;
    return { createMessageComponentCollector: () => ({ on: (name, fn) => { callbacks[name] = fn; } }) };
  } });
  return { reply, callbacks };
}
(async () => {
  const { reply } = await run([sample]);
  const json = JSON.stringify(reply);
  assert(!/private\.example|secret-file|Dashboard|Dung lượng|Tệp lưu trữ|Link video/.test(json));
  assert.equal(reply.embeds[0].data.fields[0].name, '1. 🎞️ Bẫy Tiền');
  assert.match(json, /1 giờ 48 phút 50 giây/);
  assert.equal(reply.components.length, 1);
  const empty = (await run([])).reply;
  assert.equal(empty.components.length, 1);
  assert(!/Dashboard|uploadMovie|Cloudflare/.test(JSON.stringify(empty)));
  const multiple = await run(Array.from({ length: 6 }, (_, i) => ({ ...sample, title: 'Phim ' + i })));
  assert.equal(multiple.reply.components.length, 2);
  assert.equal(multiple.reply.embeds[0].data.fields.length, 5);
  let page;
  await multiple.callbacks.collect({ customId: 'cinemalist:next', update: async payload => { page = payload; } });
  assert.equal(page.embeds[0].data.fields.length, 1);
  assert.equal(page.embeds[0].data.fields[0].name, '6. 🎞️ Phim 5');
  const baseConfig = { enabled: false, title: 'Cinema', description: '', audience: 'members', roleIds: [], rightsConfirmed: false, shows: [], revision: 0 };
  const appearance = { title: 'Lịch phim cuối tuần', description: 'Mời bạn xem phim!', footer: 'Rạp của mình', color: '#ab1234', showPosters: true };
  const saved = cinema.saveConfig('custom-list', { ...baseConfig, scheduleAppearance: appearance }, new Map(), {});
  assert.deepEqual(cinema.getConfig('custom-list').scheduleAppearance, appearance);
  cinema.saveConfig('custom-list', { ...baseConfig, revision: saved.revision }, new Map(), {});
  assert.deepEqual(cinema.getConfig('custom-list').scheduleAppearance, appearance, 'old clients must preserve appearance');
  for (const invalid of [{color:'red'}, {showPosters:'false'}, {title:'x'.repeat(101)}, {description:'x'.repeat(701)}, {footer:'x'.repeat(121)}]) {
    assert.throws(() => cinema.validate({...baseConfig, scheduleAppearance:invalid},new Map(),{}),{status:400});
  }
  const shows = Array.from({length:5},(_,i)=>({id:'show'+i,title:'Phim '+i,imageUrl:'https://images.example/poster'+i+'.jpg',roomId:i%3+1,startsAt:'2030-01-01T12:00:00Z',endsAt:'2030-01-01T14:00:00Z'}));
  const cards=command.buildScheduleEmbeds(shows,0,2,4,appearance).map(e=>e.toJSON());
  assert.equal(cards.length,5);
  assert.equal(cards[0].title,appearance.title); assert.equal(cards[0].description,appearance.description); assert.equal(cards[0].color,0xab1234);
  assert.equal(cards[1].title,'1. 🎞️ Phim 0'); assert.equal(cards[1].thumbnail.url,shows[0].imageUrl); assert.match(cards[1].description,/Cinema 1/); assert(!cards[1].image);
  assert.match(cards[2].description,/Cinema 2/); assert.match(cards[4].footer.text,/Rạp của mình/);
  const secondPage=command.buildScheduleEmbeds(shows,1,2,4,appearance).map(e=>e.toJSON());
  assert.equal(secondPage.length,1); assert.equal(secondPage[0].fields[0].name,'5. 🎞️ Phim 4'); assert.equal(secondPage[0].thumbnail.url,shows[4].imageUrl); assert(!secondPage[0].image);
  const noPictures=command.buildScheduleEmbeds(shows,0,2,4,{...appearance,showPosters:false}).map(e=>e.toJSON());
  assert.equal(noPictures.length,5); assert(noPictures.every(e=>!e.image && !e.thumbnail));
  const badImage=command.buildScheduleEmbeds([{...shows[0],imageUrl:'javascript:bad'}],0,1,4,appearance);
  assert.equal(badImage.length,1); assert.equal(badImage[0].data.thumbnail,undefined);
  assert.equal(command.buildScheduleEmbeds([],0,1,4,appearance).length,1);
  const full=command.buildScheduleEmbeds(shows.map(q=>({...q,title:'x'.repeat(120)})),0,2,4,{...appearance,title:'t'.repeat(100),description:'d'.repeat(700),footer:'f'.repeat(120)}).map(e=>e.toJSON());
  const textLength=full.reduce((n,e)=>n+(e.title||'').length+(e.description||'').length+(e.footer?.text||'').length,0);
  assert(textLength<=6000);
  const appSource=require('node:fs').readFileSync(require('node:path').join(__dirname,'../dashboard/public/app.js'),'utf8');
  const renderSource=appSource.slice(appSource.indexOf('function cinemaPage()'),appSource.indexOf('function bindCinema()'));
  const escapeSource=appSource.split('\n').find(l=>l.startsWith('const h ='));
  const html=require('node:vm').runInNewContext(escapeSource+'\n'+renderSource+'\ncinemaPage()',{
    state:{data:{cinema:{config:{...baseConfig,scheduleAppearance:{...appearance,title:'<img onerror=bad>'}},roles:[],channels:[],available:true,mediaOrigin:'https://media.example'}}},heading:()=>''
  });
  assert(html.includes('name="scheduleTitle"')); assert(html.includes('value="&lt;img onerror=bad&gt;"'));
  assert(html.includes('name="scheduleShowPosters"')); assert(html.includes('name="scheduleColor"'));
  const realGetConfig=cinema.getConfig;
  cinema.getConfig=()=>({shows,scheduleAppearance:appearance});
  try {
    const schedule=await run([sample],'lich'); assert.equal(schedule.reply.embeds.length,5);
    let next;
    await schedule.callbacks.collect({customId:'cinemalist:next',update:async p=>{next=p}});
    assert.equal(next.embeds[0].data.fields[0].name,'5. 🎞️ Phim 4');
    await schedule.callbacks.collect({customId:'cinemalist:tab:kho',update:async p=>{next=p}});
    assert.equal(next.embeds.length,1); assert.equal(next.embeds[0].data.fields[0].name,'1. 🎞️ Bẫy Tiền');
  } finally { cinema.getConfig=realGetConfig; }
  cinema.listUploadedMovies = origListUploadedMovies;
  console.log('PASS cinemaList: persisted appearance, validation, compact cards and small thumbnails, image fallback, Discord limits, tab switching and pagination.');
})().catch(error => { cinema.listUploadedMovies = origListUploadedMovies; console.error(error); process.exitCode = 1; });
