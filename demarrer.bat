@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ======================================
echo   DJ Carl Quiz — demarrage du serveur
echo ======================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js n'est pas installe.
  echo Telecharge-le sur https://nodejs.org puis relance ce script.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Premiere installation des dependances...
  call npm install
  if errorlevel 1 (
    echo.
    echo Erreur lors de npm install.
    pause
    exit /b 1
  )
  echo.
)

echo Serveur en cours de demarrage...
echo Ferme cette fenetre pour arreter le serveur.
echo.

node server.js

echo.
pause
