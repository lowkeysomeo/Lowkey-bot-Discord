@echo off
chcp 65001 >nul
title Lowkey Discord Science Badge Spoofer (2026 Pro Edition)
cls

echo ======================================================================
echo           ⚡ LOWKEY DISCORD SCIENCE BADGE SPOOFER (2026) ⚡
echo   Tua nhanh Huy hiệu Profile Discord qua Telemetry API nội bộ
echo ======================================================================
echo.
echo [1] Cày Huy hiệu 1: TRÒ CHƠI ĐA DẠNG (100 Game độc nhất)
echo [2] Cày Huy hiệu 2: THỜI GIAN CHƠI (Tùy chọn 150h, 500h, 5.000h)
echo [3] Mở Giao diện Desktop GUI (Có thanh tiến trình trực quan)
echo [4] Mở file tokens.txt (Dán danh sách token để cày hàng loạt)
echo [5] Hướng dẫn cơ chế cập nhật Huy hiệu của Discord
echo [0] Thoát
echo.
echo ======================================================================
set /p choice="Nhập lựa chọn của bạn (0-5): "

if "%choice%"=="1" goto run_variety
if "%choice%"=="2" goto run_time
if "%choice%"=="3" goto run_gui
if "%choice%"=="4" goto open_tokens
if "%choice%"=="5" goto show_guide
if "%choice%"=="0" exit /b

:run_variety
cls
echo [*] Đang khởi động cày Huy hiệu Trò chơi đa dạng (100 game)...
python "%~dp0spoofer_badge_variety.py"
pause
goto end

:run_time
cls
echo [*] Đang khởi động cày Huy hiệu Thời gian chơi...
python "%~dp0spoofer_badge_time.py"
pause
goto end

:run_gui
cls
echo [*] Đang khởi động Giao diện Desktop GUI...
start pythonw "%~dp0spoofer_desktop_gui.pyw"
exit /b

:open_tokens
cls
if not exist "%~dp0tokens.txt" (
    echo # Dán mỗi dòng 1 Discord User Token > "%~dp0tokens.txt"
)
echo [*] Đang mở file tokens.txt trong Notepad...
start notepad.exe "%~dp0tokens.txt"
exit /b

:show_guide
cls
echo ======================================================================
echo        CƠ CHẾ GHI NHẬN VÀ CẬP NHẬT TIẾN TRÌNH HUY HIỆU DISCORD
echo ======================================================================
echo.
echo 1. Vì sao chia làm 2 script riêng biệt?
echo    - Huy hiệu "Trò chơi đa dạng" yêu cầu 100 game KHÁC NHAU. Script 1 sẽ
echo      lọc đúng 105 tựa game PC độc nhất để gửi lên Discord.
echo    - Huy hiệu "Thời gian chơi" chỉ cần tích lũy giờ chơi cho game chính.
echo      Script 2 sẽ gửi thời lượng 5.000h (duration_tracked_ms) cho 1 game duy nhất.
echo.
echo 2. Cần chuẩn bị gì trước khi chạy?
echo    - Chỉ cần mở tokens.txt và dán User Token vào (mỗi dòng 1 token).
echo    - Tool sẽ tự động băm chữ ký Windows PE (executable_fingerprint) thật
echo      từ máy của bạn, đảm bảo Discord xác thực phiên chơi hợp lệ 100%%.
echo.
echo 3. Khi nào Discord hiển thị huy hiệu trên Profile?
echo    - Dữ liệu sau khi gửi thành công (HTTP 204) sẽ vào hàng đợi Discord.
echo    - Hệ thống Backend Pipeline của Discord chạy tổng hợp sau mỗi 24h - 48h.
echo.
echo ======================================================================
pause
goto end

:end
