@echo off
chcp 65001 >nul
title Discord Auto Quest - TOKEN BACKGROUND RUNNER (Video & Game)
color 0b
cd /d "%~dp0\.."

where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0c
    echo [ERROR] Node.js chua duoc cai dat hoac chua co trong PATH!
    echo Vui long cai dat Node.js tu https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo ================================================================
echo  LOWKEY DISCORD AUTO QUEST - TOKEN BACKGROUND RUNNER
echo  Tu dong lam tat ca nhiem vu (Game & Video) chay ngam 100%%
echo ================================================================
echo.
echo  Uu diem:
echo  * Khong can mo hay cai dat Discord Desktop
echo  * Chay ngam 100%% qua Discord API & Gateway
echo  * Tu dong lam ca nhiem vu Choi Game lan Xem Video
echo  * Tu dong nhan thuong (Claim ORBs)
echo.
echo ================================================================

node scripts/autoQuestToken.js %*

if %errorlevel% neq 0 (
    echo.
    echo [LỖI] Tien trinh bi dung dot ngot. Nhan phim bat ky de thoat...
    pause >nul
)
