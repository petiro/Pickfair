========================================
  BETFAIR DUTCHING - RISULTATI ESATTI
========================================

Applicazione per scommesse dutching su Betfair Exchange Italia.
Mercato: Risultati Esatti (Correct Score)

----------------------------------------
REQUISITI
----------------------------------------

1. Account Betfair Italia (betfair.it)
2. App Key Betfair (da developer.betfair.com)
3. Certificato SSL per API Betfair
   - Segui la guida su: https://docs.developer.betfair.com/display/1smk3cen4v3lu3yomq5qye0ni/Non-Interactive+%28bot%29+login

----------------------------------------
COME USARE (senza installare)
----------------------------------------

1. Doppio click su AVVIA.bat
2. Dal menu File > Configura Credenziali
3. Inserisci:
   - Username Betfair
   - App Key
   - Certificato SSL (.pem)
   - Chiave Privata (.pem)
4. Clicca "Connetti" e inserisci la password
5. Seleziona una partita dalla lista
6. Clicca sui risultati che vuoi coprire
7. Imposta lo stake totale
8. Clicca "Piazza Scommesse"

----------------------------------------
COME CREARE L'EXE
----------------------------------------

1. Doppio click su BUILD.bat
2. Attendi la compilazione (~2-3 minuti)
3. Trovi BetfairDutching.exe in dist/

----------------------------------------
REGOLAMENTI ITALIA
----------------------------------------

- Puntata minima BACK: 2.00 EUR
- Vincita massima: 10.000 EUR per scommessa

----------------------------------------
DOVE VENGONO SALVATI I DATI
----------------------------------------

Windows: %APPDATA%\BetfairDutching\betfair.db

Il file contiene:
- Credenziali criptate
- Storico scommesse

----------------------------------------
SUPPORTO
----------------------------------------

Per problemi con l'API Betfair:
https://developer.betfair.com/support/

========================================
