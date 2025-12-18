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
                password TEXT,
                session_token TEXT,
                session_expiry TEXT
            )
        ''')
        
        # Add password column if it doesn't exist (for existing databases)
        try:
            cursor.execute('ALTER TABLE settings ADD COLUMN password TEXT')
        except sqlite3.OperationalError:
            pass  # Column already exists
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS bets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                bet_id TEXT,
                event_name TEXT,
                market_id TEXT,
                market_name TEXT,
                selection_id INTEGER,
                runner_name TEXT,
                bet_type TEXT,
                side TEXT,
                price REAL,
                stake REAL,
                liability REAL,
                matched_stake REAL DEFAULT 0,
                unmatched_stake REAL DEFAULT 0,
                average_price_matched REAL,
                potential_profit REAL,
                status TEXT,
                placed_at TEXT,
                settled_at TEXT,
                profit_loss REAL
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS bookings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_name TEXT,
                market_id TEXT,
                market_name TEXT,
                selection_id INTEGER,
                runner_name TEXT,
                side TEXT,
                target_price REAL,
                stake REAL,
                current_price REAL,
                status TEXT DEFAULT 'PENDING',
                created_at TEXT,
                triggered_at TEXT,
                bet_id TEXT
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS auto_cashout_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                market_id TEXT,
                bet_id TEXT,
                profit_target REAL,
                loss_limit REAL,
                status TEXT DEFAULT 'ACTIVE',
                created_at TEXT,
                triggered_at TEXT
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
    
    def save_password(self, password):
        """Save or clear password."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('UPDATE settings SET password = ? WHERE id = 1', (password,))
        conn.commit()
        conn.close()
    
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
    
    def save_bet_order(self, bet_id, event_name, market_id, market_name, selection_id,
                       runner_name, side, price, stake, liability, status, matched_stake=0,
                       unmatched_stake=0, average_price=None, potential_profit=None):
        """Save a bet order."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO bets 
            (bet_id, event_name, market_id, market_name, selection_id, runner_name,
             side, price, stake, liability, matched_stake, unmatched_stake,
             average_price_matched, potential_profit, status, placed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            bet_id, event_name, market_id, market_name, selection_id, runner_name,
            side, price, stake, liability, matched_stake, unmatched_stake,
            average_price, potential_profit, status, datetime.now().isoformat()
        ))
        conn.commit()
        conn.close()
    
    def update_bet_status(self, bet_id, status, matched_stake=None, unmatched_stake=None,
                          profit_loss=None, settled_at=None):
        """Update bet status."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        updates = ['status = ?']
        params = [status]
        if matched_stake is not None:
            updates.append('matched_stake = ?')
            params.append(matched_stake)
        if unmatched_stake is not None:
            updates.append('unmatched_stake = ?')
            params.append(unmatched_stake)
        if profit_loss is not None:
            updates.append('profit_loss = ?')
            params.append(profit_loss)
        if settled_at is not None:
            updates.append('settled_at = ?')
            params.append(settled_at)
        params.append(bet_id)
        cursor.execute(f'''
            UPDATE bets SET {', '.join(updates)} WHERE bet_id = ?
        ''', params)
        conn.commit()
        conn.close()
    
    def get_bets_by_status(self, status_list, limit=50):
        """Get bets by status list."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        placeholders = ','.join(['?' for _ in status_list])
        cursor.execute(f'''
            SELECT * FROM bets WHERE status IN ({placeholders})
            ORDER BY placed_at DESC LIMIT ?
        ''', status_list + [limit])
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]
    
    def get_today_profit_loss(self):
        """Get today's total profit/loss."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        today = datetime.now().strftime('%Y-%m-%d')
        cursor.execute('''
            SELECT COALESCE(SUM(profit_loss), 0) FROM bets 
            WHERE status = 'SETTLED' AND DATE(settled_at) = ?
        ''', (today,))
        result = cursor.fetchone()[0]
        conn.close()
        return result or 0.0
    
    def get_active_bets_count(self):
        """Get count of active/pending bets."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            SELECT COUNT(*) FROM bets WHERE status IN ('PENDING', 'MATCHED', 'PARTIALLY_MATCHED')
        ''')
        result = cursor.fetchone()[0]
        conn.close()
        return result
    
    def save_booking(self, event_name, market_id, market_name, selection_id,
                     runner_name, side, target_price, stake, current_price):
        """Save a bet booking."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO bookings 
            (event_name, market_id, market_name, selection_id, runner_name,
             side, target_price, stake, current_price, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
        ''', (
            event_name, market_id, market_name, selection_id, runner_name,
            side, target_price, stake, current_price, datetime.now().isoformat()
        ))
        booking_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return booking_id
    
    def get_pending_bookings(self):
        """Get all pending bookings."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('''
            SELECT * FROM bookings WHERE status = 'PENDING' ORDER BY created_at DESC
        ''')
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]
    
    def update_booking_status(self, booking_id, status, bet_id=None):
        """Update booking status."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        if bet_id:
            cursor.execute('''
                UPDATE bookings SET status = ?, triggered_at = ?, bet_id = ? WHERE id = ?
            ''', (status, datetime.now().isoformat(), bet_id, booking_id))
        else:
            cursor.execute('''
                UPDATE bookings SET status = ? WHERE id = ?
            ''', (status, booking_id))
        conn.commit()
        conn.close()
    
    def cancel_booking(self, booking_id):
        """Cancel a booking."""
        self.update_booking_status(booking_id, 'CANCELLED')
    
    def save_auto_cashout_rule(self, market_id, bet_id, profit_target, loss_limit):
        """Save auto-cashout rule."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO auto_cashout_rules 
            (market_id, bet_id, profit_target, loss_limit, status, created_at)
            VALUES (?, ?, ?, ?, 'ACTIVE', ?)
        ''', (market_id, bet_id, profit_target, loss_limit, datetime.now().isoformat()))
        rule_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return rule_id
    
    def get_active_auto_cashout_rules(self):
        """Get active auto-cashout rules."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('''
            SELECT * FROM auto_cashout_rules WHERE status = 'ACTIVE'
        ''')
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]
    
    def deactivate_auto_cashout_rule(self, rule_id):
        """Deactivate an auto-cashout rule."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE auto_cashout_rules SET status = 'TRIGGERED', triggered_at = ? WHERE id = ?
        ''', (datetime.now().isoformat(), rule_id))
        conn.commit()
        conn.close()
