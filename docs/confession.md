# Confession công khai và ẩn danh

Admin lưu kênh bằng /confessionconfig hoặc dashboard → Confession, sau đó /confessionpanel hoặc bấm Đăng / cập nhật bảng confession trên dashboard. Bấm lại cập nhật bảng hiện tại; nếu đã xóa bảng, bot đăng bảng mới. Bảng dùng màu confession và ảnh server, tiêu đề/lời giới thiệu tùy chỉnh trên dashboard (hỗ trợ {server}). Lưu cấu hình trước khi cập nhật bảng.

- Đăng công khai: ô viết ghi rõ hiện tài khoản. Bài đăng hiện tên hiển thị, avatar và tài khoản Discord của người gửi; không ping người gửi.
- Gửi ẩn danh: bài đăng không có tên, avatar hay ID người gửi. Bot không lưu ánh xạ tác giả vào confession_posts; nội dung tự người gửi ghi vẫn được giữ nguyên. Bình luận trong luồng luôn hiện danh tính người bình luận.
- /confess content:... vẫn mặc định ẩn danh. Thêm mode:public để công khai hoặc mode:anonymous để ẩn danh.

Hai chế độ dùng chung số thứ tự, cooldown, giới hạn nội dung, nút thích và luồng bình luận. Ô viết chỉ dùng một lần, gắn với người mở/server/chế độ đã chọn, hết hạn sau 15 phút. Dữ liệu ô viết tạm không chứa nội dung, được xóa khi gửi hoặc dọn khi hết hạn ở lần truy cập tiếp theo. Bảng và ô viết lưu SQLite để không phụ thuộc collector trong RAM.

Bot cần View Channel, Send Messages, Embed Links, Read Message History để quản lý bảng; Create Public Threads nếu bật bình luận. Đổi kênh confession làm bảng tại kênh cũ hết hiệu lực; dùng đăng/cập nhật bảng tại kênh mới.

Kiểm tra: node tests/confession-modes.cjs, node tests/dashboard.cjs, node tests/customization.cjs, node tests/multiserver.cjs.
