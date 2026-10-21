@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
title Discord Auto Quest - TOKEN BACKGROUND RUNNER (Video and Game)
color 0b
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
echo  LOWKEY DISCORD AUTO QUEST - TOKEN BACKGROUND RUNNER
echo  Tu dong lam tat ca nhiem vu (Game va Video) chay ngam 100%%
echo ================================================================
echo.
echo  Uu diem:
echo  * Khong can mo hay cai dat Discord Desktop
echo  * Chay ngam 100%% qua Discord API va Gateway
echo  * Tu dong lam ca nhiem vu Choi Game lan Xem Video
echo  * Hoan thanh 100%% tien do (Tu Claim an toan tren Discord)
echo.
echo ================================================================

"%NODE_CMD%" scripts/autoQuestToken.js %*

if %errorlevel% neq 0 (
    echo.
    echo [LOI] Tien trinh bi dung dot ngot. Nhan phim bat ky de thoat...
    pause >nul
)
