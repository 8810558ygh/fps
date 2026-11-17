@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo 未找到 Node.js，请先安装 Node.js 20 或更高版本。
    pause
    exit /b 1
)

if not exist "node_modules\ws\package.json" (
    echo 正在安装局域网服务器依赖...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo 依赖安装失败。
        pause
        exit /b 1
    )
)

echo 正在启动局域网服务器...
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:8090/"
node server/index.js

echo.
echo 服务器已停止。
pause
