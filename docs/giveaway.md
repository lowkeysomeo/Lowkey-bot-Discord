# Giveaway VietNam Legacy

Trong dashboard chọn server → **Giveaway**. Chọn kênh, phần thưởng **cho mỗi người thắng**, thời lượng (30m, 2h, 7d), số người thắng (1–20), role điều kiện tùy chọn và lời nhắn. **Gửi bản thử** đăng mẫu có nút tắt, không tạo chương trình thật hoặc ping. **Đăng giveaway** mở chương trình thật.

Slash commands (Administrator):
- `/giveaway create prize:1 tháng Nitro duration:24h winners:3 channel:#giveaway`
- `/giveaway list`: xem ID của chương trình đang mở.
- `/giveaway end id:...`: đóng ngay và quay.
- `/giveaway cancel id:...`: hủy, không chọn người thắng.
- `/giveaway reroll id:...`: quay lại, loại người thắng hiện tại. Có thể ít người thắng hơn cấu hình nếu không đủ người đủ điều kiện; không lặp tài khoản trong một lượt.

Member bấm nút 🎉 Tham gia; bấm lại để rút lượt. Một tài khoản một lượt, không nhận bot. Bot kiểm tra thành viên hiện tại và role điều kiện qua Discord trước khi quay. Tài khoản rời server hoặc mất role không được chọn. Lỗi API tạm thời sẽ trì hoãn quay thay vì loại nhầm thành viên.

Bot cần View Channel, Send Messages, Embed Links, Read Message History trong kênh. Không cần Manage Roles: bot thông báo phần thưởng, ban tổ chức tự trao quà. Không tự nhắn riêng, không tag @everyone/@here; tin chúc mừng chỉ ping những người thắng.

SQLite lưu giveaway, lượt tham gia, kết quả và trạng thái gửi thông báo riêng từng server. Bộ hẹn giờ kiểm tra mỗi 15 giây, khôi phục chương trình quá hạn khi bot kết nối lại. Dữ liệu Railway nằm ở DB_PATH trên volume hiện tại. Một tiến trình bot sử dụng cùng database. Kết quả lưu trước khi cập nhật Discord; lỗi sửa bài sẽ thử lại mỗi phút và giữ nguyên kết quả. Quay ngẫu nhiên bằng crypto.randomInt, chọn không lặp. Tối đa 50 chương trình đang mở/server và 10.000 lượt/chương trình.

Tin tag được đánh dấu đang gửi trước khi gọi Discord để tránh ping lặp sau sự cố. Nếu mất kết nối đúng lúc gửi hoặc bot khởi động lại giữa thao tác, dashboard báo chưa xác nhận gửi tin tag; kết quả vẫn hiện ở bài giveaway. Không tự gửi lại tin tag trong tình huống không chắc chắn. Bài đăng nháp do sự cố được tìm lại trong 100 tin gần nhất của kênh; nếu không tìm thấy, admin tạo chương trình mới.

Dashboard dùng quyền owner/Administrator, phiên Discord, CSRF/Origin hiện có; giới hạn thao tác 6 lần/phút theo admin/server. Kết thúc, hủy, quay lại có bước xác nhận trên giao diện.

Kiểm tra: `node tests/giveaway.cjs`, `node tests/dashboard.cjs`, các bộ regression hiện có. Test dùng database tạm và Discord giả lập; không tổ chức giveaway thật trên server.
