@echo off
chcp 65001 >nul
title Discord Auto Quest & Săn Điểm ORB - Lowkey Bot
color 0b
cd /d "%~dp0\.."

echo ====================================================
echo  Khởi động Discord Auto Quest ^& Săn Điểm ORB...
echo ====================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0c
    echo [LỖI] Không tìm thấy Node.js trên máy tính của bạn!
    echo Vui lòng cài đặt Node.js từ https://nodejs.org để sử dụng.
    echo.
    pause
    exit /b 1
)

node scripts/autoQuestToken.js
