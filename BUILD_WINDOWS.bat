@echo off
title Betfair Dutching - Build Windows Installer
color 0E

echo.
echo ========================================
echo   BETFAIR DUTCHING - BUILD INSTALLER
echo ========================================
echo.

REM Controlla se Node.js e' installato
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERRORE: Node.js non trovato!
    echo.
    echo Per favore installa Node.js da:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo Versione Node.js:
node --version
echo.

REM Controlla se node_modules esiste
if not exist "node_modules" (
    echo Installazione dipendenze...
    echo Questo potrebbe richiedere qualche minuto...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo ERRORE durante l'installazione delle dipendenze!
        pause
        exit /b 1
    )
    echo.
    echo Dipendenze installate!
    echo.
)

REM Crea cartelle se non esistono
if not exist "data" mkdir data
if not exist "build" mkdir build

echo.
echo [1/4] Building frontend...
call npx vite build --config vite.config.local.ts
if %errorlevel% neq 0 (
    echo ERRORE durante la build del frontend!
    echo.
    echo Prova con: npx vite build
    call npx vite build
    if %errorlevel% neq 0 (
        echo ERRORE critico durante la build!
        pause
        exit /b 1
    )
)

echo.
echo [2/4] Building server...
call npx tsx script/build-electron.ts
if %errorlevel% neq 0 (
    echo ERRORE durante la build del server!
    pause
    exit /b 1
)

echo.
echo [3/4] Rebuilding native modules for Electron...
call npx electron-rebuild -f -w better-sqlite3
if %errorlevel% neq 0 (
    echo AVVISO: Ricostruzione moduli nativi fallita, continuo...
)

echo.
echo [4/4] Building Electron installer...
call npx electron-builder --win --config electron-builder.json
if %errorlevel% neq 0 (
    echo ERRORE durante la build Electron!
    echo.
    echo Assicurati che:
    echo - Hai una connessione internet stabile
    echo - Hai abbastanza spazio disco
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   BUILD COMPLETATA CON SUCCESSO!
echo ========================================
echo.
echo L'installer si trova in:
echo   dist-electron\
echo.
echo Cerca il file:
echo   "Betfair Dutching Setup X.X.X.exe"
echo.
echo Doppio click sul file per installare l'app!
echo.
pause
