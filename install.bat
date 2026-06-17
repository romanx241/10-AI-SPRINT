@echo off
echo ========================================
echo  Установка зависимостей Continental HR
echo ========================================
echo.
cd /d "%~dp0"
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ОШИБКА] npm install завершился с ошибкой
    pause
    exit /b %ERRORLEVEL%
)
echo.
echo ========================================
echo  Установка завершена успешно!
echo  Запустите: npm run dev
echo ========================================
pause
