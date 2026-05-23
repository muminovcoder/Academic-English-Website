@echo off
cd /d "%~dp0"
title Node.js o'rnatish

echo Node.js LTS o'rnatilmoqda (winget)...
echo Administrator ruxsati so'ralishi mumkin.
echo.

winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements

if errorlevel 1 (
    echo.
    echo Winget ishlamadi. Qo'lda o'rnating:
    echo https://nodejs.org
    pause
    exit /b 1
)

echo.
echo Muvaffaqiyatli! Endi:
echo   1. Bu oynani yoping
echo   2. Cursor terminalini yoping va yangisini oching
echo   3. start.bat ni ishga tushiring
echo.
pause
