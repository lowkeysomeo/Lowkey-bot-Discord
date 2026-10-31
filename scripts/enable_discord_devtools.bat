@echo off
chcp 65001 >nul
title Kich hoat DevTools cho Discord Desktop - Lowkey Bot
color 0a

echo ==============================================================
echo   KICH HOAT DEVTOOLS (Ctrl+Shift+I) CHO DISCORD DESKTOP
echo ==============================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$path = Join-Path $env:APPDATA 'discord\settings.json'; if (Test-Path $path) { $c = Get-Content $path -Raw | ConvertFrom-Json; $c | Add-Member -NotePropertyName 'DANGEROUS_ENABLE_DEVTOOLS_ONLY_ENABLE_IF_YOU_KNOW_WHAT_YOURE_DOING' -NotePropertyValue $true -Force; $c | ConvertTo-Json | Set-Content $path -Encoding UTF8; Write-Host '[THANH CONG] Da mo khoa DevTools cho Discord Desktop!' -ForegroundColor Green; Write-Host 'Vui long khoi dong lai Discord va bam Ctrl + Shift + I de mo DevTools.' -ForegroundColor Yellow; } else { Write-Host '[THONG BAO] Khong tim thay Discord Desktop tren may.' -ForegroundColor Red; }"

echo.
pause
