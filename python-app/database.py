"""
Database layer using SQLite for local storage.
Stores Betfair credentials, certificates, and bet history.
"""

import sqlite3
import os
import json
from datetime import datetime
from pathlib import Path

def get_db_path():
    """Get database path in user's app data directory."""
    if os.name == 'nt':  # Windows
        app_data = os.environ.get('APPDATA', os.path.expanduser('~'))
        db_dir = os.path.join(app_data, 'BetfairDutching')
    else:  # Linux/Mac
        db_dir = os.path.join(os.path.expanduser('~'), '.betfair-dutching')
    
    os.makedirs(db_dir, exist_ok=True)
    return os.path.join(db_dir, 'betfair.db')

class Database:
    def __init__(self):
        self.db_path = get_db_path()
        self._init_db()
    
    def _init_db(self):
        """Initialize database tables."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY,
                username TEXT,
                app_key TEXT,
                certificate TEXT,
                private_key TEXT,
                session_token TEXT,
                session_expiry TEXT
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS bets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_name TEXT,
                market_id TEXT,
                market_name TEXT,
                bet_type TEXT,
                selections TEXT,
                total_stake REAL,
                potential_profit REAL,
                status TEXT,
                placed_at TEXT
            )
        ''')
        
        cursor.execute('SELECT COUNT(*) FROM settings')
        if cursor.fetchone()[0] == 0:
            cursor.execute('INSERT INTO settings (id) VALUES (1)')
        
        conn.commit()
        conn.close()
    
    def get_settings(self):
        """Get Betfair settings. Strips whitespace from string values."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM settings WHERE id = 1')
        row = cursor.fetchone()
        conn.close()
        if row:
            settings = dict(row)
            for key in ['username', 'app_key', 'certificate', 'private_key']:
                if settings.get(key) and isinstance(settings[key], str):
                    settings[key] = settings[key].strip()
            return settings
        return None
    
    def save_credentials(self, username, app_key, certificate, private_key):
        """Save Betfair credentials. Strips whitespace from username and app_key."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE settings SET 
                username = ?, app_key = ?, certificate = ?, private_key = ?
            WHERE id = 1
        ''', (
            username.strip() if username else username,
            app_key.strip() if app_key else app_key,
            certificate.strip() if certificate else certificate,
            private_key.strip() if private_key else private_key
        ))
        conn.commit()
        conn.close()
    
    def save_session(self, session_token, session_expiry):
        """Save session token."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE settings SET session_token = ?, session_expiry = ?
            WHERE id = 1
        ''', (session_token, session_expiry))
        conn.commit()
        conn.close()
    
    def clear_session(self):
        """Clear session token."""
        self.save_session(None, None)
    
    def save_bet(self, event_name, market_id, market_name, bet_type, 
                 selections, total_stake, potential_profit, status):
        """Save bet to history."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO bets 
            (event_name, market_id, market_name, bet_type, selections, 
             total_stake, potential_profit, status, placed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            event_name, market_id, market_name, bet_type,
            json.dumps(selections), total_stake, potential_profit, 
            status, datetime.now().isoformat()
        ))
        conn.commit()
        conn.close()
    
    def get_recent_bets(self, limit=50):
        """Get recent bets."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('''
            SELECT * FROM bets ORDER BY placed_at DESC LIMIT ?
        ''', (limit,))
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]
