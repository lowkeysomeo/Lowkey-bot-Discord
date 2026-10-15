# Bộ nhớ dự án Lowkey-bot-Discord

> Đọc tệp này khi bắt đầu phiên làm việc mới. Đây là ghi chú bền vững trong repository, không phải bộ nhớ tự động của trợ lý. Kiểm tra lại mã hiện tại trước khi sửa; cập nhật ghi chú khi kiến trúc thay đổi.

## Mục tiêu làm việc

- Người dùng muốn tìm hiểu dự án và lưu ngữ cảnh để tiếp tục phát triển ở các phiên sau.
- Giao tiếp bằng tiếng Việt. Chưa có yêu cầu thay đổi tính năng cụ thể.
- Phiên khảo sát chỉ bổ sung tài liệu này, không sửa mã ứng dụng.

## Tổng quan và công nghệ

- Tên package: `lowkey-bot-discord`, phiên bản `0.0.1`; mô tả: VietNam Legacy Discord Bot.
- Bot Discord đa server, kèm dashboard tiếng Việt chạy trong cùng tiến trình.
- JavaScript CommonJS, Node.js, discord.js 14, SQLite qua better-sqlite3.
- Dashboard dùng `node:http`, frontend trong `dashboard/public/`; không dùng Express trong server đã khảo sát.
- Ảnh rank/leaderboard dùng `@napi-rs/canvas`.
- Nhạc dùng `@discordjs/voice`, FFmpeg, Opus, youtube-dl-exec; có nguồn YouTube/SoundCloud/Spotify và kho nhạc local.
- Dockerfile dùng Node 24 Debian bookworm-slim, cài Python/build tools và font.

## Bản đồ mã nguồn

| Vị trí | Vai trò |
| --- | --- |
| `index.js` | Khởi tạo DB/client, gắn sự kiện, dashboard, các timer và đăng nhập bot |
| `commands/admin/` | Cấu hình, moderation, XP, ticket, giveaway, reaction role, confession |
| `commands/fun/` | Avatar, confession, invites |
| `commands/level/` | Rank và leaderboard Chat/Voice/tổng |
| `commands/music/` | Play, queue, pause/resume, skip/stop và musiclocal |
| `utils/loadCommands.js` | Nạp `commands/<nhóm>/*.js`; module cần `data.name` và `execute` |
| `utils/deployCommands.js`, `deploy.js` | Đăng ký slash commands |
| `utils/database.js` | SQLite, schema XP/tháng, migration dữ liệu JSON cũ |
| `utils/guildSettings.js` | Cấu hình từng guild, fallback biến môi trường chỉ cho guild gốc |
| `utils/customization.js` | Các tùy chọn chức năng và cấu hình phần thưởng |
| `utils/levelSystem.js`, `voiceLevelSystem.js`, `voiceXpTick.js` | XP và level |
| `utils/levelRoles.js`, `voiceRoles.js`, `xpBoost.js`, `xpExclusions.js` | Role theo mốc, booster, kênh loại trừ |
| `utils/monthlySystem.js` | Chốt bảng xếp hạng và role tháng |
| `utils/create*Card.js`, `canvasCommon.js` | Tạo ảnh thông báo và bảng xếp hạng |
| `utils/confession*.js` | Confession, panel/modal, dữ liệu và phần thưởng |
| `utils/giveaway*.js`, `reactionRoles.js`, `rolePickLimits.js` | Giveaway, tự nhận role, giới hạn nhận role |
| `utils/ticketSystem.js` | Ticket, phân nhóm xử lý, nhận/đóng ticket và transcript |
| `utils/securitySystem.js`, `securityReview.js`, `channelGuard.js` | Bảo vệ server, xét duyệt, bảo vệ kênh |
| `utils/chatModeration.js`, `modLog.js`, `webhookGuard.js`, `staffWatch.js` | Lệnh moderation chat, log, webhook và giám sát staff |
| `utils/inviteSystem.js`, `receptionistNotice.js`, `roleNotifications.js` | Theo dõi invite, chào thành viên, thông báo role |
| `utils/musicSystem.js`, `musicSource.js`, `spotifySource.js`, `localMusic.js` | Phiên phát nhạc và xử lý nguồn |
| `dashboard/server.js` | HTTP, OAuth Discord, API quản trị |
| `dashboard/customization.js`, `testMessages.js` | Validation cấu hình và gửi thông báo mẫu |
| `dashboard/public/` | Giao diện quản trị |
| `check.js`, `tests/*.cjs` | Kiểm tra cú pháp, nạp module/lệnh và kiểm thử offline |
| `docs/` | Tài liệu dashboard, multi-server, confession, giveaway, reaction roles, music |

## Luồng hoạt động chính

1. `index.js` nạp dotenv, khởi tạo DB rồi tạo Discord client và nạp commands.
2. Gắn security, invite, role notice, voice/music và khởi động dashboard nếu được bật.
3. Khi ClientReady: khởi động giveaway/reaction roles/invites, deploy slash commands, chạy hệ thống tháng và timer Voice XP mỗi 60 giây.
4. MessageCreate: lọc webhook/bot, xử lý lệnh moderation chat, kiểm tra XP bật/tắt và kênh loại trừ, cooldown theo guild/user, cộng XP có booster rồi đồng bộ role/thông báo.
5. InteractionCreate định tuyến theo customId cho ticket, security, reaction role, confession, giveaway, musiclocal; sau đó autocomplete và slash command.
6. Slash command chỉ dùng trong guild; command được gọi qua `execute(interaction)`.
7. Cuối cùng đăng nhập bằng `TOKEN`. Khởi động thật có tác động Discord, bao gồm deploy lệnh; không dùng để kiểm tra offline.

