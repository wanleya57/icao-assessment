@echo off
echo Killing old node processes...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul
echo Starting backend server...
cd /d <YOUR_PROJECT_PATH>\server
node app.js
pause
