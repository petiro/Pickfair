# Betfair Dutching - Installazione Semplice

## Requisiti (una sola cosa da installare!)

**Node.js** - Scarica e installa da: https://nodejs.org/
- Clicca sul pulsante verde "LTS" (versione consigliata)
- Esegui il file scaricato e segui le istruzioni
- Riavvia il computer dopo l'installazione

---

## Come Avviare l'App

### Windows:
1. Doppio click su **AVVIA.bat**
2. Aspetta che si apra il browser
3. Fatto!

### Mac/Linux:
1. Apri il Terminale nella cartella dell'app
2. Esegui: `chmod +x AVVIA.sh && ./AVVIA.sh`
3. Aspetta che si apra il browser
4. Fatto!

---

## Prima Configurazione

1. L'app si apre su http://localhost:5000
2. Vai su **Impostazioni** (icona ingranaggio)
3. Inserisci:
   - **App Key**: La tua Application Key di Betfair
   - **Certificato (.crt)**: Contenuto del file certificato
   - **Chiave Privata (.key)**: Contenuto del file chiave
4. Clicca **Salva Certificato**
5. Inserisci **username** e **password** Betfair
6. Clicca **Connetti a Betfair**

---

## Utilizzo

- **Dashboard**: Panoramica saldo e scommesse recenti
- **Mercati**: Sfoglia partite e competizioni
- **Dutching**: Calcola e piazza scommesse sui risultati esatti
- **Storico**: Vedi tutte le scommesse piazzate

---

## Chiudere l'App

- Chiudi la finestra del terminale/prompt dei comandi
- Oppure premi **Ctrl+C** nel terminale

---

## Risoluzione Problemi

### "Node.js non trovato"
- Assicurati di aver installato Node.js da nodejs.org
- Riavvia il computer dopo l'installazione

### L'app non si apre nel browser
- Apri manualmente: http://localhost:5000

### Errore durante l'installazione dipendenze
- Verifica la connessione internet
- Riprova eseguendo AVVIA.bat

---

## File Importanti

- `AVVIA.bat` - Avvia l'app (Windows)
- `AVVIA.sh` - Avvia l'app (Mac/Linux)
- `client-2048.crt` - Certificato SSL
- `client-2048.key` - Chiave privata
- `data/` - Database locale (creato automaticamente)