## Dữ liệu và phân tách server

- Đường dẫn DB ưu tiên `DB_PATH`, sau đó `/data/vietnam-legacy.sqlite` nếu có thư mục `/data`, cuối cùng `data/vietnam-legacy.sqlite` theo working directory.
- SQLite bật WAL, foreign keys và busy timeout 5000ms.
- Bảng lõi gồm `chat_levels`, `voice_levels`, `monthly_state`, `monthly_results`, `monthly_role_holders`; các module tính năng có phần lưu trữ riêng.
- XP dùng khóa guild/user; cấu hình guild nằm trong `guild_settings` và các bảng tùy chỉnh.
- `GUILD_ID` là server gốc cho tương thích cấu hình/migration, không phải giới hạn bot chỉ chạy một server.
- Cấu hình SQLite ưu tiên hơn biến môi trường; không làm rò cấu hình kênh/role sang guild khác.
- Tài liệu triển khai yêu cầu giữ volume `/data` và một replica. Không chạy bot local cùng token với bot production.

## Dashboard

- Bật bằng `DASHBOARD_ENABLED=true`; cấu hình `PORT`, `DASHBOARD_URL`, `DISCORD_CLIENT_SECRET`, cùng `CLIENT_ID` và `TOKEN` của bot.
- OAuth redirect: `<DASHBOARD_URL>/auth/callback`, scope `identify guilds`.
- Quyền quản trị dành cho owner hoặc Administrator của guild; API kiểm tra quyền và dữ liệu thuộc guild.
- Session/OAuth token lưu trong bộ nhớ server, session hết hạn tối đa một giờ và mất khi restart.
- Có cookie HttpOnly/SameSite, Secure trên HTTPS, OAuth state, kiểm tra Origin/CSRF và giới hạn tần suất.
- `/health` kiểm tra web server, không đồng nghĩa bot đã kết nối Discord.
- Xem `docs/dashboard.md` trước khi thay đổi xác thực hoặc triển khai.

## Cách chạy và kiểm tra

Chạy tại thư mục gốc repository vì một số module dùng `process.cwd()`.

```powershell
npm ci
npm run check        # Cú pháp và nạp module/lệnh; không đăng nhập bot
npm test             # check.js --tests
node check.js --tests # Gọi trực tiếp trình kiểm thử
npm start            # Chỉ khi được phép chạy bot thật
```

- Sao chép cấu hình mẫu `.env.example` và điền thông tin riêng nếu thiết lập môi trường mới; không ghi đè `.env` hiện có.
- Discord client khai báo Guilds, GuildModeration, GuildMembers, GuildInvites, GuildMessages, GuildVoiceStates và MessageContent intents; cần cấu hình privileged intents tương ứng trong Developer Portal.
- `check.js` dùng `DB_PATH=:memory:`, kiểm tra cú pháp rồi nạp module và chạy từng test ở tiến trình riêng.
- Windows: tài liệu music ghi Node >=22.12; nếu cài youtube-dl-exec thiếu Python, xem hướng dẫn `YOUTUBE_DL_SKIP_PYTHON_CHECK` trong `docs/music.md`.
- Không gọi `deploy.js` hoặc `clear-global.js` chỉ để kiểm tra; chúng liên quan lệnh Discord thật.

## Kết quả khảo sát đã xác minh

- Mốc mã nguồn lúc khảo sát: commit `2604b2d`; working tree ban đầu sạch.
- Môi trường: Node `v24.21.0`, npm `12.2.0`.
- Nạp được 34 commands; thư mục tests có 29 tệp `.cjs`.
- `node check.js --tests` chạy thành công, mã thoát 0, kết quả cuối không phát hiện lỗi.
- Lần gọi qua `npm test` báo các test đạt nhưng công cụ shell nhận mã 1; nguyên nhân chưa được xác định. Đã xác nhận lại bằng lệnh Node trực tiếp, không coi đây là lỗi test ứng dụng đã được chứng minh.
- Test bao phủ nhiều-server, dashboard OAuth/API, XP/role, confession, giveaway, invite, music, moderation/security và ticket.
- Chưa kiểm tra đăng nhập Discord thật, OAuth trình duyệt thật, phát audio qua mạng thật hoặc triển khai Railway.
- README hiện rất ngắn; nên đọc `docs/` và mã nguồn thay vì chỉ dựa vào README.
- `docs/music.md` có mô tả hỗ trợ Spotify playlist/album nhưng cũng có dòng chung nói không hỗ trợ playlist; khi sửa nhạc cần đối chiếu implementation/tests thay vì hiểu dòng đó áp dụng cho mọi nguồn.

## Quy tắc cho phiên tiếp theo

1. Đọc tài liệu này, chạy `git status --short` và xem mã/test liên quan trước khi sửa.
2. Giữ nguyên thay đổi có sẵn của người dùng; chỉ sửa phạm vi được yêu cầu.
3. Không đọc/đưa token, Client Secret hoặc mật khẩu proxy vào tài liệu/chat/commit.
4. Không chạy bot thật hoặc chỉnh dữ liệu production để khảo sát.
5. Khi sửa logic guild, giữ nguyên phân tách guild và kiểm tra quyền; bổ sung/chạy test liên quan rồi chạy kiểm thử tổng nếu phù hợp.
6. Cập nhật phần kết quả xác minh và ghi chú kiến trúc khi có thay đổi thực tế; không coi kết quả test cũ là bảo đảm cho mã mới.
