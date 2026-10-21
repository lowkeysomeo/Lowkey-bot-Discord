@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
title Discord Auto Stream Badge - Lowkey Bot
color 0a
cd /d "%~dp0\.."

set "NODE_CMD=node"
where node >nul 2>&1
if %errorlevel% neq 0 (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "NODE_CMD=C:\Program Files\nodejs\node.exe"
        set "PATH=C:\Program Files\nodejs;!PATH!"
    ) else if exist "%ProgramFiles%\nodejs\node.exe" (
        set "NODE_CMD=%ProgramFiles%\nodejs\node.exe"
        set "PATH=%ProgramFiles%\nodejs;!PATH!"
    ) else (
        color 0c
        echo [ERROR] Node.js chua duoc cai dat hoac chua co trong PATH!
        echo Vui long cai dat Node.js tu https://nodejs.org
        echo.
        pause
        exit /b 1
    )
)

echo ================================================================
echo   LOWKEY DISCORD AUTO STREAM BADGE - TOKEN RUNNER
echo   Tu dong cay gio Phat truc tiep / Stream cho nguoi khac 24/7
echo ================================================================
echo.
echo  10 Cap do: Nguoi moi (1h) -^> Chim non (5h) -^> Dot pha (20h)
echo             -^> Noi bat (75h) -^> Nguoi tao xu huong (150h)
echo             -^> Tieu diem (300h) -^> Ngoi sao (500h)
echo             -^> Cam giac (1000h) -^> Nha tien tri (2000h)
echo             -^> Xuat than (5000+h)
echo.
echo ================================================================

"%NODE_CMD%" scripts/auto_stream_token.js %*

if %errorlevel% neq 0 (
    echo.
    echo [LOI] Tien trinh bi dung dot ngot. Nhan phim bat ky de thoat...
    pause >nul
)
