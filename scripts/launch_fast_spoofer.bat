@echo off
chcp 65001 >nul
title Lowkey Discord Science Badge Spoofer (2026 Pro Edition)
cls

echo ======================================================================
echo           ⚡ LOWKEY DISCORD SCIENCE BADGE SPOOFER (2026) ⚡
echo   Tua nhanh 100 Trò chơi Đa dạng ^& Giờ chơi qua Telemetry API nội bộ
echo ======================================================================
echo.
echo [1] Chay Spoofer bang Giao dien Desktop GUI (De dung, co Progress Bar)
echo [2] Chay Spoofer bang Python CLI (Terminal Console don le 1 nick)
echo [3] Chay Spoofer cày hang loat nhieu nick (Parallel multi-worker tu tokens.txt)
echo [4] Mo file tokens.txt de them danh sach Token cày hang loat
echo [5] Huong dan co che cap nhat Huy hieu cua Discord
echo [0] Thoat
echo.
echo ======================================================================
set /p choice="Nhap lua chon cua ban (0-5): "

if "%choice%"=="1" goto run_gui
if "%choice%"=="2" goto run_cli
if "%choice%"=="3" goto run_parallel
if "%choice%"=="4" goto open_tokens
if "%choice%"=="5" goto show_guide
if "%choice%"=="0" exit /b

:run_gui
cls
echo [*] Dang khoi dong Giao dien Desktop GUI...
start pythonw "%~dp0spoofer_desktop_gui.pyw"
exit /b

:run_cli
cls
echo [*] Dang khoi dong Python CLI...
python "%~dp0fast_badge_spoofer.py"
pause
goto end

:run_parallel
cls
echo [*] Dang khoi dong Parallel Spoofer cho danh sach tokens.txt...
python "%~dp0parallel_badge_spoofer.py"
pause
goto end

:open_tokens
cls
if not exist "%~dp0tokens.txt" (
    echo # Dan moi dong 1 Discord User Token > "%~dp0tokens.txt"
)
echo [*] Dang mo file tokens.txt trong Notepad...
start notepad.exe "%~dp0tokens.txt"
exit /b

:show_guide
cls
echo ======================================================================
echo        CO CHE GHI NHAN VA CAP NHAT TIEN TRINH HUY HIEU DISCORD
echo ======================================================================
echo.
echo 1. Vi sao truoc day dung tool khong tang tien trinh?
echo    - Discord KHONG tinh gio hay so game qua trang thai Gateway hay Dispatcher
echo      (RunningGameStore).
echo    - Discord chi ghi nhan khi nhan duoc goi tin Telemetry gui len:
echo      POST https://discord.com/api/v9/science
echo    - Dac biet tu nam 2026, Discord kiem tra chu ky so PE Authenticode
echo      (executable_fingerprint) cua Windows de chong bot gia mao.
echo.
echo 2. Tool moi Lowkey Science Spoofer hoat dong the nao?
echo    - Tu dong quet chu ky so Windows PE thuc te cua may ban.
echo    - Gui dung chu trinh 3 buoc: Initial Heartbeat -^> Launch Game -^> Final Heartbeat.
echo    - Su dung duration_tracked_ms chuan cua may chu Discord.
echo.
echo 3. Khi nao Discord hien thi huy hieu tren Profile?
echo    - Du lieu telemetry sau khi gui (HTTP 204) se vao hang doi xu ly cua Discord.
echo    - He thong Backend Pipeline cua Discord chay tong hop theo chu ky 24h - 48h.
echo    - Sau khi het chu ky tinh toan, huy hieu se duoc cap nhat chinh thuc!
echo.
echo ======================================================================
pause
goto end

:end
