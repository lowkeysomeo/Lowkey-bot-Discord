'use strict';
const { getDb } = require('./database');
function db() {
  const database = getDb();
  database.exec(`CREATE TABLE IF NOT EXISTS giveaways (
    id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, message_id TEXT,
    host_id TEXT NOT NULL, prize TEXT NOT NULL, description TEXT NOT NULL, winner_count INTEGER NOT NULL,
    required_role TEXT, ends_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft', winners TEXT NOT NULL DEFAULT '[]', round INTEGER NOT NULL DEFAULT 0,
    updated INTEGER NOT NULL DEFAULT 0, notice_state TEXT NOT NULL DEFAULT 'pending', notice_id TEXT,
    last_error TEXT, retry_at INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS giveaways_due ON giveaways(status, ends_at);
    CREATE TABLE IF NOT EXISTS giveaway_entries (
      giveaway_id TEXT NOT NULL REFERENCES giveaways(id) ON DELETE CASCADE, user_id TEXT NOT NULL,
      PRIMARY KEY(giveaway_id,user_id));`);
  return database;
}
const get = id => db().prepare('SELECT * FROM giveaways WHERE id = ?').get(id);
const count = id => db().prepare('SELECT COUNT(*) AS n FROM giveaway_entries WHERE giveaway_id = ?').get(id).n;
const entries = id => db().prepare('SELECT user_id FROM giveaway_entries WHERE giveaway_id = ? ORDER BY user_id').all(id).map(r => r.user_id);
function create(row) {
  db().prepare(`INSERT INTO giveaways (id,guild_id,channel_id,host_id,prize,description,winner_count,required_role,ends_at,created_at)
    VALUES (@id,@guild_id,@channel_id,@host_id,@prize,@description,@winner_count,@required_role,@ends_at,@created_at)`).run(row);
}
function patch(id, values) {
  const allowed = ['message_id','status','winners','round','updated','notice_state','notice_id','last_error','retry_at'];
  if (Object.keys(values).some(k => !allowed.includes(k))) throw new Error('Invalid giveaway patch');
  db().prepare(`UPDATE giveaways SET ${Object.keys(values).map(k => `${k} = @${k}`).join(',')} WHERE id = @id`).run({ ...values, id });
}
function toggle(id, userId, now = Date.now()) {
  const database = db();
  return database.transaction(() => {
    const row = get(id);
    if (!row || row.status !== 'active' || row.ends_at <= now) throw new Error('Giveaway đã đóng nhận lượt tham gia.');
    const removed = database.prepare('DELETE FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?').run(id,userId).changes;
    if (!removed) {
      if (count(id) >= 10000) throw new Error('Giveaway đã đủ 10.000 lượt tham gia.');
      database.prepare('INSERT INTO giveaway_entries VALUES (?, ?)').run(id,userId);
    }
    return { joined: !removed, count: count(id) };
  }).immediate();
}
function finish(id, status, round, values) {
  return db().prepare(`UPDATE giveaways SET status=@next_status,winners=@winners,round=@next_round,
    updated=0,notice_state='pending',notice_id=NULL,last_error=NULL,retry_at=0
    WHERE id=@id AND status=@status AND round=@round`).run({id,status,round,
      next_status:values.status,winners:values.winners,next_round:values.round}).changes;
}
const list = guildId => db().prepare('SELECT * FROM giveaways WHERE guild_id = ? ORDER BY created_at DESC LIMIT 100').all(guildId);
const pending = now => db().prepare(`SELECT * FROM giveaways WHERE retry_at <= ? AND
  ((status = 'active' AND ends_at <= ?) OR (status IN ('ended','cancelled') AND (updated = 0 OR notice_state = 'pending')))
  ORDER BY ends_at LIMIT 50`).all(now,now);
const activeCount = guildId => db().prepare("SELECT COUNT(*) AS n FROM giveaways WHERE guild_id = ? AND status IN ('draft','active')").get(guildId).n;
const drafts = () => db().prepare("SELECT * FROM giveaways WHERE status='draft'").all();
function recoverNotices() {
  db().prepare("UPDATE giveaways SET notice_state='uncertain',last_error='Kết quả đã lưu; chưa xác nhận gửi tin tag người thắng trước khi bot khởi động lại.' WHERE notice_state='sending'").run();
}
module.exports = { get,count,entries,create,patch,toggle,finish,list,pending,activeCount,drafts,recoverNotices };
