@echo off
title Betfair Dutching - Risultati Esatti
color 0A

echo.
echo ========================================
echo   BETFAIR DUTCHING - RISULTATI ESATTI
echo ========================================
echo.
echo Avvio dell'applicazione in corso...
echo.

REM Controlla se Node.js e' installato
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERRORE: Node.js non trovato!
    echo.
    echo Per favore installa Node.js da:
    echo https://nodejs.org/
    echo.
    echo Scarica la versione LTS e installala.
    echo Poi riavvia questo file.
    echo.
    pause
    exit /b 1
)

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

REM Crea cartella data se non esiste
if not exist "data" mkdir data

echo Avvio server...
echo.
echo L'app si aprira' automaticamente nel browser.
echo Per chiudere, premi Ctrl+C in questa finestra.
echo.

REM Avvia il browser dopo 3 secondi
start /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:5000"

REM Avvia l'app
call npx tsx server/index-local.ts
