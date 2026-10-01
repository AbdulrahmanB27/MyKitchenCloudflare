@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo   MyKitchen - Android Setup ^& Dependency Installer
echo ========================================================
echo.
echo This script installs the required node_modules and syncs
echo the Capacitor Android project so Android Studio can build it.
echo.

echo [1/3] Installing dependencies (npm install)...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] 'npm install' failed. Please verify that Node.js is installed.
    echo Download Node.js from https://nodejs.org/ if needed.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/3] Building web assets (npm run build)...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] 'npm run build' failed.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [3/3] Syncing Capacitor Android project (npx cap sync android)...
call npx cap sync android
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Capacitor sync failed.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ========================================================
echo   SUCCESS! Everything is ready for Android Studio.
echo.
echo   NEXT STEPS:
echo   1. Open Android Studio
echo   2. Open the 'android' folder of this project
echo   3. Click 'Sync Project with Gradle Files'
echo   4. Connect your phone and click 'Run' (Green Play button)
echo ========================================================
echo.
pause
