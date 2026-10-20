@echo off
chcp 65001 >nul
title Discord Auto Combo Badges (Game Time + Game Variety) - Lowkey Bot
color 0d
cd /d "%~dp0\.."

where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0c
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js from https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo.
echo ===============================================================
echo        LOWKEY DISCORD COMBO BADGES RUNNER (1-CLICK)
echo   Cay DONG THOI ca 2 Huy hieu: Thoi gian choi + 100 Game
echo ===============================================================
echo.

node scripts/run_game_combo_cdp.js

echo.
pause
