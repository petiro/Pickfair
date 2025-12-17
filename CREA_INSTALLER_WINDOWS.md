# Come Creare l'Installer Windows (.exe)

Questa guida spiega come creare un installer per Windows dal progetto.

## Prerequisiti

1. **Windows 10/11** con i seguenti requisiti:
   - Node.js v20+ installato (scarica da https://nodejs.org/)
   - Almeno 4GB di RAM libera
   - 2GB di spazio disco disponibile

## Passaggi

### Passo 1: Scarica il Progetto

1. In Replit, clicca sui **3 puntini (...)** nel pannello file
2. Seleziona **"Download as zip"**
3. Estrai lo ZIP in una cartella sul tuo PC (es. `C:\BetfairDutching\`)

### Passo 2: Avvia il Build

1. Apri la cartella dove hai estratto il progetto
2. Fai **doppio click** su `BUILD_WINDOWS.bat`
3. Aspetta che il processo finisca (5-10 minuti la prima volta)

### Passo 3: Trova l'Installer

1. Quando il build è completato, vai nella cartella `dist-electron\`
2. Troverai il file **"Betfair Dutching Setup X.X.X.exe"**
3. Questo è il tuo installer!

## Installazione

1. Fai doppio click su **"Betfair Dutching Setup X.X.X.exe"**
2. Segui le istruzioni dell'installer
3. L'app verrà installata e creerà un'icona sul desktop

## Primo Avvio

1. Avvia l'app dal desktop
2. Configura le credenziali Betfair:
   - Username
   - Password
   - Application Key
   - Certificato SSL (client-2048.crt)
   - Chiave Privata (client-2048.key)

## Troubleshooting

### "Node.js non trovato"
Installa Node.js da https://nodejs.org/ (versione LTS)

### Errore durante il build
Riprova eliminando la cartella `node_modules` e eseguendo di nuovo il build

### L'app non parte
Controlla che Windows Firewall non blocchi l'applicazione

## Alternativa: Esecuzione Senza Installer

Se preferisci non creare l'installer, puoi semplicemente:
1. Fai doppio click su `AVVIA.bat`
2. L'app si aprirà nel browser all'indirizzo http://localhost:5000
