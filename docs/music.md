# Nhạc

Vào kênh voice thường rồi dùng `/play query:<tên bài hoặc link>`.
Tìm tên bài trên SoundCloud trước, dùng YouTube nếu tìm nguồn SoundCloud thất bại.
Hỗ trợ link HTTPS YouTube/SoundCloud, một bài mỗi yêu cầu.

- `/queue`: xem bài đang phát và tối đa 10 bài tiếp theo.
- `/skip`: bỏ bài hiện tại.
- `/pause`, `/resume`: tạm dừng/tiếp tục.
- `/stop`: dừng, xoá hàng chờ, rời voice.

Người điều khiển phải ở cùng voice với bot. Bot cần View Channel, Connect, Speak.
Hàng chờ độc lập từng server, tối đa 50 bài chờ. Bot rời voice sau 60 giây hết bài
hoặc ngay khi không còn thành viên thật. Hàng chờ không lưu qua restart.
Không hỗ trợ Stage, livestream, playlist, link riêng tư hoặc link cần đăng nhập.

## Triển khai

Railway tự nhận Dockerfile: Node 24, Python 3, FFmpeg và Opus được cài cùng app.
Giữ nguyên các biến môi trường, PORT, volume SQLite /data đã có.
yt-dlp dùng Node để giải mã nguồn YouTube; không dùng cookies hay mật khẩu Discord.
YouTube/SoundCloud có thể chặn IP máy chủ; bot báo lỗi và bỏ qua bài không tải được.

Máy Windows: Node >=22.12, `npm install`.
youtube-dl-exec tải yt-dlp.exe độc lập; nếu máy chưa có Python, chỉ bỏ kiểm tra Python
khi cài trên Windows: `$env:YOUTUBE_DL_SKIP_PYTHON_CHECK='1'; npm install`.
Không cần bật bot thứ hai để chạy tests: `node tests/music.cjs`.

Link YouTube dùng client Android và bỏ bước tải trang web; nếu không có audio-only, FFmpeg tách âm thanh từ định dạng kết hợp. Không dùng tài khoản/cookies cá nhân.
