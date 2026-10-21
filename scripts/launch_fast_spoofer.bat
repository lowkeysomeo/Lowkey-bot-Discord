@echo off
chcp 65001 >nul
title Lowkey Fast Badge Spoofer (5000H & 100 Games)
cls

echo ======================================================================
echo           ⚡ LOWKEY TELEMETRY FAST BADGE SPOOFER ⚡
echo ======================================================================
echo.
echo [1] Chay Spoofer bang Python CLI (Doc lap tren may)
echo [2] Mo ma F12 Console de Copy va Dan truc tiep vao Discord (Khuyen dung nhat!)
echo [3] Huong dan chi tiet cach bat F12 Console tren Discord Desktop
echo [0] Thoat
echo.
echo ======================================================================
set /p choice="Nhap lua chon cua ban (0-3): "

if "%choice%"=="1" goto run_python
if "%choice%"=="2" goto open_f12
if "%choice%"=="3" goto show_guide
if "%choice%"=="0" exit /b

:run_python
cls
echo [*] Dang khoi dong Python Spoofer...
python "%~dp0fast_badge_spoofer.py"
pause
goto end

:open_f12
cls
echo [*] Dang mo file script F12 Console trong Notepad...
echo [*] Ban hay nhan Ctrl + A, Ctrl + C de copy toan bo noi dung!
start notepad.exe "%~dp0fast_badge_spoofer_f12.js"
pause
goto end

:show_guide
cls
echo ======================================================================
echo   HUONG DAN BAT DEVTOOLS CONSOLE (F12) TREN DISCORD DESKTOP
echo ======================================================================
echo.
echo Cach 1:
echo  1. Mo Discord Desktop.
echo  2. Nhan to hop phim: Ctrl + Shift + I
echo  3. Chon tab 'Console' o goc tren cung.
echo  4. Neu Discord canh bao, go vao console: allow pasting (nhan Enter)
echo  5. Dan toan bo code trong file fast_badge_spoofer_f12.js vao va nhan Enter!
echo.
echo Cach 2 (Neu Ctrl + Shift + I bi tat boi Discord):
echo  1. Nhan to hop phim Windows + R, go: %%appdata%%\discord\settings.json
echo  2. Them dong sau vao file settings.json (truoc dau } cuoi cung):
echo     "DANGEROUS_ENABLE_DEVTOOLS_ONLY_ENABLE_IF_YOU_KNOW_WHAT_YOU_ARE_DOING": true
echo  3. Khoi dong lai Discord, bam Ctrl + Shift + I la mo duoc Console!
echo.
echo ======================================================================
pause
goto end

:end
