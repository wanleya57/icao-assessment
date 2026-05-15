@echo off
echo ========================================
echo Restarting server...
echo ========================================
echo.

ssh ssh.fshd5u.cn "sudo /var/www/start-server.sh"

echo.
echo ========================================
echo Press any key to exit
echo ========================================
pause > nul
