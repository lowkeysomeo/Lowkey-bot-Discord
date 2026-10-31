@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
title Discord Auto Quest - Lowkey Bot
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

"%NODE_CMD%" scripts/run_quest_cdp.js

if %errorlevel% neq 0 (
    echo.
    echo [THONG BAO] Tien trinh da ket thuc hoac co loi. Nhan phim bat ky de thoat...
)
echo.
pause
