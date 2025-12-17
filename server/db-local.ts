import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "betfair.db");

export const sqliteDb = new Database(dbPath);

sqliteDb.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT,
    first_name TEXT,
    last_name TEXT,
    profile_image_url TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS betfair_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT UNIQUE NOT NULL,
    app_key TEXT,
    session_token TEXT,
    session_expiry TEXT,
    certificate TEXT,
    private_key TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    market_id TEXT NOT NULL,
    event_name TEXT NOT NULL,
    market_name TEXT NOT NULL,
    bet_type TEXT NOT NULL,
    selections TEXT NOT NULL,
    total_stake TEXT NOT NULL,
    total_liability TEXT,
    status TEXT DEFAULT 'pending',
    profit_loss TEXT,
    placed_at TEXT DEFAULT CURRENT_TIMESTAMP,
    settled_at TEXT
  );

  INSERT OR IGNORE INTO users (id, email, first_name, last_name) 
  VALUES ('local-user', 'local@localhost', 'Utente', 'Locale');
`);

export interface LocalUser {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  profile_image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface LocalBetfairSettings {
  id: number;
  user_id: string;
  app_key: string | null;
  session_token: string | null;
  session_expiry: string | null;
  certificate: string | null;
  private_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface LocalBet {
  id: number;
  user_id: string;
  market_id: string;
  event_name: string;
  market_name: string;
  bet_type: string;
  selections: string;
  total_stake: string;
  total_liability: string | null;
  status: string;
  profit_loss: string | null;
  placed_at: string;
  settled_at: string | null;
}

export class LocalStorage {
  getUser(id: string): LocalUser | undefined {
    const stmt = sqliteDb.prepare("SELECT * FROM users WHERE id = ?");
    return stmt.get(id) as LocalUser | undefined;
  }

  getBetfairSettings(userId: string): LocalBetfairSettings | undefined {
    const stmt = sqliteDb.prepare("SELECT * FROM betfair_settings WHERE user_id = ?");
    return stmt.get(userId) as LocalBetfairSettings | undefined;
  }

  updateBetfairCertificate(userId: string, appKey: string, certificate: string, privateKey: string): void {
    const existing = this.getBetfairSettings(userId);
    
    if (existing) {
      const stmt = sqliteDb.prepare(`
        UPDATE betfair_settings 
        SET app_key = ?, certificate = ?, private_key = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `);
      stmt.run(appKey, certificate, privateKey, userId);
    } else {
      const stmt = sqliteDb.prepare(`
        INSERT INTO betfair_settings (user_id, app_key, certificate, private_key)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(userId, appKey, certificate, privateKey);
    }
  }

  updateBetfairSession(userId: string, sessionToken: string | null, sessionExpiry: Date | null): void {
    const existing = this.getBetfairSettings(userId);
    const expiryStr = sessionExpiry ? sessionExpiry.toISOString() : null;
    
    if (existing) {
      const stmt = sqliteDb.prepare(`
        UPDATE betfair_settings 
        SET session_token = ?, session_expiry = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `);
      stmt.run(sessionToken, expiryStr, userId);
    } else {
      const stmt = sqliteDb.prepare(`
        INSERT INTO betfair_settings (user_id, session_token, session_expiry)
        VALUES (?, ?, ?)
      `);
      stmt.run(userId, sessionToken, expiryStr);
    }
  }

  createBet(bet: {
    userId: string;
    marketId: string;
    eventName: string;
    marketName: string;
    betType: string;
    selections: any[];
    totalStake: string;
    totalLiability?: string;
    status: string;
  }): LocalBet {
    const stmt = sqliteDb.prepare(`
      INSERT INTO bets (user_id, market_id, event_name, market_name, bet_type, selections, total_stake, total_liability, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      bet.userId,
      bet.marketId,
      bet.eventName,
      bet.marketName,
      bet.betType,
      JSON.stringify(bet.selections),
      bet.totalStake,
      bet.totalLiability || null,
      bet.status
    );
    
    return this.getBetById(result.lastInsertRowid as number)!;
  }

  getBets(userId: string): LocalBet[] {
    const stmt = sqliteDb.prepare("SELECT * FROM bets WHERE user_id = ? ORDER BY placed_at DESC");
    return stmt.all(userId) as LocalBet[];
  }

  getRecentBets(userId: string, limit = 10): LocalBet[] {
    const stmt = sqliteDb.prepare("SELECT * FROM bets WHERE user_id = ? ORDER BY placed_at DESC LIMIT ?");
    return stmt.all(userId, limit) as LocalBet[];
  }

  getBetById(id: number): LocalBet | undefined {
    const stmt = sqliteDb.prepare("SELECT * FROM bets WHERE id = ?");
    return stmt.get(id) as LocalBet | undefined;
  }
}

export const localStorage = new LocalStorage();
