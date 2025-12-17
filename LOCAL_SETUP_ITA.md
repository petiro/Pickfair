# Guida Installazione Locale - Betfair Dutching App

Questa guida ti spiega come far funzionare l'app sul tuo computer in Italia.

## Requisiti

1. **Node.js 20+** - Scarica da https://nodejs.org/
2. **PostgreSQL** - Scarica da https://www.postgresql.org/download/
3. **Git** (opzionale) - Per scaricare il codice

## Passaggio 1: Scarica il Codice

### Opzione A - Con Git:
```bash
git clone <URL_DEL_REPOSITORY>
cd betfair-dutching
```

### Opzione B - Senza Git:
Scarica il file ZIP da Replit e decomprimilo.

## Passaggio 2: Configura il Database

1. Installa PostgreSQL sul tuo computer
2. Crea un nuovo database:
```sql
CREATE DATABASE betfair_dutching;
```

3. Crea un file `.env` nella cartella principale con:
```
DATABASE_URL=postgresql://postgres:LA_TUA_PASSWORD@localhost:5432/betfair_dutching
SESSION_SECRET=una_stringa_segreta_qualsiasi_lunga_almeno_32_caratteri
```

## Passaggio 3: Installa le Dipendenze

Apri il terminale nella cartella del progetto e esegui:
```bash
npm install
```

## Passaggio 4: Inizializza il Database

```bash
npm run db:push
```

## Passaggio 5: Avvia l'App

```bash
npm run dev
```

L'app sarà disponibile su: http://localhost:5000

## Configurazione Betfair

1. Vai su http://localhost:5000/settings
2. Inserisci:
   - **App Key**: La tua Application Key di Betfair
   - **Certificato**: Il contenuto del file .crt
   - **Chiave Privata**: Il contenuto del file .key
3. Clicca "Salva Certificato"
4. Inserisci username e password Betfair
5. Clicca "Connetti"

## Risoluzione Problemi

### Errore "ECONNREFUSED"
- Verifica che PostgreSQL sia avviato
- Controlla che DATABASE_URL sia corretto

### Errore "relation does not exist"
- Esegui di nuovo: `npm run db:push`

### Errore porta 5000 già in uso
- Modifica la porta in `server/index.ts`
- Oppure chiudi l'altra applicazione che usa la porta 5000

## File Importanti

- `server/betfair.ts` - Client API Betfair
- `client/src/pages/settings.tsx` - Pagina configurazione
- `client/src/pages/dutching.tsx` - Calcolatore dutching
- `shared/schema.ts` - Schema database

## Note

- Le chiamate API partiranno dal tuo IP italiano
- La sessione Betfair scade dopo 20 minuti
- Stake minimo: 2.00 EUR
- Vincita massima: 10,000 EUR
