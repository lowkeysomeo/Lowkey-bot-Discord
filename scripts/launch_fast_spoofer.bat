@echo off
title Lowkey Discord Science Badge Spoofer 2026
cls

echo ======================================================================
echo           LOWKEY DISCORD SCIENCE BADGE SPOOFER (2026)
echo   Tua nhanh Huy hieu Profile Discord qua Telemetry API noi bo
echo ======================================================================
echo.
echo [1] Cay Huy hieu 1: TRO CHOI DA DANG (105 Game doc nhat)
echo [2] Cay Huy hieu 2: THOI GIAN CHOI (Tuy chon 150h, 500h, 5.000h)
echo [3] Mo Giao dien Desktop GUI (Co thanh tien trinh truc quan)
echo [4] Mo file tokens.txt (Dan danh sach token de cay hang loat)
echo [5] Huong dan co che cap nhat Huy hieu cua Discord
echo [0] Thoat
echo.
echo ======================================================================
set "choice="
set /p choice="Nhap lua chon cua ban (0-5): "

if "%choice%"=="1" goto run_variety
if "%choice%"=="2" goto run_time
if "%choice%"=="3" goto run_gui
if "%choice%"=="4" goto open_tokens
if "%choice%"=="5" goto show_guide
if "%choice%"=="0" exit /b
goto end

:run_variety
cls
echo [*] Dang khoi dong cay Huy hieu Tro choi da dang (105 game doc nhat)...
python "%~dp0spoofer_badge_variety.py"
pause
goto end

:run_time
cls
echo [*] Dang khoi dong cay Huy hieu Thoi gian choi...
python "%~dp0spoofer_badge_time.py"
pause
goto end

:run_gui
cls
echo [*] Dang khoi dong Giao dien Desktop GUI...
start pythonw "%~dp0spoofer_desktop_gui.pyw"
exit /b

:open_tokens
cls
if not exist "%~dp0tokens.txt" (
    echo # Dan moi dong 1 Discord User Token> "%~dp0tokens.txt"
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
echo 1. Vi sao chia lam 2 script rieng biet?
echo    - Huy hieu Tro choi da dang yeu cau 100 game KHAC NHAU. Script 1 se
echo      loc dung 105 tua game PC doc nhat de gui len Discord.
echo    - Huy hieu Thoi gian choi chi can tich luy gio choi cho game chinh.
echo      Script 2 se gui thoi luong 5.000h cho 1 game duy nhat.
echo.
echo 2. Can chuan bi gi truoc khi chay?
echo    - Chi can mo tokens.txt va dan User Token vao (moi dong 1 token).
echo    - Tool se tu dong tao chu ky Windows PE (executable_fingerprint)
echo      that tu may cua ban, dam bao Discord xac thuc phien choi hop le 100%%.
echo.
echo 3. Khi nao Discord hien thi huy hieu tren Profile?
echo    - Du lieu sau khi gui thanh cong (HTTP 204) se vao hang doi Discord.
echo    - He thong Backend Pipeline cua Discord chay tong hop sau moi 24h - 48h.
echo.
echo ======================================================================
pause
goto end

:end
