@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
title Discord Auto Game Variety Badge - TOKEN RUNNER
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
        echo [ERROR] Node.js chua duoc cai dat! Tai tai: https://nodejs.org
        pause
        exit /b 1
    )
)

echo ================================================================
echo  LOWKEY DISCORD AUTO GAME VARIETY BADGE - TOKEN BACKGROUND
echo  Cay ngam huy hieu "Tro choi da dang" bang User Token 24/7
echo ================================================================
echo.
echo  HOW TO USE:
echo  1. Lay Discord User Token (F12 -^> Network -^> Authorization)
echo  2. Dan vao khi duoc hoi hoac truyen qua --token=...
echo  3. Bot se ket noi Gateway va cay ngam - TAT MAY van chay!
echo.
echo ================================================================

"%NODE_CMD%" scripts/auto_variety_token.js %*

if %errorlevel% neq 0 (
    echo.
    echo [LOI] Script bi dung dot ngot. Nhan phim bat ky de thoat...
    pause >nul
)
