@echo off
setlocal
echo =========================================
echo  Pocket Money - Build Windows EXE
echo =========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js not found.
  echo Please install it from https://nodejs.org/ then re-run this script.
  pause & exit /b 1
)
echo Node.js found: & node --version

echo.
echo [1/3] Installing dependencies...
call npm install --legacy-peer-deps
if errorlevel 1 ( echo. & echo ERROR: npm install failed. & pause & exit /b 1 )

echo.
echo [2/3] Building React app...
call npm run build
if errorlevel 1 ( echo. & echo ERROR: Vite build failed. & pause & exit /b 1 )

echo.
echo [3/3] Packaging as Windows EXE (downloads Electron ~80MB on first run)...
call npx @electron/packager . "Pocket Money" --platform=win32 --arch=x64 --out=release --overwrite --icon=public/favicon.ico --ignore=node_modules/.bin --ignore=release --ignore=src --ignore=.lovable --ignore=.git
if errorlevel 1 (
  echo. & echo ERROR: Packaging failed. See output above.
  pause & exit /b 1
)

echo.
echo =========================================
echo  SUCCESS!
echo  Your app folder: release\Pocket Money-win32-x64\
echo  Run it with:     "Pocket Money.exe" inside that folder
echo =========================================
pause
