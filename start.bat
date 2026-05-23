@echo off
cd /d "%~dp0"
title Academic Vocabulary Server

REM Node.js PATH (yangi o'rnatilgandan keyin ham ishlashi uchun)
if exist "%ProgramFiles%\nodejs\node.exe" (
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
)

where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo  ============================================
    echo   Node.js topilmadi
    echo  ============================================
    echo.
    echo  1-variant: install-node.bat faylini ishga tushiring
    echo  2-variant: https://nodejs.org dan LTS yuklab o'rnating
    echo.
    echo  O'rnatgandan keyin terminalni YOPING va qayta oching.
    echo.
    pause
    exit /b 1
)

echo Node: 
node -v
echo npm:
call npm -v
echo.

if not exist node_modules (
    echo Paketlar o'rnatilmoqda (npm install)...
    call npm install
    if errorlevel 1 (
        echo npm install xato berdi.
        pause
        exit /b 1
    )
)

echo.
echo Server: http://localhost:3000
echo To'xtatish: Ctrl+C
echo.
start "" "http://localhost:3000"
call npm start
