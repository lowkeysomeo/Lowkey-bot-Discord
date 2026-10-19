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
async function run(movies) {
  cinema.listUploadedMovies = async () => movies;
  let reply;
  const callbacks = {};
  await command.execute({ inGuild: () => true, guildId: '111', user: { id: '222' }, deferReply: async () => {}, editReply: async payload => {
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
  assert.equal(reply.components.length, 0);
  const empty = (await run([])).reply;
  assert.equal(empty.components.length, 0);
  assert(!/Dashboard|uploadMovie|Cloudflare/.test(JSON.stringify(empty)));
  const multiple = await run(Array.from({ length: 6 }, (_, i) => ({ ...sample, title: 'Phim ' + i })));
  assert.equal(multiple.reply.components.length, 1);
  assert.equal(multiple.reply.embeds[0].data.fields.length, 5);
  let page;
  await multiple.callbacks.collect({ customId: 'cinemalist:next', update: async payload => { page = payload; } });
  assert.equal(page.embeds[0].data.fields.length, 1);
  assert.equal(page.embeds[0].data.fields[0].name, '6. 🎞️ Phim 5');
  console.log('cinemaList: titles, measured durations, member-safe content, empty state and pagination passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
