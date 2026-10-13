# Nhạc

Vào kênh voice thường rồi dùng `/play query:<tên bài hoặc link YouTube / SoundCloud / Spotify>`.
Tìm tên bài trên SoundCloud trước, dùng YouTube nếu tìm nguồn SoundCloud thất bại.
Hỗ trợ link HTTPS YouTube, SoundCloud và Spotify (cả bài hát lẻ, Album lẫn Playlist).
Khi dán link Playlist/Album Spotify, bot nạp toàn bộ bài hát vào hàng chờ và tự động kiểm tra, cập nhật thêm bài mới khi playlist trên Spotify có thêm nhạc mới.

- `/queue`: xem bài đang phát và tối đa 10 bài tiếp theo.
- `/skip`: bỏ bài hiện tại.
- `/pause`, `/resume`: tạm dừng/tiếp tục.
- `/stop`: dừng, xoá hàng chờ, rời voice.

## Kho Nhạc Cục Bộ (Local Playlist - MP3 / MP4)

Hệ thống cho phép lưu sẵn các file nhạc (.mp3, .mp4, .m4a, .wav, .ogg, .flac) vào kho nhạc của bot để phát bất kỳ lúc nào qua FFmpeg trực tiếp, không phụ thuộc vào YouTube/SoundCloud hay lo bị chặn mạng.

- `/musiclocal add file:<đính kèm> [ten:<tên gợi nhớ>]`: tải và lưu file nhạc vào kho lưu trữ của bot.
- `/musiclocal list`: xem danh sách tất cả các bài hát đang có trong kho nhạc.
- `/musiclocal play [bai_hat:<tên bài>]`: phát bài hát từ kho; nếu để trống tham số, bot sẽ mở bảng điều khiển trực quan có Dropdown Menu chọn bài cùng nút `▶️ Phát Tất Cả` và `🔀 Phát Ngẫu Nhiên`.
- `/musiclocal remove bai_hat:<tên bài>`: xóa bài hát khỏi kho lưu trữ (yêu cầu quyền Quản lý kênh/Admin).

Ngoài ra, bạn cũng có thể copy trực tiếp các file `.mp3` hoặc `.mp4` vào thư mục `data/local_music/` của bot (hoặc volume `/data/local_music` trên Railway), bot sẽ tự động nhận diện bài hát ngay lập tức.

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

Nếu IP Railway bị YouTube yêu cầu đăng nhập, client Android và PO token không đảm bảo khắc phục. Đã thử link 3tV09SB4GcM: máy Windows lấy được Opus, IP Railway vẫn bị yêu cầu xác minh. Có thể cấu hình YOUTUBE_PROXY_URL (HTTP CONNECT) trong Railway Variables, dạng http://user:password@host:port. Proxy phải cho phép cả YouTube và CDN googlevideo.com; bot dùng cùng proxy cho yt-dlp lẫn FFmpeg. SoundCloud giữ mạng hiện tại. Không ghi mật khẩu proxy vào Git/chat. Chưa có proxy để kiểm tra đường phát này.
