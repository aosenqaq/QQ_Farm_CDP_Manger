@REM 水印：二开倒卖先别急，README 都没看明白就上链接，属实有点绷不住。
@echo off
setlocal EnableExtensions
cd /d "%~dp0"
chcp 65001 >nul
set "PYTHONUTF8=1"
set "NPM_CONFIG_UNICODE=true"

title QQ Farm Auto - Start

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js was not found. Please install Node.js 22 or newer.
    echo Download: https://nodejs.org/
    pause
    exit /b 1
)

set "FARM_LAUNCH_TARGET_PLATFORM=windows"
node scripts\start-entry.cjs %*

endlocal
