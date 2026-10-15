# Bảo vệ server

Dashboard → Bảo vệ server chia thành: tổng quan, anti-nuke, anti-raid, chat, link mời, bot/webhook và giám sát staff. Chỉ chủ server được lưu cấu hình bảo vệ.

- Anti-nuke đếm cộng các thao tác quản trị trong cửa sổ thời gian; không phải cơ chế phục hồi toàn bộ server. Chọn ngưỡng phù hợp hoạt động staff, tránh ngưỡng quá thấp trên server lớn.
- Anti-raid ghi thời hạn chặn vào SQLite để restart vẫn giữ được trạng thái. Khi hết thời hạn sẽ tự cho thành viên mới vào bình thường.
- Chặn invite nhận diện discord.gg, discord.com/invite, discordapp.com/invite, cả tin nhắn sửa lại. Không phải bộ quét mọi link lừa đảo hay link rút gọn.
- Ngoại lệ invite theo kênh/role độc lập với ngoại lệ spam. Nên chọn riêng Partner Post; miễn một role sẽ cho role đó đăng invite ở mọi kênh.
- Chống lặp nội dung tính theo người trong cùng server, kể cả chuyển kênh. Tin nhắn sửa lại không tăng bộ đếm tốc độ/lặp.
- Vi phạm chat được xóa, có thể timeout theo cấu hình. Mỗi người có khoảng nghỉ 30 giây giữa các lần xử lý/log để tránh dồn API; tin tiếp theo vi phạm vẫn bị xóa.
- Webhook được kiểm tra một lần cho mỗi tin mới; có ngưỡng và danh sách ID webhook tin cậy riêng.
- Staff Watch chỉ khôi phục tên/icon khi Audit Log khớp thay đổi. Mặc định không tự gỡ ban khi staff vượt hạn mức; chủ server đối soát trước để tránh cho người raid quay lại.
- Bot không thể xử lý chủ server hoặc thành viên/role nằm trên bot. Cấp đúng quyền và đặt role bot đủ cao; tài khoản chủ server và bot này luôn được tin cậy.

Kiểm tra offline: npm test. Không chạy bot thứ hai với cùng token. Không thử raid, ban hoặc spam trên server thật để kiểm thử.
