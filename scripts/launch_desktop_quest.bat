@echo off
chcp 65001 >nul
title Discord Auto Quest - Lowkey Bot
color 0b
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

node scripts/autoQuestToken.js
