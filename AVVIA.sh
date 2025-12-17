#!/bin/bash

echo ""
echo "========================================"
echo "  BETFAIR DUTCHING - RISULTATI ESATTI"
echo "========================================"
echo ""
echo "Avvio dell'applicazione in corso..."
echo ""

# Controlla se Node.js e' installato
if ! command -v node &> /dev/null; then
    echo "ERRORE: Node.js non trovato!"
    echo ""
    echo "Per favore installa Node.js da:"
    echo "https://nodejs.org/"
    echo ""
    exit 1
fi

# Controlla se node_modules esiste
if [ ! -d "node_modules" ]; then
    echo "Installazione dipendenze..."
    echo "Questo potrebbe richiedere qualche minuto..."
    echo ""
    npm install
    if [ $? -ne 0 ]; then
        echo "ERRORE durante l'installazione delle dipendenze!"
        exit 1
    fi
    echo ""
    echo "Dipendenze installate!"
    echo ""
fi

# Crea cartella data se non esiste
mkdir -p data

echo "Avvio server..."
echo ""
echo "L'app sara' disponibile su: http://localhost:5000"
echo "Per chiudere, premi Ctrl+C"
echo ""

# Apri browser dopo 3 secondi (macOS/Linux)
(sleep 3 && (xdg-open http://localhost:5000 2>/dev/null || open http://localhost:5000 2>/dev/null)) &

# Avvia l'app
npx tsx server/index-local.ts
