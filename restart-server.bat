@echo off
echo ========================================
echo Restarting server...
echo ========================================
echo.

ssh ssh.<YOUR_DOMAIN> "sudo /var/www/start-server.sh"

echo.
echo ========================================
echo Press any key to exit
echo ========================================
pause > nul
