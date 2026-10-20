@echo off
chcp 65001 >nul
title Lowkey Auto Game Time Badge (Cày Giờ Chơi)
color 0b

echo.
echo ===============================================================
echo     LOWKEY DISCORD AUTO GAME TIME BADGE (1-CLICK RUNNER)
echo   Tự động cày tích lũy giờ chơi cho Huy hiệu "Thời gian chơi"
echo ===============================================================
echo.

node "%~dp0run_game_time_cdp.js"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [LỖI] Quá trình chạy gặp lỗi.
    pause
)
