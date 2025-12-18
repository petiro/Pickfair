"""
Betfair Dutching - Tutti i Mercati
Main application with Tkinter GUI for Windows desktop.
Supports all market types and Streaming API for real-time prices.
"""

import tkinter as tk
from tkinter import ttk, messagebox, filedialog, scrolledtext
import threading
import json
from datetime import datetime

from database import Database
from betfair_client import BetfairClient, MARKET_TYPES
from dutching import calculate_dutching_stakes, validate_selections, format_currency
from telegram_listener import TelegramListener, SignalQueue

APP_NAME = "Pickfair"
APP_VERSION = "3.0.0"
WINDOW_WIDTH = 1400
WINDOW_HEIGHT = 900
LIVE_REFRESH_INTERVAL = 5000  # 5 seconds for live odds


class PickfairApp:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title(f"{APP_NAME} v{APP_VERSION}")
        self.root.geometry(f"{WINDOW_WIDTH}x{WINDOW_HEIGHT}")
        self.root.minsize(1000, 700)
        
        try:
            self.root.iconbitmap("icon.ico")
        except:
            pass
        
        self.db = Database()
        self.client = None
        self.current_event = None
        self.current_market = None
        self.available_markets = []
        self.selected_runners = {}
        self.streaming_active = False
        self.live_mode = False
        self.live_refresh_id = None
        self.booking_monitor_id = None
        self.auto_cashout_monitor_id = None
        self.pending_bookings = []
        self.account_data = {'available': 0, 'exposure': 0, 'total': 0}
        self.telegram_listener = None
        self.telegram_signal_queue = SignalQueue()
        self.telegram_status = 'STOPPED'
        self.market_status = 'OPEN'
        
        self._create_menu()
        self._create_main_layout()
        self._load_settings()
        self._configure_styles()
        self._start_booking_monitor()
        self._start_auto_cashout_monitor()
    
    def _configure_styles(self):
        """Configure ttk styles with FairBot-like colors."""
        style = ttk.Style()
        style.theme_use('clam')
        
        style.configure('TFrame', background='#f5f5f5')
        style.configure('TLabel', background='#f5f5f5', font=('Segoe UI', 10))
        style.configure('TButton', font=('Segoe UI', 10))
        style.configure('Header.TLabel', font=('Segoe UI', 12, 'bold'))
        style.configure('Title.TLabel', font=('Segoe UI', 14, 'bold'))
        style.configure('Success.TLabel', foreground='green')
        style.configure('Error.TLabel', foreground='red')
        style.configure('Money.TLabel', font=('Segoe UI', 11, 'bold'), foreground='#1a73e8')
        style.configure('Stream.TLabel', font=('Segoe UI', 10, 'bold'), foreground='#e65100')
        
        # FairBot-style treeview with colored headers
        style.configure('Treeview', font=('Segoe UI', 9), rowheight=22)
        style.configure('Treeview.Heading', font=('Segoe UI', 9, 'bold'))
    
    def _create_menu(self):
        """Create application menu."""
        menubar = tk.Menu(self.root)
        self.root.config(menu=menubar)
        
        file_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="File", menu=file_menu)
        file_menu.add_command(label="Configura Credenziali", command=self._show_credentials_dialog)
        file_menu.add_separator()
        file_menu.add_command(label="Esci", command=self._on_close)
        
        telegram_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="Telegram", menu=telegram_menu)
        telegram_menu.add_command(label="Configura Telegram", command=self._show_telegram_settings)
        telegram_menu.add_command(label="Gestisci Chat", command=self._show_telegram_chats)
        telegram_menu.add_command(label="Segnali Ricevuti", command=self._show_telegram_signals)
        telegram_menu.add_separator()
        telegram_menu.add_command(label="Avvia Listener", command=self._start_telegram_listener)
        telegram_menu.add_command(label="Ferma Listener", command=self._stop_telegram_listener)
        
        help_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="Aiuto", menu=help_menu)
        help_menu.add_command(label="Informazioni", command=self._show_about)
        
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)
    
    def _on_close(self):
        """Handle window close."""
        if self.client:
            self.client.logout()
        self.root.destroy()
    
    def _create_main_layout(self):
        """Create main application layout."""
        self.main_frame = ttk.Frame(self.root, padding=10)
        self.main_frame.pack(fill=tk.BOTH, expand=True)
        
        self._create_status_bar()
        
        content_frame = ttk.Frame(self.main_frame)
        content_frame.pack(fill=tk.BOTH, expand=True, pady=10)
        
        self._create_events_panel(content_frame)
        self._create_market_panel(content_frame)
        self._create_dutching_panel(content_frame)
    
    def _create_status_bar(self):
        """Create status bar with connection info and mode buttons."""
        status_frame = ttk.Frame(self.main_frame)
        status_frame.pack(fill=tk.X, pady=(0, 10))
        
        self.status_label = ttk.Label(status_frame, text="Non connesso", style='Error.TLabel')
        self.status_label.pack(side=tk.LEFT)
        
        self.balance_label = ttk.Label(status_frame, text="", style='Money.TLabel')
        self.balance_label.pack(side=tk.LEFT, padx=20)
        
        self.stream_label = ttk.Label(status_frame, text="", style='Stream.TLabel')
        self.stream_label.pack(side=tk.LEFT, padx=10)
        
        self.connect_btn = ttk.Button(status_frame, text="Connetti", command=self._toggle_connection)
        self.connect_btn.pack(side=tk.RIGHT)
        
        self.refresh_btn = ttk.Button(status_frame, text="Aggiorna", command=self._refresh_data, state=tk.DISABLED)
        self.refresh_btn.pack(side=tk.RIGHT, padx=5)
        
        # Dashboard button
        self.dashboard_btn = tk.Button(status_frame, text="Dashboard", bg='#6c757d', fg='white',
                                       activebackground='#5a6268', command=self._show_dashboard)
        self.dashboard_btn.pack(side=tk.RIGHT, padx=5)
        
        # Live mode button
        self.live_btn = tk.Button(status_frame, text="LIVE", bg='#dc3545', fg='white',
                                  activebackground='#c82333', command=self._toggle_live_mode)
        self.live_btn.pack(side=tk.RIGHT, padx=5)
    
    def _create_events_panel(self, parent):
        """Create events list panel with country grouping."""
        events_frame = ttk.LabelFrame(parent, text="Partite", padding=10)
        events_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 5))
        
        search_frame = ttk.Frame(events_frame)
        search_frame.pack(fill=tk.X, pady=(0, 5))
        
        self.search_var = tk.StringVar()
        self.search_var.trace_add('write', self._filter_events)
        search_entry = ttk.Entry(search_frame, textvariable=self.search_var)
        search_entry.pack(fill=tk.X)
        
        # Hierarchical tree: Country -> Matches
        columns = ('name', 'date')
        self.events_tree = ttk.Treeview(events_frame, columns=columns, show='tree headings', height=20)
        self.events_tree.heading('#0', text='Nazione')
        self.events_tree.heading('name', text='Partita')
        self.events_tree.heading('date', text='Data')
        self.events_tree.column('#0', width=100)
        self.events_tree.column('name', width=180)
        self.events_tree.column('date', width=80)
        
        scrollbar = ttk.Scrollbar(events_frame, orient=tk.VERTICAL, command=self.events_tree.yview)
        self.events_tree.configure(yscrollcommand=scrollbar.set)
        
        self.events_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        self.events_tree.bind('<<TreeviewSelect>>', self._on_event_selected)
        
        self.all_events = []
        self.auto_refresh_id = None
    
    def _create_market_panel(self, parent):
        """Create market/runners panel with market type selector."""
        market_frame = ttk.LabelFrame(parent, text="Mercato", padding=10)
        market_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=5)
        
        header_frame = ttk.Frame(market_frame)
        header_frame.pack(fill=tk.X, pady=(0, 5))
        
        self.event_name_label = ttk.Label(header_frame, text="Seleziona una partita", style='Header.TLabel')
        self.event_name_label.pack(anchor=tk.W)
        
        selector_frame = ttk.Frame(market_frame)
        selector_frame.pack(fill=tk.X, pady=5)
        
        ttk.Label(selector_frame, text="Tipo Mercato:").pack(side=tk.LEFT)
        self.market_type_var = tk.StringVar()
        self.market_combo = ttk.Combobox(
            selector_frame, 
            textvariable=self.market_type_var, 
            state='readonly',
            width=30
        )
        self.market_combo.pack(side=tk.LEFT, padx=5)
        self.market_combo.bind('<<ComboboxSelected>>', self._on_market_type_selected)
        
        stream_frame = ttk.Frame(market_frame)
        stream_frame.pack(fill=tk.X, pady=5)
        
        self.stream_var = tk.BooleanVar(value=False)
        self.stream_check = ttk.Checkbutton(
            stream_frame, 
            text="Streaming Quote Live", 
            variable=self.stream_var,
            command=self._toggle_streaming
        )
        self.stream_check.pack(side=tk.LEFT)
        
        self.refresh_prices_btn = ttk.Button(
            stream_frame, 
            text="Aggiorna Quote", 
            command=self._refresh_prices,
            state=tk.DISABLED
        )
        self.refresh_prices_btn.pack(side=tk.LEFT, padx=10)
        
        # Dutching modal button
        self.dutch_modal_btn = tk.Button(
            stream_frame, 
            text="Dutching Avanzato", 
            bg='#17a2b8', fg='white',
            command=self._show_dutching_modal,
            state=tk.DISABLED
        )
        self.dutch_modal_btn.pack(side=tk.LEFT, padx=5)
        
        # Market status indicator
        self.market_status_label = tk.Label(
            stream_frame,
            text="",
            font=('Segoe UI', 9, 'bold'),
            padx=10
        )
        self.market_status_label.pack(side=tk.RIGHT, padx=10)
        
        columns = ('select', 'name', 'back', 'back_size', 'lay', 'lay_size')
        self.runners_tree = ttk.Treeview(market_frame, columns=columns, show='headings', height=18)
        self.runners_tree.heading('select', text='')
        self.runners_tree.heading('name', text='Selezione')
        self.runners_tree.heading('back', text='Back')
        self.runners_tree.heading('back_size', text='Disp.')
        self.runners_tree.heading('lay', text='Lay')
        self.runners_tree.heading('lay_size', text='Disp.')
        self.runners_tree.column('select', width=30)
        self.runners_tree.column('name', width=120)
        self.runners_tree.column('back', width=60)
        self.runners_tree.column('back_size', width=60)
        self.runners_tree.column('lay', width=60)
        self.runners_tree.column('lay_size', width=60)
        
        # Configure row tags for FairBot-style coloring
        self.runners_tree.tag_configure('runner_row', background='#e6f3ff')
        
        scrollbar = ttk.Scrollbar(market_frame, orient=tk.VERTICAL, command=self.runners_tree.yview)
        self.runners_tree.configure(yscrollcommand=scrollbar.set)
        
        self.runners_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        self.runners_tree.bind('<ButtonRelease-1>', self._on_runner_clicked)
        self.runners_tree.bind('<Button-3>', self._show_runner_context_menu)  # Right-click
        
        # Context menu for runners
        self.runner_context_menu = tk.Menu(self.root, tearoff=0)
        self.runner_context_menu.add_command(label="Prenota Scommessa", command=self._book_selected_runner)
        self.runner_context_menu.add_separator()
        self.runner_context_menu.add_command(label="Seleziona per Dutching", command=lambda: None)
    
    def _create_dutching_panel(self, parent):
        """Create dutching calculator panel."""
        dutch_frame = ttk.LabelFrame(parent, text="Calcolo Dutching", padding=10)
        dutch_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(5, 0))
        
        type_frame = ttk.Frame(dutch_frame)
        type_frame.pack(fill=tk.X, pady=5)
        
        ttk.Label(type_frame, text="Tipo:").pack(side=tk.LEFT)
        self.bet_type_var = tk.StringVar(value='BACK')
        
        # Blue button for BACK
        self.back_btn = tk.Button(type_frame, text="Back", bg='#3498db', fg='white',
                                  activebackground='#2980b9', activeforeground='white',
                                  relief='raised', bd=2, padx=10,
                                  command=lambda: self._set_bet_type('BACK'))
        self.back_btn.pack(side=tk.LEFT, padx=5)
        
        # Pink button for LAY (banca)
        self.lay_btn = tk.Button(type_frame, text="Lay", bg='#ffb6c1', fg='#333',
                                 activebackground='#ff69b4', activeforeground='white',
                                 relief='raised', bd=2, padx=10,
                                 command=lambda: self._set_bet_type('LAY'))
        self.lay_btn.pack(side=tk.LEFT)
        
        stake_frame = ttk.Frame(dutch_frame)
        stake_frame.pack(fill=tk.X, pady=5)
        
        ttk.Label(stake_frame, text="Stake Totale (EUR):").pack(side=tk.LEFT)
        self.stake_var = tk.StringVar(value='10.00')
        self.stake_var.trace_add('write', lambda *args: self._recalculate())
        stake_entry = ttk.Entry(stake_frame, textvariable=self.stake_var, width=10)
        stake_entry.pack(side=tk.LEFT, padx=5)
        
        ttk.Label(dutch_frame, text="Selezioni:", style='Header.TLabel').pack(anchor=tk.W, pady=(10, 5))
        
        self.selections_text = scrolledtext.ScrolledText(dutch_frame, height=10, width=30)
        self.selections_text.pack(fill=tk.BOTH, expand=True)
        self.selections_text.config(state=tk.DISABLED)
        
        summary_frame = ttk.Frame(dutch_frame)
        summary_frame.pack(fill=tk.X, pady=10)
        
        self.profit_label = ttk.Label(summary_frame, text="Profitto: -", style='Money.TLabel')
        self.profit_label.pack(anchor=tk.W)
        
        self.prob_label = ttk.Label(summary_frame, text="Probabilita Implicita: -")
        self.prob_label.pack(anchor=tk.W)
        
        btn_frame = ttk.Frame(dutch_frame)
        btn_frame.pack(fill=tk.X, pady=10)
        
        ttk.Button(btn_frame, text="Cancella Selezioni", command=self._clear_selections).pack(side=tk.LEFT)
        self.place_btn = ttk.Button(btn_frame, text="Piazza Scommesse", command=self._place_bets, state=tk.DISABLED)
        self.place_btn.pack(side=tk.RIGHT)
    
    def _load_settings(self):
        """Load saved settings."""
        settings = self.db.get_settings()
        if settings and settings.get('session_token'):
            self._try_restore_session(settings)
    
    def _try_restore_session(self, settings):
        """Try to restore previous session."""
        if not all([settings.get('username'), settings.get('app_key'), 
                   settings.get('certificate'), settings.get('private_key')]):
            return
        
        expiry = settings.get('session_expiry')
        if expiry:
            try:
                expiry_dt = datetime.fromisoformat(expiry)
                if datetime.now() < expiry_dt:
                    self.status_label.config(text="Sessione salvata (clicca Connetti)", style='TLabel')
            except:
                pass
    
    def _show_credentials_dialog(self):
        """Show credentials configuration dialog."""
        dialog = tk.Toplevel(self.root)
        dialog.title("Configura Credenziali Betfair")
        dialog.geometry("500x600")
        dialog.transient(self.root)
        dialog.grab_set()
        
        frame = ttk.Frame(dialog, padding=20)
        frame.pack(fill=tk.BOTH, expand=True)
        
        settings = self.db.get_settings() or {}
        
        ttk.Label(frame, text="Username Betfair:").pack(anchor=tk.W)
        username_var = tk.StringVar(value=settings.get('username', ''))
        ttk.Entry(frame, textvariable=username_var, width=50).pack(fill=tk.X, pady=(0, 10))
        
        ttk.Label(frame, text="App Key:").pack(anchor=tk.W)
        appkey_var = tk.StringVar(value=settings.get('app_key', ''))
        ttk.Entry(frame, textvariable=appkey_var, width=50).pack(fill=tk.X, pady=(0, 10))
        
        ttk.Label(frame, text="Certificato SSL (.pem):").pack(anchor=tk.W)
        cert_text = scrolledtext.ScrolledText(frame, height=6, width=50)
        cert_text.pack(fill=tk.X, pady=(0, 5))
        if settings.get('certificate'):
            cert_text.insert('1.0', settings['certificate'])
        
        def load_cert():
            path = filedialog.askopenfilename(filetypes=[
                ("Certificati", "*.pem *.crt *.cer"),
                ("PEM files", "*.pem"),
                ("CRT files", "*.crt"),
                ("All files", "*.*")
            ])
            if path:
                with open(path, 'r') as f:
                    cert_text.delete('1.0', tk.END)
                    cert_text.insert('1.0', f.read())
        
        ttk.Button(frame, text="Carica da file...", command=load_cert).pack(anchor=tk.W, pady=(0, 10))
        
        ttk.Label(frame, text="Chiave Privata (.key o .pem):").pack(anchor=tk.W)
        key_text = scrolledtext.ScrolledText(frame, height=6, width=50)
        key_text.pack(fill=tk.X, pady=(0, 5))
        if settings.get('private_key'):
            key_text.insert('1.0', settings['private_key'])
        
        def load_key():
            path = filedialog.askopenfilename(filetypes=[
                ("Chiavi private", "*.pem *.key"),
                ("PEM files", "*.pem"),
                ("KEY files", "*.key"),
                ("All files", "*.*")
            ])
            if path:
                with open(path, 'r') as f:
                    key_text.delete('1.0', tk.END)
                    key_text.insert('1.0', f.read())
        
        ttk.Button(frame, text="Carica da file...", command=load_key).pack(anchor=tk.W, pady=(0, 20))
        
        def save():
            self.db.save_credentials(
                username_var.get(),
                appkey_var.get(),
                cert_text.get('1.0', tk.END).strip(),
                key_text.get('1.0', tk.END).strip()
            )
            messagebox.showinfo("Salvato", "Credenziali salvate con successo!")
            dialog.destroy()
        
        ttk.Button(frame, text="Salva", command=save).pack(pady=10)
    
    def _toggle_connection(self):
        """Connect or disconnect from Betfair."""
        if self.client:
            self._disconnect()
        else:
            self._connect()
    
    def _connect(self):
        """Connect to Betfair."""
        settings = self.db.get_settings()
        
        if not all([settings.get('username'), settings.get('app_key'),
                   settings.get('certificate'), settings.get('private_key')]):
            messagebox.showerror("Errore", "Configura prima le credenziali dal menu File")
            return
        
        pwd_dialog = tk.Toplevel(self.root)
        pwd_dialog.title("Password Betfair")
        pwd_dialog.geometry("350x150")
        pwd_dialog.transient(self.root)
        pwd_dialog.grab_set()
        
        # Center dialog on screen
        pwd_dialog.update_idletasks()
        x = (pwd_dialog.winfo_screenwidth() // 2) - (175)
        y = (pwd_dialog.winfo_screenheight() // 2) - (75)
        pwd_dialog.geometry(f"350x150+{x}+{y}")
        
        frame = ttk.Frame(pwd_dialog, padding=20)
        frame.pack(fill=tk.BOTH, expand=True)
        
        ttk.Label(frame, text="Password Betfair:").pack(anchor=tk.W)
        pwd_var = tk.StringVar()
        pwd_entry = ttk.Entry(frame, textvariable=pwd_var, show='*')
        pwd_entry.pack(fill=tk.X, pady=5)
        pwd_entry.focus()
        
        def do_login():
            password = pwd_var.get()
            pwd_dialog.destroy()
            
            self.status_label.config(text="Connessione in corso...", style='TLabel')
            self.connect_btn.config(state=tk.DISABLED)
            
            def login_thread():
                try:
                    self.client = BetfairClient(
                        settings['username'],
                        settings['app_key'],
                        settings['certificate'],
                        settings['private_key']
                    )
                    result = self.client.login(password)
                    
                    self.db.save_session(result['session_token'], result['expiry'])
                    
                    self.root.after(0, self._on_connected)
                except Exception as e:
                    error_msg = str(e)
                    self.root.after(0, lambda msg=error_msg: self._on_connection_error(msg))
            
            threading.Thread(target=login_thread, daemon=True).start()
        
        pwd_entry.bind('<Return>', lambda e: do_login())
        ttk.Button(frame, text="Connetti", command=do_login).pack(pady=10)
    
    def _on_connected(self):
        """Handle successful connection."""
        self.status_label.config(text="Connesso a Betfair Italia", style='Success.TLabel')
        self.connect_btn.config(text="Disconnetti", state=tk.NORMAL)
        self.refresh_btn.config(state=tk.NORMAL)
        
        self._update_balance()
        self._load_events()
        self._start_auto_refresh()
    
    def _on_connection_error(self, error):
        """Handle connection error."""
        self.status_label.config(text=f"Errore: {error}", style='Error.TLabel')
        self.connect_btn.config(text="Connetti", state=tk.NORMAL)
        self.client = None
        messagebox.showerror("Errore Connessione", error)
    
    def _start_auto_refresh(self):
        """Start auto-refresh every 30 seconds."""
        self._stop_auto_refresh()  # Cancel any existing
        
        def refresh():
            if self.client:
                self._load_events()
                self.auto_refresh_id = self.root.after(30000, refresh)
        
        self.auto_refresh_id = self.root.after(30000, refresh)
    
    def _stop_auto_refresh(self):
        """Stop auto-refresh timer."""
        if hasattr(self, 'auto_refresh_id') and self.auto_refresh_id:
            self.root.after_cancel(self.auto_refresh_id)
            self.auto_refresh_id = None
    
    def _disconnect(self):
        """Disconnect from Betfair."""
        self._stop_auto_refresh()
        
        if self.client:
            self.client.logout()
            self.client = None
        
        self.db.clear_session()
        self.status_label.config(text="Non connesso", style='Error.TLabel')
        self.stream_label.config(text="")
        self.connect_btn.config(text="Connetti")
        self.refresh_btn.config(state=tk.DISABLED)
        self.balance_label.config(text="")
        self.streaming_active = False
        self.stream_var.set(False)
        
        self.events_tree.delete(*self.events_tree.get_children())
        self.runners_tree.delete(*self.runners_tree.get_children())
        self.market_combo['values'] = []
        self._clear_selections()
    
    def _update_balance(self):
        """Update account balance display."""
        def fetch():
            try:
                funds = self.client.get_account_funds()
                self.root.after(0, lambda: self.balance_label.config(
                    text=f"Saldo: {format_currency(funds['available'])}"
                ))
            except Exception as e:
                print(f"Error fetching balance: {e}")
        
        threading.Thread(target=fetch, daemon=True).start()
    
    def _load_events(self):
        """Load football events."""
        def fetch():
            try:
                events = self.client.get_football_events()
                self.root.after(0, lambda: self._display_events(events))
            except Exception as e:
                self.root.after(0, lambda: messagebox.showerror("Errore", f"Errore caricamento partite: {e}"))
        
        threading.Thread(target=fetch, daemon=True).start()
    
    def _display_events(self, events):
        """Display events in treeview grouped by country."""
        self.all_events = events
        self._populate_events_tree()
    
    def _populate_events_tree(self):
        """Populate events tree based on current search filter."""
        self.events_tree.delete(*self.events_tree.get_children())
        search = self.search_var.get().lower()
        
        if search:
            # Search mode - show flat list of matching events
            for event in self.all_events:
                if search in event['name'].lower():
                    date_str = self._format_event_date(event)
                    self.events_tree.insert('', tk.END, iid=event['id'], text=event.get('countryCode', ''), values=(
                        event['name'],
                        date_str
                    ))
        else:
            # No search - show grouped by country
            countries = {}
            for event in self.all_events:
                country = event.get('countryCode', 'XX') or 'XX'
                if country not in countries:
                    countries[country] = []
                countries[country].append(event)
            
            for country in sorted(countries.keys()):
                country_id = f"country_{country}"
                self.events_tree.insert('', tk.END, iid=country_id, text=country, open=False)
                
                for event in countries[country]:
                    date_str = self._format_event_date(event)
                    self.events_tree.insert(country_id, tk.END, iid=event['id'], values=(
                        event['name'],
                        date_str
                    ))
    
    def _format_event_date(self, event):
        """Format event date for display, with LIVE indicator for in-play events."""
        if event.get('inPlay'):
            return "LIVE"
        if event.get('openDate'):
            try:
                dt = datetime.fromisoformat(event['openDate'].replace('Z', '+00:00'))
                return dt.strftime('%d/%m %H:%M')
            except:
                return event['openDate'][:16]
        return ""
    
    def _filter_events(self, *args):
        """Filter events by search text."""
        self._populate_events_tree()
    
    def _refresh_data(self):
        """Refresh all data."""
        self._update_balance()
        self._load_events()
        if self.current_event:
            self._load_available_markets(self.current_event['id'])
    
    def _on_event_selected(self, event):
        """Handle event selection."""
        selection = self.events_tree.selection()
        if not selection:
            return
        
        event_id = selection[0]
        
        # Ignore country parent nodes (they start with "country_")
        if event_id.startswith('country_'):
            return
        
        for evt in self.all_events:
            if evt['id'] == event_id:
                self.current_event = evt
                self.event_name_label.config(text=evt['name'])
                break
        else:
            return  # Event not found
        
        self._stop_streaming()
        self._clear_selections()
        self._load_available_markets(event_id)
    
    def _load_available_markets(self, event_id):
        """Load all available markets for an event."""
        self.runners_tree.delete(*self.runners_tree.get_children())
        self.market_combo['values'] = []
        self.refresh_prices_btn.config(state=tk.DISABLED)
        
        def fetch():
            try:
                markets = self.client.get_available_markets(event_id)
                self.root.after(0, lambda: self._display_available_markets(markets))
            except Exception as e:
                self.root.after(0, lambda: messagebox.showerror("Errore", f"Errore caricamento mercati: {e}"))
        
        threading.Thread(target=fetch, daemon=True).start()
    
    def _display_available_markets(self, markets):
        """Display available markets in dropdown."""
        self.available_markets = markets
        
        if not markets:
            self.market_combo['values'] = ["Nessun mercato disponibile"]
            return
        
        display_names = []
        for m in markets:
            name = m.get('displayName') or m.get('marketName', 'Sconosciuto')
            if m.get('inPlay'):
                name = f"[LIVE] {name}"
            display_names.append(name)
        
        self.market_combo['values'] = display_names
        
        if display_names:
            self.market_combo.current(0)
            self._on_market_type_selected(None)
    
    def _on_market_type_selected(self, event):
        """Handle market type selection from dropdown."""
        selection = self.market_combo.current()
        if selection < 0 or selection >= len(self.available_markets):
            return
        
        market = self.available_markets[selection]
        self._stop_streaming()
        self._clear_selections()
        self._load_market(market['marketId'])
    
    def _load_market(self, market_id):
        """Load a specific market with prices."""
        self.runners_tree.delete(*self.runners_tree.get_children())
        
        def fetch():
            try:
                market = self.client.get_market_with_prices(market_id)
                self.root.after(0, lambda: self._display_market(market))
            except Exception as e:
                self.root.after(0, lambda: messagebox.showerror("Errore", f"Mercato non disponibile: {e}"))
        
        threading.Thread(target=fetch, daemon=True).start()
    
    def _display_market(self, market):
        """Display market runners."""
        self.current_market = market
        self.runners_tree.delete(*self.runners_tree.get_children())
        self.refresh_prices_btn.config(state=tk.NORMAL)
        
        # Update market status
        self.market_status = market.get('status', 'OPEN')
        is_inplay = market.get('inPlay', False)
        
        # Update status indicator
        if self.market_status == 'SUSPENDED':
            self.market_status_label.config(text="SOSPESO", bg='#dc3545', fg='white')
            self.dutch_modal_btn.config(state=tk.DISABLED)
            self.place_btn.config(state=tk.DISABLED)
        elif self.market_status == 'CLOSED':
            self.market_status_label.config(text="CHIUSO", bg='#6c757d', fg='white')
            self.dutch_modal_btn.config(state=tk.DISABLED)
            self.place_btn.config(state=tk.DISABLED)
        else:
            if is_inplay:
                self.market_status_label.config(text="LIVE - APERTO", bg='#28a745', fg='white')
            else:
                self.market_status_label.config(text="APERTO", bg='#28a745', fg='white')
            self.dutch_modal_btn.config(state=tk.NORMAL)
            # place_btn state is managed by calculate function
        
        for runner in market['runners']:
            back_price = f"{runner['backPrice']:.2f}" if runner.get('backPrice') else "-"
            lay_price = f"{runner['layPrice']:.2f}" if runner.get('layPrice') else "-"
            back_size = f"{runner['backSize']:.0f}" if runner.get('backSize') else "-"
            lay_size = f"{runner['laySize']:.0f}" if runner.get('laySize') else "-"
            
            self.runners_tree.insert('', tk.END, iid=str(runner['selectionId']), values=(
                '',
                runner['runnerName'],
                back_price,
                back_size,
                lay_price,
                lay_size
            ), tags=('runner_row',))
    
    def _refresh_prices(self):
        """Manually refresh prices for current market."""
        if not self.current_market:
            return
        
        self._load_market(self.current_market['marketId'])
    
    def _toggle_streaming(self):
        """Toggle streaming on/off."""
        if self.stream_var.get():
            self._start_streaming()
        else:
            self._stop_streaming()
    
    def _start_streaming(self):
        """Start streaming prices for current market."""
        if not self.client or not self.current_market:
            self.stream_var.set(False)
            return
        
        try:
            self.client.start_streaming(
                [self.current_market['marketId']],
                self._on_price_update
            )
            self.streaming_active = True
            self.stream_label.config(text="STREAMING ATTIVO")
        except Exception as e:
            self.stream_var.set(False)
            messagebox.showerror("Errore Streaming", str(e))
    
    def _stop_streaming(self):
        """Stop streaming."""
        if self.client:
            self.client.stop_streaming()
        self.streaming_active = False
        self.stream_var.set(False)
        self.stream_label.config(text="")
    
    def _on_price_update(self, market_id, runners_data):
        """Handle streaming price update."""
        if not self.current_market or market_id != self.current_market['marketId']:
            return
        
        def update_ui():
            for runner_update in runners_data:
                selection_id = str(runner_update['selectionId'])
                
                try:
                    item = self.runners_tree.item(selection_id)
                    if not item:
                        continue
                    
                    current_values = list(item['values'])
                    
                    back_prices = runner_update.get('backPrices', [])
                    lay_prices = runner_update.get('layPrices', [])
                    
                    if back_prices:
                        best_back = back_prices[0]
                        current_values[2] = f"{best_back[0]:.2f}"
                        current_values[3] = f"{best_back[1]:.0f}" if len(best_back) > 1 else "-"
                    
                    if lay_prices:
                        best_lay = lay_prices[0]
                        current_values[4] = f"{best_lay[0]:.2f}"
                        current_values[5] = f"{best_lay[1]:.0f}" if len(best_lay) > 1 else "-"
                    
                    self.runners_tree.item(selection_id, values=current_values)
                    
                    if selection_id in self.selected_runners:
                        if back_prices:
                            self.selected_runners[selection_id]['backPrice'] = back_prices[0][0]
                        if lay_prices:
                            self.selected_runners[selection_id]['layPrice'] = lay_prices[0][0]
                        # Update price based on current bet type
                        bet_type = self.bet_type_var.get()
                        if bet_type == 'BACK' and back_prices:
                            self.selected_runners[selection_id]['price'] = back_prices[0][0]
                        elif bet_type == 'LAY' and lay_prices:
                            self.selected_runners[selection_id]['price'] = lay_prices[0][0]
                        self._recalculate()
                        
                except Exception:
                    pass
        
        self.root.after(0, update_ui)
    
    def _show_runner_context_menu(self, event):
        """Show context menu on right-click."""
        item = self.runners_tree.identify_row(event.y)
        if item:
            self.runners_tree.selection_set(item)
            self._context_menu_selection = item
            self.runner_context_menu.post(event.x_root, event.y_root)
    
    def _book_selected_runner(self):
        """Book the selected runner from context menu."""
        if not hasattr(self, '_context_menu_selection') or not self._context_menu_selection:
            return
        
        selection_id = self._context_menu_selection
        if not self.current_market:
            return
        
        for runner in self.current_market['runners']:
            if str(runner['selectionId']) == selection_id:
                current_price = runner.get('backPrice') or runner.get('layPrice') or 0
                if current_price > 0:
                    self._show_booking_dialog(
                        selection_id,
                        runner['runnerName'],
                        current_price,
                        self.current_market['marketId']
                    )
                break
    
    def _on_runner_clicked(self, event):
        """Handle runner row click to toggle selection."""
        item = self.runners_tree.identify_row(event.y)
        if not item:
            return
        
        selection_id = item
        
        if selection_id in self.selected_runners:
            del self.selected_runners[selection_id]
            values = list(self.runners_tree.item(item)['values'])
            values[0] = ''
            self.runners_tree.item(item, values=values)
        else:
            if self.current_market:
                for runner in self.current_market['runners']:
                    if str(runner['selectionId']) == selection_id:
                        runner_data = runner.copy()
                        
                        # Get current prices from treeview
                        values = list(self.runners_tree.item(item)['values'])
                        # values: [selection, runnerName, backPrice, backSize, layPrice, laySize]
                        try:
                            back_price = float(str(values[2]).replace(',', '.')) if values[2] and values[2] != '-' else 0
                            lay_price = float(str(values[4]).replace(',', '.')) if values[4] and values[4] != '-' else 0
                        except (ValueError, IndexError):
                            back_price = 0
                            lay_price = 0
                        
                        runner_data['backPrice'] = back_price
                        runner_data['layPrice'] = lay_price
                        # Set 'price' based on current bet type for dutching calculation
                        bet_type = self.bet_type_var.get()
                        runner_data['price'] = back_price if bet_type == 'BACK' else lay_price
                        
                        self.selected_runners[selection_id] = runner_data
                        values[0] = 'X'
                        self.runners_tree.item(item, values=values)
                        break
        
        self._recalculate()
    
    def _set_bet_type(self, bet_type):
        """Set the bet type and update button colors."""
        self.bet_type_var.set(bet_type)
        
        if bet_type == 'BACK':
            # BACK selected - blue active, pink inactive for LAY
            self.back_btn.config(bg='#3498db', fg='white', relief='sunken')
            self.lay_btn.config(bg='#ffb6c1', fg='#333', relief='raised')
        else:
            # LAY selected - pink active, blue inactive for BACK
            self.back_btn.config(bg='#a8d4f0', fg='#333', relief='raised')
            self.lay_btn.config(bg='#ff69b4', fg='white', relief='sunken')
        
        self._recalculate()
    
    def _clear_selections(self):
        """Clear all selections."""
        self.selected_runners = {}
        
        for item in self.runners_tree.get_children():
            values = list(self.runners_tree.item(item)['values'])
            values[0] = ''
            self.runners_tree.item(item, values=values)
        
        self.selections_text.config(state=tk.NORMAL)
        self.selections_text.delete('1.0', tk.END)
        self.selections_text.config(state=tk.DISABLED)
        
        self.profit_label.config(text="Profitto: -")
        self.prob_label.config(text="Probabilita Implicita: -")
        self.place_btn.config(state=tk.DISABLED)
        self.calculated_results = None
    
    def _recalculate(self):
        """Recalculate dutching stakes."""
        if not self.selected_runners:
            self.selections_text.config(state=tk.NORMAL)
            self.selections_text.delete('1.0', tk.END)
            self.selections_text.config(state=tk.DISABLED)
            self.profit_label.config(text="Profitto: -")
            self.prob_label.config(text="Probabilita Implicita: -")
            self.place_btn.config(state=tk.DISABLED)
            return
        
        self.selections_text.config(state=tk.NORMAL)
        self.selections_text.delete('1.0', tk.END)
        
        try:
            total_stake = float(self.stake_var.get().replace(',', '.'))
        except ValueError:
            total_stake = 10.0
        
        bet_type = self.bet_type_var.get()
        
        # Update price for each selection based on current bet type
        for sel_id, sel in self.selected_runners.items():
            if bet_type == 'BACK':
                sel['price'] = sel.get('backPrice', 0)
            else:
                sel['price'] = sel.get('layPrice', 0)
        
        selections = list(self.selected_runners.values())
        
        try:
            results, profit, implied_prob = calculate_dutching_stakes(
                selections, total_stake, bet_type
            )
            
            text_lines = []
            for r in results:
                text_lines.append(f"{r['runnerName']}")
                text_lines.append(f"  Quota: {r['price']:.2f}")
                text_lines.append(f"  Stake: {format_currency(r['stake'])}")
                if bet_type == 'LAY':
                    text_lines.append(f"  Liability: {format_currency(r.get('liability', 0))}")
                    text_lines.append(f"  Se vince: {format_currency(r['profitIfWins'])}")
                else:
                    text_lines.append(f"  Profitto se vince: {format_currency(r['profitIfWins'])}")
                text_lines.append("")
            
            self.selections_text.insert('1.0', '\n'.join(text_lines))
            
            if bet_type == 'LAY' and results:
                # Show both best and worst case for LAY
                best = results[0].get('bestCase', profit)
                worst = results[0].get('worstCase', 0)
                self.profit_label.config(text=f"Profitto Max: {format_currency(best)} | Rischio: {format_currency(worst)}")
            else:
                self.profit_label.config(text=f"Profitto Atteso: {format_currency(profit)}")
            self.prob_label.config(text=f"Probabilita Implicita: {implied_prob:.1f}%")
            
            errors = validate_selections(results, bet_type)
            if not errors:
                self.place_btn.config(state=tk.NORMAL)
            else:
                self.place_btn.config(state=tk.DISABLED)
                self.selections_text.insert(tk.END, "\nErrori:\n" + "\n".join(errors))
            
            self.calculated_results = results
            
        except Exception as e:
            self.selections_text.insert('1.0', f"Errore calcolo: {e}")
            self.profit_label.config(text="Profitto: -")
            self.place_btn.config(state=tk.DISABLED)
        
        self.selections_text.config(state=tk.DISABLED)
    
    def _place_bets(self):
        """Place the calculated bets."""
        if not hasattr(self, 'calculated_results') or not self.calculated_results:
            return
        
        if not self.current_market:
            return
        
        # Check if market is suspended
        if self.market_status == 'SUSPENDED':
            messagebox.showwarning("Mercato Sospeso", 
                "Il mercato e' attualmente sospeso.\nAttendi che riapra per piazzare scommesse.")
            return
        
        if self.market_status == 'CLOSED':
            messagebox.showwarning("Mercato Chiuso", 
                "Il mercato e' chiuso. Non e' possibile piazzare scommesse.")
            return
        
        total_stake = sum(r['stake'] for r in self.calculated_results)
        msg = f"Confermi il piazzamento di {len(self.calculated_results)} scommesse?\n\n"
        msg += f"Stake Totale: {format_currency(total_stake)}"
        
        if not messagebox.askyesno("Conferma Scommesse", msg):
            return
        
        bet_type = self.bet_type_var.get()
        
        instructions = []
        for r in self.calculated_results:
            instructions.append({
                'selectionId': r['selectionId'],
                'side': bet_type,
                'price': r['price'],
                'size': r['stake']
            })
        
        self.place_btn.config(state=tk.DISABLED)
        
        def place():
            try:
                result = self.client.place_bets(self.current_market['marketId'], instructions)
                
                self.db.save_bet(
                    self.current_event['name'],
                    self.current_market['marketId'],
                    self.current_market['marketName'],
                    bet_type,
                    self.calculated_results,
                    total_stake,
                    self.calculated_results[0]['profitIfWins'],
                    result['status']
                )
                
                self.root.after(0, lambda: self._on_bets_placed(result))
            except Exception as e:
                self.root.after(0, lambda: self._on_bets_error(str(e)))
        
        threading.Thread(target=place, daemon=True).start()
    
    def _on_bets_placed(self, result):
        """Handle successful bet placement."""
        self.place_btn.config(state=tk.NORMAL)
        
        if result['status'] == 'SUCCESS':
            matched = sum(r.get('sizeMatched', 0) for r in result.get('instructionReports', []))
            messagebox.showinfo("Successo", f"Scommesse piazzate!\nImporto matchato: {format_currency(matched)}")
            self._update_balance()
            self._clear_selections()
        else:
            messagebox.showwarning("Attenzione", f"Stato: {result['status']}")
    
    def _on_bets_error(self, error):
        """Handle bet placement error."""
        self.place_btn.config(state=tk.NORMAL)
        messagebox.showerror("Errore", f"Errore piazzamento: {error}")
    
    def _show_about(self):
        """Show about dialog."""
        market_list = "\n".join([f"- {v}" for k, v in list(MARKET_TYPES.items())[:8]])
        messagebox.showinfo(
            "Informazioni",
            f"{APP_NAME}\n"
            f"Versione {APP_VERSION}\n\n"
            "Applicazione per dutching su Betfair Exchange Italia.\n\n"
            "Mercati supportati:\n"
            f"{market_list}\n"
            "...e altri\n\n"
            "Funzionalita:\n"
            "- Streaming quote in tempo reale\n"
            "- Calcolo automatico stake dutching\n"
            "- Dashboard con saldo e scommesse\n"
            "- Prenotazione quote\n"
            "- Cashout automatico\n\n"
            "Requisiti:\n"
            "- Account Betfair Italia\n"
            "- Certificato SSL per API\n"
            "- App Key Betfair"
        )
    
    def _toggle_live_mode(self):
        """Toggle live-only mode."""
        if not self.client:
            messagebox.showwarning("Attenzione", "Devi prima connetterti")
            return
        
        self.live_mode = not self.live_mode
        
        if self.live_mode:
            self.live_btn.config(bg='#28a745', text="LIVE ON")
            self._load_live_events()
            self._start_live_refresh()
        else:
            self.live_btn.config(bg='#dc3545', text="LIVE")
            self._stop_live_refresh()
            self._load_events()  # Load all events
    
    def _load_live_events(self):
        """Load only live/in-play events."""
        if not self.client:
            return
        
        def fetch():
            try:
                events = self.client.get_live_events_only()
                self.root.after(0, lambda: self._populate_events(events, live_only=True))
            except Exception as e:
                self.root.after(0, lambda: messagebox.showerror("Errore", str(e)))
        
        threading.Thread(target=fetch, daemon=True).start()
    
    def _start_live_refresh(self):
        """Start auto-refresh for live odds."""
        self._stop_live_refresh()  # Cancel any existing timer
        self._do_live_refresh()
    
    def _do_live_refresh(self):
        """Single live refresh cycle."""
        if not self.live_mode:
            return
        if self.current_market:
            self._refresh_prices()
        # Schedule next refresh
        self.live_refresh_id = self.root.after(LIVE_REFRESH_INTERVAL, self._do_live_refresh)
    
    def _stop_live_refresh(self):
        """Stop auto-refresh for live odds."""
        if self.live_refresh_id:
            self.root.after_cancel(self.live_refresh_id)
            self.live_refresh_id = None
    
    def _show_dashboard(self):
        """Show dashboard with account info and bets."""
        if not self.client:
            messagebox.showwarning("Attenzione", "Devi prima connetterti")
            return
        
        dialog = tk.Toplevel(self.root)
        dialog.title("Dashboard - Account Betfair Italy")
        dialog.geometry("800x700")
        dialog.transient(self.root)
        
        main_frame = ttk.Frame(dialog, padding=20)
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Header
        ttk.Label(main_frame, text="Panoramica del tuo account Betfair Italy", 
                 style='Title.TLabel').pack(anchor=tk.W, pady=(0, 20))
        
        # Stats cards frame
        stats_frame = ttk.Frame(main_frame)
        stats_frame.pack(fill=tk.X, pady=10)
        
        # Create stat cards
        def create_stat_card(parent, title, value, subtitle, col):
            card = ttk.LabelFrame(parent, text=title, padding=10)
            card.grid(row=0, column=col, padx=5, sticky='nsew')
            ttk.Label(card, text=value, style='Title.TLabel').pack()
            ttk.Label(card, text=subtitle, font=('Segoe UI', 8)).pack()
            return card
        
        # Fetch account data
        try:
            funds = self.client.get_account_funds()
            self.account_data = funds
        except:
            funds = self.account_data
        
        daily_pl = self.db.get_today_profit_loss()
        active_count = self.db.get_active_bets_count()
        
        create_stat_card(stats_frame, "Saldo Disponibile", 
                        f"{funds.get('available', 0):.2f} EUR", 
                        "Fondi disponibili per scommettere", 0)
        create_stat_card(stats_frame, "Esposizione", 
                        f"{abs(funds.get('exposure', 0)):.2f} EUR", 
                        "Responsabilita corrente", 1)
        pl_text = f"+{daily_pl:.2f}" if daily_pl >= 0 else f"{daily_pl:.2f}"
        create_stat_card(stats_frame, "P/L Oggi", 
                        f"{pl_text} EUR", 
                        "Profitto/Perdita giornaliero", 2)
        create_stat_card(stats_frame, "Scommesse Attive", 
                        str(active_count), 
                        "In attesa di risultato", 3)
        
        for i in range(4):
            stats_frame.columnconfigure(i, weight=1)
        
        # Refresh button
        def refresh_dashboard():
            try:
                funds = self.client.get_account_funds()
                self.account_data = funds
                dialog.destroy()
                self._show_dashboard()
            except Exception as e:
                messagebox.showerror("Errore", str(e))
        
        ttk.Button(main_frame, text="Aggiorna", command=refresh_dashboard).pack(anchor=tk.E, pady=10)
        
        # Notebook for different bet views
        notebook = ttk.Notebook(main_frame)
        notebook.pack(fill=tk.BOTH, expand=True, pady=10)
        
        # Recent bets tab
        recent_frame = ttk.Frame(notebook, padding=10)
        notebook.add(recent_frame, text="Scommesse Recenti")
        self._create_bets_list(recent_frame, self.db.get_recent_bets(20))
        
        # Current orders tab (matched/unmatched)
        orders_frame = ttk.Frame(notebook, padding=10)
        notebook.add(orders_frame, text="Ordini Correnti")
        self._create_current_orders_view(orders_frame)
        
        # Bookings tab
        bookings_frame = ttk.Frame(notebook, padding=10)
        notebook.add(bookings_frame, text="Prenotazioni")
        self._create_bookings_view(bookings_frame)
        
        # Cashout tab
        cashout_frame = ttk.Frame(notebook, padding=10)
        notebook.add(cashout_frame, text="Cashout")
        self._create_cashout_view(cashout_frame, dialog)
    
    def _create_bets_list(self, parent, bets):
        """Create a list view of bets."""
        columns = ('data', 'evento', 'mercato', 'tipo', 'stake', 'stato')
        tree = ttk.Treeview(parent, columns=columns, show='headings', height=12)
        tree.heading('data', text='Data')
        tree.heading('evento', text='Evento')
        tree.heading('mercato', text='Mercato')
        tree.heading('tipo', text='Tipo')
        tree.heading('stake', text='Stake')
        tree.heading('stato', text='Stato')
        tree.column('data', width=100)
        tree.column('evento', width=150)
        tree.column('mercato', width=120)
        tree.column('tipo', width=60)
        tree.column('stake', width=80)
        tree.column('stato', width=80)
        
        scrollbar = ttk.Scrollbar(parent, orient=tk.VERTICAL, command=tree.yview)
        tree.configure(yscrollcommand=scrollbar.set)
        
        tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        for bet in bets:
            placed_at = bet.get('placed_at', '')[:16] if bet.get('placed_at') else ''
            tree.insert('', tk.END, values=(
                placed_at,
                bet.get('event_name', '')[:25],
                bet.get('market_name', '')[:20],
                bet.get('side', bet.get('bet_type', '')),
                f"{bet.get('stake', bet.get('total_stake', 0)):.2f}",
                bet.get('status', '')
            ))
    
    def _create_current_orders_view(self, parent):
        """Create view for current orders from Betfair."""
        if not self.client:
            ttk.Label(parent, text="Non connesso").pack()
            return
        
        # Tabs for matched/unmatched
        sub_notebook = ttk.Notebook(parent)
        sub_notebook.pack(fill=tk.BOTH, expand=True)
        
        try:
            orders = self.client.get_current_orders()
        except:
            orders = {'matched': [], 'unmatched': [], 'partiallyMatched': []}
        
        # Matched
        matched_frame = ttk.Frame(sub_notebook, padding=5)
        sub_notebook.add(matched_frame, text=f"Abbinate ({len(orders['matched'])})")
        self._create_orders_list(matched_frame, orders['matched'])
        
        # Unmatched
        unmatched_frame = ttk.Frame(sub_notebook, padding=5)
        sub_notebook.add(unmatched_frame, text=f"Non Abbinate ({len(orders['unmatched'])})")
        self._create_orders_list(unmatched_frame, orders['unmatched'], show_cancel=True)
        
        # Partially matched
        partial_frame = ttk.Frame(sub_notebook, padding=5)
        sub_notebook.add(partial_frame, text=f"Parziali ({len(orders['partiallyMatched'])})")
        self._create_orders_list(partial_frame, orders['partiallyMatched'])
    
    def _create_orders_list(self, parent, orders, show_cancel=False):
        """Create list of orders."""
        columns = ('mercato', 'tipo', 'quota', 'stake', 'abbinato')
        tree = ttk.Treeview(parent, columns=columns, show='headings', height=8)
        tree.heading('mercato', text='Mercato')
        tree.heading('tipo', text='Tipo')
        tree.heading('quota', text='Quota')
        tree.heading('stake', text='Stake')
        tree.heading('abbinato', text='Abbinato')
        
        tree.pack(fill=tk.BOTH, expand=True)
        
        for order in orders:
            tree.insert('', tk.END, iid=order.get('betId'), values=(
                order.get('marketId', '')[:15],
                order.get('side', ''),
                f"{order.get('price', 0):.2f}",
                f"{order.get('size', 0):.2f}",
                f"{order.get('sizeMatched', 0):.2f}"
            ))
        
        if show_cancel and orders:
            def cancel_selected():
                selected = tree.selection()
                if selected and self.client:
                    for bet_id in selected:
                        item = tree.item(bet_id)
                        market_id = item['values'][0] if item['values'] else None
                        if market_id:
                            try:
                                self.client.cancel_orders(market_id, [bet_id])
                            except:
                                pass
                    messagebox.showinfo("Info", "Ordini cancellati")
            
            ttk.Button(parent, text="Cancella Selezionati", command=cancel_selected).pack(pady=5)
    
    def _create_bookings_view(self, parent):
        """Create view for bet bookings."""
        bookings = self.db.get_pending_bookings()
        
        columns = ('runner', 'quota_target', 'stake', 'tipo', 'stato')
        tree = ttk.Treeview(parent, columns=columns, show='headings', height=8)
        tree.heading('runner', text='Selezione')
        tree.heading('quota_target', text='Quota Target')
        tree.heading('stake', text='Stake')
        tree.heading('tipo', text='Tipo')
        tree.heading('stato', text='Stato')
        
        tree.pack(fill=tk.BOTH, expand=True)
        
        for booking in bookings:
            tree.insert('', tk.END, iid=str(booking['id']), values=(
                booking.get('runner_name', '')[:20],
                f"{booking.get('target_price', 0):.2f}",
                f"{booking.get('stake', 0):.2f}",
                booking.get('side', ''),
                booking.get('status', '')
            ))
        
        def cancel_booking():
            selected = tree.selection()
            for bid in selected:
                self.db.cancel_booking(int(bid))
            messagebox.showinfo("Info", "Prenotazioni cancellate")
            # Refresh
            for item in tree.get_children():
                tree.delete(item)
            for booking in self.db.get_pending_bookings():
                tree.insert('', tk.END, iid=str(booking['id']), values=(
                    booking.get('runner_name', '')[:20],
                    f"{booking.get('target_price', 0):.2f}",
                    f"{booking.get('stake', 0):.2f}",
                    booking.get('side', ''),
                    booking.get('status', '')
                ))
        
        ttk.Button(parent, text="Cancella Prenotazione", command=cancel_booking).pack(pady=5)
        ttk.Label(parent, text="Le prenotazioni verranno attivate quando la quota raggiunge il target").pack()
    
    def _create_cashout_view(self, parent, dialog):
        """Create cashout view with positions and cashout buttons."""
        if not self.client:
            ttk.Label(parent, text="Non connesso a Betfair").pack()
            return
        
        # Header
        ttk.Label(parent, text="Posizioni Aperte con Cashout", style='Title.TLabel').pack(anchor=tk.W, pady=(0, 10))
        
        # Positions list
        columns = ('mercato', 'selezione', 'tipo', 'quota', 'stake', 'p/l_attuale', 'azione')
        tree = ttk.Treeview(parent, columns=columns, show='headings', height=10)
        tree.heading('mercato', text='Mercato')
        tree.heading('selezione', text='Selezione')
        tree.heading('tipo', text='Tipo')
        tree.heading('quota', text='Quota')
        tree.heading('stake', text='Stake')
        tree.heading('p/l_attuale', text='P/L Attuale')
        tree.heading('azione', text='Azione')
        tree.column('mercato', width=100)
        tree.column('selezione', width=100)
        tree.column('tipo', width=50)
        tree.column('quota', width=60)
        tree.column('stake', width=60)
        tree.column('p/l_attuale', width=80)
        tree.column('azione', width=80)
        
        tree.pack(fill=tk.BOTH, expand=True)
        
        # Store position data for cashout
        positions_data = {}
        no_positions_label = [None]  # Use list to allow modification in nested function
        
        def load_positions():
            """Load matched orders and calculate P/L."""
            # Clear previous no-positions label if exists
            if no_positions_label[0]:
                no_positions_label[0].destroy()
                no_positions_label[0] = None
            
            try:
                orders = self.client.get_current_orders()
                matched = orders.get('matched', [])
                
                for item in tree.get_children():
                    tree.delete(item)
                positions_data.clear()
                
                for order in matched:
                    market_id = order.get('marketId')
                    selection_id = order.get('selectionId')
                    side = order.get('side')
                    price = order.get('price', 0)
                    stake = order.get('sizeMatched', 0)
                    
                    if stake > 0:
                        try:
                            cashout_info = self.client.calculate_cashout(
                                market_id, selection_id, side, stake, price
                            )
                            pl_display = f"{cashout_info['green_up']:+.2f}"
                            pl_color = 'green' if cashout_info['green_up'] > 0 else 'red'
                        except:
                            cashout_info = None
                            pl_display = "N/D"
                        
                        item_id = f"{order.get('betId')}"
                        tree.insert('', tk.END, iid=item_id, values=(
                            market_id[:12] if market_id else '',
                            order.get('runnerName', str(selection_id))[:15],
                            side,
                            f"{price:.2f}",
                            f"{stake:.2f}",
                            pl_display,
                            "Cashout"
                        ))
                        
                        positions_data[item_id] = {
                            'market_id': market_id,
                            'selection_id': selection_id,
                            'side': side,
                            'price': price,
                            'stake': stake,
                            'cashout_info': cashout_info
                        }
                
                if not positions_data:
                    no_positions_label[0] = ttk.Label(parent, text="Nessuna posizione aperta al momento", 
                             font=('Segoe UI', 10))
                    no_positions_label[0].pack(anchor=tk.W, pady=5)
                    cashout_btn.config(state='disabled')
                else:
                    cashout_btn.config(state='normal')
            except Exception as e:
                self.root.after(0, lambda: messagebox.showerror("Errore", f"Impossibile caricare posizioni: {e}"))
        
        def do_cashout():
            """Execute cashout for selected position."""
            selected = tree.selection()
            if not selected:
                messagebox.showwarning("Attenzione", "Seleziona una posizione")
                return
            
            for item_id in selected:
                pos = positions_data.get(item_id)
                if not pos or not pos.get('cashout_info'):
                    continue
                
                info = pos['cashout_info']
                confirm = messagebox.askyesno(
                    "Conferma Cashout",
                    f"Eseguire cashout?\n\n"
                    f"Tipo: {info['cashout_side']} @ {info['current_price']:.2f}\n"
                    f"Stake: {info['cashout_stake']:.2f}\n"
                    f"Profitto garantito: {info['green_up']:+.2f}"
                )
                
                if confirm:
                    try:
                        result = self.client.execute_cashout(
                            pos['market_id'],
                            pos['selection_id'],
                            info['cashout_side'],
                            info['cashout_stake'],
                            info['current_price']
                        )
                        
                        if result.get('status') == 'SUCCESS':
                            messagebox.showinfo("Successo", f"Cashout eseguito!\nProfitto bloccato: {info['green_up']:+.2f}")
                            load_positions()
                        else:
                            messagebox.showerror("Errore", f"Cashout fallito: {result.get('status')}")
                    except Exception as e:
                        messagebox.showerror("Errore", f"Errore cashout: {e}")
        
        # Buttons frame
        btn_frame = ttk.Frame(parent)
        btn_frame.pack(fill=tk.X, pady=10)
        
        ttk.Button(btn_frame, text="Aggiorna Posizioni", command=load_positions).pack(side=tk.LEFT, padx=5)
        
        cashout_btn = tk.Button(btn_frame, text="CASHOUT", bg='#28a745', fg='white', 
                               font=('Segoe UI', 10, 'bold'), command=do_cashout)
        cashout_btn.pack(side=tk.LEFT, padx=5)
        
        # Auto-cashout section
        auto_frame = ttk.LabelFrame(parent, text="Auto-Cashout", padding=10)
        auto_frame.pack(fill=tk.X, pady=10)
        
        ttk.Label(auto_frame, text="Target Profitto:").grid(row=0, column=0, padx=5)
        profit_target = ttk.Entry(auto_frame, width=10)
        profit_target.insert(0, "10.00")
        profit_target.grid(row=0, column=1, padx=5)
        
        ttk.Label(auto_frame, text="Limite Perdita:").grid(row=0, column=2, padx=5)
        loss_limit = ttk.Entry(auto_frame, width=10)
        loss_limit.insert(0, "-5.00")
        loss_limit.grid(row=0, column=3, padx=5)
        
        def set_auto_cashout():
            """Set auto-cashout rule for selected position."""
            selected = tree.selection()
            if not selected:
                messagebox.showwarning("Attenzione", "Seleziona una posizione")
                return
            
            try:
                target = float(profit_target.get())
                limit = float(loss_limit.get())
            except:
                messagebox.showerror("Errore", "Valori non validi")
                return
            
            for item_id in selected:
                pos = positions_data.get(item_id)
                if pos:
                    self.db.save_auto_cashout_rule(
                        pos['market_id'],
                        item_id,
                        target,
                        limit
                    )
            
            messagebox.showinfo("Info", "Auto-cashout impostato")
        
        ttk.Button(auto_frame, text="Imposta Auto-Cashout", command=set_auto_cashout).grid(row=0, column=4, padx=10)
        
        ttk.Label(parent, text="Auto-cashout esegue automaticamente quando P/L raggiunge target o limite",
                 font=('Segoe UI', 8)).pack(anchor=tk.W)
        
        # Load positions on view creation
        load_positions()
    
    def _start_booking_monitor(self):
        """Start monitoring bookings for price triggers."""
        self._do_booking_monitor()
    
    def _do_booking_monitor(self):
        """Single booking monitor cycle."""
        if self.client:
            bookings = self.db.get_pending_bookings()
            self.pending_bookings = bookings
            if bookings:
                # Run in background thread to avoid UI blocking
                threading.Thread(target=self._check_booking_triggers, args=(bookings,), daemon=True).start()
        # Schedule next check
        self.booking_monitor_id = self.root.after(10000, self._do_booking_monitor)
    
    def _check_booking_triggers(self, bookings):
        """Check if any booking should be triggered (runs in background thread)."""
        if not self.client:
            return
        
        # Group bookings by market to reduce API calls
        markets_to_check = {}
        for booking in bookings:
            mid = booking['market_id']
            if mid not in markets_to_check:
                markets_to_check[mid] = []
            markets_to_check[mid].append(booking)
        
        for market_id, market_bookings in markets_to_check.items():
            try:
                market = self.client.get_market_with_prices(market_id)
                
                for booking in market_bookings:
                    for runner in market['runners']:
                        if runner['selectionId'] == booking['selection_id']:
                            current_price = runner.get('backPrice') if booking['side'] == 'BACK' else runner.get('layPrice')
                            
                            should_trigger = False
                            if booking['side'] == 'BACK' and current_price and current_price >= booking['target_price']:
                                should_trigger = True
                            elif booking['side'] == 'LAY' and current_price and current_price <= booking['target_price']:
                                should_trigger = True
                            
                            if should_trigger:
                                result = self.client.place_bets(market_id, [{
                                    'selectionId': booking['selection_id'],
                                    'side': booking['side'],
                                    'price': current_price,
                                    'size': booking['stake']
                                }])
                                
                                if result.get('status') == 'SUCCESS':
                                    bet_id = result['instructionReports'][0].get('betId') if result.get('instructionReports') else None
                                    self.db.update_booking_status(booking['id'], 'TRIGGERED', bet_id)
                                else:
                                    self.db.update_booking_status(booking['id'], 'FAILED')
                            break
            except Exception:
                pass
    
    def _start_auto_cashout_monitor(self):
        """Start monitoring positions for auto-cashout triggers."""
        self._do_auto_cashout_monitor()
    
    def _do_auto_cashout_monitor(self):
        """Single auto-cashout monitor cycle."""
        if self.client:
            rules = self.db.get_active_auto_cashout_rules()
            if rules:
                threading.Thread(target=self._check_auto_cashout_triggers, args=(rules,), daemon=True).start()
        # Schedule next check every 15 seconds
        self.auto_cashout_monitor_id = self.root.after(15000, self._do_auto_cashout_monitor)
    
    def _check_auto_cashout_triggers(self, rules):
        """Check if any auto-cashout rule should be triggered."""
        if not self.client:
            return
        
        for rule in rules:
            try:
                market_id = rule['market_id']
                bet_id = rule['bet_id']
                profit_target = rule['profit_target']
                loss_limit = rule['loss_limit']
                
                # Get current orders to find the position
                orders = self.client.get_current_orders()
                matched = orders.get('matched', [])
                
                for order in matched:
                    if str(order.get('betId')) == str(bet_id):
                        selection_id = order.get('selectionId')
                        side = order.get('side')
                        price = order.get('price', 0)
                        stake = order.get('sizeMatched', 0)
                        
                        if stake > 0:
                            try:
                                cashout_info = self.client.calculate_cashout(
                                    market_id, selection_id, side, stake, price
                                )
                                current_pl = cashout_info['green_up']
                                
                                # Check if should trigger
                                should_trigger = False
                                trigger_reason = ""
                                
                                if current_pl >= profit_target:
                                    should_trigger = True
                                    trigger_reason = f"Target profitto raggiunto: {current_pl:+.2f}"
                                elif current_pl <= loss_limit:
                                    should_trigger = True
                                    trigger_reason = f"Limite perdita raggiunto: {current_pl:+.2f}"
                                
                                if should_trigger:
                                    # Execute cashout
                                    result = self.client.execute_cashout(
                                        market_id,
                                        selection_id,
                                        cashout_info['cashout_side'],
                                        cashout_info['cashout_stake'],
                                        cashout_info['current_price']
                                    )
                                    
                                    if result.get('status') == 'SUCCESS':
                                        self.db.deactivate_auto_cashout_rule(rule['id'])
                                        # Use root.after to safely show message from main thread
                                        def show_cashout_message(reason):
                                            messagebox.showinfo("Auto-Cashout", f"Cashout automatico eseguito!\n{reason}")
                                        self.root.after(0, lambda: show_cashout_message(trigger_reason))
                            except Exception:
                                pass
                        break
            except Exception:
                pass
    
    def _show_booking_dialog(self, selection_id, runner_name, current_price, market_id):
        """Show dialog to create a bet booking."""
        dialog = tk.Toplevel(self.root)
        dialog.title(f"Prenota Scommessa - {runner_name}")
        dialog.geometry("400x300")
        dialog.transient(self.root)
        dialog.grab_set()
        
        frame = ttk.Frame(dialog, padding=20)
        frame.pack(fill=tk.BOTH, expand=True)
        
        ttk.Label(frame, text=f"Selezione: {runner_name}", style='Header.TLabel').pack(anchor=tk.W)
        ttk.Label(frame, text=f"Quota Attuale: {current_price:.2f}").pack(anchor=tk.W, pady=5)
        
        ttk.Label(frame, text="Tipo:").pack(anchor=tk.W, pady=(10, 0))
        side_var = tk.StringVar(value='BACK')
        side_frame = ttk.Frame(frame)
        side_frame.pack(fill=tk.X)
        ttk.Radiobutton(side_frame, text="Back", variable=side_var, value='BACK').pack(side=tk.LEFT)
        ttk.Radiobutton(side_frame, text="Lay", variable=side_var, value='LAY').pack(side=tk.LEFT, padx=10)
        
        ttk.Label(frame, text="Quota Target:").pack(anchor=tk.W, pady=(10, 0))
        target_var = tk.StringVar(value=str(current_price + 0.25))
        ttk.Entry(frame, textvariable=target_var, width=10).pack(anchor=tk.W)
        
        ttk.Label(frame, text="Stake (EUR):").pack(anchor=tk.W, pady=(10, 0))
        stake_var = tk.StringVar(value='10.00')
        ttk.Entry(frame, textvariable=stake_var, width=10).pack(anchor=tk.W)
        
        def save_booking():
            try:
                target = float(target_var.get().replace(',', '.'))
                stake = float(stake_var.get().replace(',', '.'))
                
                if stake < 2.0 and side_var.get() == 'BACK':
                    messagebox.showerror("Errore", "Stake minimo BACK: 2.00 EUR")
                    return
                
                self.db.save_booking(
                    self.current_event['name'] if self.current_event else '',
                    market_id,
                    self.current_market['marketName'] if self.current_market else '',
                    int(selection_id),
                    runner_name,
                    side_var.get(),
                    target,
                    stake,
                    current_price
                )
                
                messagebox.showinfo("Successo", f"Prenotazione salvata!\nQuando la quota raggiunge {target:.2f}, la scommessa verra piazzata automaticamente.")
                dialog.destroy()
            except ValueError:
                messagebox.showerror("Errore", "Valori non validi")
        
        ttk.Button(frame, text="Prenota", command=save_booking).pack(pady=20)
    
    def _show_dutching_modal(self):
        """Show dutching modal for multiple selection with stake/profit options."""
        if not self.current_market:
            return
        
        dialog = tk.Toplevel(self.root)
        dialog.title(f"Dutching - {self.current_market.get('marketName', '')}")
        dialog.geometry("700x600")
        dialog.transient(self.root)
        
        frame = ttk.Frame(dialog, padding=20)
        frame.pack(fill=tk.BOTH, expand=True)
        
        # Bet type selection
        type_frame = ttk.Frame(frame)
        type_frame.pack(fill=tk.X, pady=10)
        
        modal_bet_type = tk.StringVar(value='BACK')
        
        back_btn = tk.Button(type_frame, text="Dutching BACK", bg='#3498db', fg='white',
                            command=lambda: modal_bet_type.set('BACK'))
        back_btn.pack(side=tk.LEFT, padx=5)
        
        lay_btn = tk.Button(type_frame, text="Dutching LAY", bg='#ffb6c1', fg='#333',
                           command=lambda: modal_bet_type.set('LAY'))
        lay_btn.pack(side=tk.LEFT, padx=5)
        
        # Selection mode
        mode_frame = ttk.Frame(frame)
        mode_frame.pack(fill=tk.X, pady=10)
        
        mode_var = tk.StringVar(value='STAKE')
        ttk.Radiobutton(mode_frame, text="Stake Fisso", variable=mode_var, value='STAKE').pack(side=tk.LEFT)
        ttk.Radiobutton(mode_frame, text="Profitto Target", variable=mode_var, value='PROFIT').pack(side=tk.LEFT, padx=10)
        
        # Amount entry
        amount_frame = ttk.Frame(frame)
        amount_frame.pack(fill=tk.X, pady=5)
        ttk.Label(amount_frame, text="Importo (EUR):").pack(side=tk.LEFT)
        amount_var = tk.StringVar(value='10.00')
        ttk.Entry(amount_frame, textvariable=amount_var, width=10).pack(side=tk.LEFT, padx=5)
        
        # Runners selection
        ttk.Label(frame, text="Seleziona Esiti:", style='Header.TLabel').pack(anchor=tk.W, pady=(10, 5))
        
        runners_frame = ttk.Frame(frame)
        runners_frame.pack(fill=tk.BOTH, expand=True)
        
        # Checkboxes for each runner
        runner_vars = {}
        canvas = tk.Canvas(runners_frame, height=300)
        scrollbar = ttk.Scrollbar(runners_frame, orient=tk.VERTICAL, command=canvas.yview)
        scrollable_frame = ttk.Frame(canvas)
        
        scrollable_frame.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        
        canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        for runner in self.current_market.get('runners', []):
            var = tk.BooleanVar(value=False)
            runner_vars[runner['selectionId']] = (var, runner)
            
            r_frame = ttk.Frame(scrollable_frame)
            r_frame.pack(fill=tk.X, pady=2)
            
            ttk.Checkbutton(r_frame, variable=var).pack(side=tk.LEFT)
            ttk.Label(r_frame, text=runner['runnerName'], width=20).pack(side=tk.LEFT)
            
            back_p = f"{runner.get('backPrice', 0):.2f}" if runner.get('backPrice') else '-'
            lay_p = f"{runner.get('layPrice', 0):.2f}" if runner.get('layPrice') else '-'
            ttk.Label(r_frame, text=f"Back: {back_p}", width=10).pack(side=tk.LEFT)
            ttk.Label(r_frame, text=f"Lay: {lay_p}", width=10).pack(side=tk.LEFT)
        
        # Calculate button
        result_text = scrolledtext.ScrolledText(frame, height=6, width=60)
        result_text.pack(fill=tk.X, pady=10)
        
        def calculate_modal():
            selections = []
            bet_type = modal_bet_type.get()
            
            for sel_id, (var, runner) in runner_vars.items():
                if var.get():
                    sel = runner.copy()
                    sel['price'] = runner.get('backPrice', 0) if bet_type == 'BACK' else runner.get('layPrice', 0)
                    if sel['price'] and sel['price'] > 1:
                        selections.append(sel)
            
            if not selections:
                result_text.delete('1.0', tk.END)
                result_text.insert('1.0', "Seleziona almeno un esito")
                return
            
            try:
                amount = float(amount_var.get().replace(',', '.'))
                results, profit, implied = calculate_dutching_stakes(selections, amount, bet_type)
                
                text = f"Tipo: {bet_type} | Profitto: {format_currency(profit)} | Prob: {implied:.1f}%\n\n"
                for r in results:
                    text += f"{r['runnerName']}: Stake {format_currency(r['stake'])} @ {r['price']:.2f}\n"
                
                result_text.delete('1.0', tk.END)
                result_text.insert('1.0', text)
                
                dialog.calculated_results = results
                dialog.bet_type = bet_type
            except Exception as e:
                result_text.delete('1.0', tk.END)
                result_text.insert('1.0', f"Errore: {e}")
        
        def place_modal_bets():
            if not hasattr(dialog, 'calculated_results'):
                return
            
            # Check if market is suspended
            if self.market_status == 'SUSPENDED':
                messagebox.showwarning("Mercato Sospeso", 
                    "Il mercato e' attualmente sospeso.\nAttendi che riapra per piazzare scommesse.")
                return
            
            if self.market_status == 'CLOSED':
                messagebox.showwarning("Mercato Chiuso", 
                    "Il mercato e' chiuso. Non e' possibile piazzare scommesse.")
                return
            
            if not messagebox.askyesno("Conferma", "Piazzare le scommesse?"):
                return
            
            bet_type = dialog.bet_type
            instructions = []
            for r in dialog.calculated_results:
                instructions.append({
                    'selectionId': r['selectionId'],
                    'side': bet_type,
                    'price': r['price'],
                    'size': r['stake']
                })
            
            try:
                result = self.client.place_bets(self.current_market['marketId'], instructions)
                if result['status'] == 'SUCCESS':
                    messagebox.showinfo("Successo", "Scommesse piazzate!")
                    dialog.destroy()
                else:
                    messagebox.showwarning("Attenzione", f"Stato: {result['status']}")
            except Exception as e:
                messagebox.showerror("Errore", str(e))
        
        btn_frame = ttk.Frame(frame)
        btn_frame.pack(fill=tk.X, pady=10)
        ttk.Button(btn_frame, text="Calcola", command=calculate_modal).pack(side=tk.LEFT, padx=5)
        ttk.Button(btn_frame, text="Piazza Scommesse", command=place_modal_bets).pack(side=tk.LEFT, padx=5)
        ttk.Button(btn_frame, text="Chiudi", command=dialog.destroy).pack(side=tk.RIGHT)
    
    def _show_telegram_settings(self):
        """Show Telegram configuration dialog."""
        dialog = tk.Toplevel(self.root)
        dialog.title("Configura Telegram")
        dialog.geometry("500x400")
        dialog.transient(self.root)
        dialog.grab_set()
        
        frame = ttk.Frame(dialog, padding=20)
        frame.pack(fill=tk.BOTH, expand=True)
        
        ttk.Label(frame, text="Configurazione Telegram", style='Title.TLabel').pack(anchor=tk.W, pady=(0, 20))
        
        ttk.Label(frame, text="Per ottenere API ID e Hash vai su my.telegram.org").pack(anchor=tk.W)
        
        settings = self.db.get_telegram_settings() or {}
        
        ttk.Label(frame, text="API ID:").pack(anchor=tk.W, pady=(10, 0))
        api_id_var = tk.StringVar(value=settings.get('api_id', ''))
        ttk.Entry(frame, textvariable=api_id_var, width=40).pack(anchor=tk.W)
        
        ttk.Label(frame, text="API Hash:").pack(anchor=tk.W, pady=(10, 0))
        api_hash_var = tk.StringVar(value=settings.get('api_hash', ''))
        ttk.Entry(frame, textvariable=api_hash_var, width=40).pack(anchor=tk.W)
        
        ttk.Label(frame, text="Numero di Telefono (con prefisso +39):").pack(anchor=tk.W, pady=(10, 0))
        phone_var = tk.StringVar(value=settings.get('phone_number', ''))
        ttk.Entry(frame, textvariable=phone_var, width=40).pack(anchor=tk.W)
        
        auto_bet_var = tk.BooleanVar(value=bool(settings.get('auto_bet', 0)))
        ttk.Checkbutton(frame, text="Piazza scommesse automaticamente", variable=auto_bet_var).pack(anchor=tk.W, pady=(10, 0))
        
        confirm_var = tk.BooleanVar(value=bool(settings.get('require_confirmation', 1)))
        ttk.Checkbutton(frame, text="Richiedi conferma prima di scommettere", variable=confirm_var).pack(anchor=tk.W)
        
        status_label = ttk.Label(frame, text=f"Stato: {self.telegram_status}")
        status_label.pack(anchor=tk.W, pady=10)
        
        def save_settings():
            self.db.save_telegram_settings(
                api_id=api_id_var.get(),
                api_hash=api_hash_var.get(),
                session_string=settings.get('session_string'),
                phone_number=phone_var.get(),
                enabled=True,
                auto_bet=auto_bet_var.get(),
                require_confirmation=confirm_var.get()
            )
            messagebox.showinfo("Salvato", "Impostazioni Telegram salvate")
            dialog.destroy()
        
        btn_frame = ttk.Frame(frame)
        btn_frame.pack(fill=tk.X, pady=20)
        ttk.Button(btn_frame, text="Salva", command=save_settings).pack(side=tk.LEFT, padx=5)
        ttk.Button(btn_frame, text="Chiudi", command=dialog.destroy).pack(side=tk.LEFT)
    
    def _show_telegram_chats(self):
        """Show dialog to manage monitored Telegram chats."""
        dialog = tk.Toplevel(self.root)
        dialog.title("Gestisci Chat Telegram")
        dialog.geometry("500x400")
        dialog.transient(self.root)
        
        frame = ttk.Frame(dialog, padding=20)
        frame.pack(fill=tk.BOTH, expand=True)
        
        ttk.Label(frame, text="Chat Monitorate", style='Title.TLabel').pack(anchor=tk.W)
        
        columns = ('chat_id', 'name', 'enabled')
        tree = ttk.Treeview(frame, columns=columns, show='headings', height=10)
        tree.heading('chat_id', text='Chat ID')
        tree.heading('name', text='Nome')
        tree.heading('enabled', text='Attivo')
        tree.pack(fill=tk.BOTH, expand=True, pady=10)
        
        chats = self.db.get_telegram_chats()
        for chat in chats:
            tree.insert('', tk.END, iid=str(chat['id']), values=(
                chat['chat_id'],
                chat.get('chat_name', ''),
                'Si' if chat.get('enabled') else 'No'
            ))
        
        add_frame = ttk.Frame(frame)
        add_frame.pack(fill=tk.X, pady=10)
        
        ttk.Label(add_frame, text="Aggiungi Chat ID:").pack(side=tk.LEFT)
        new_chat_var = tk.StringVar()
        ttk.Entry(add_frame, textvariable=new_chat_var, width=20).pack(side=tk.LEFT, padx=5)
        
        def add_chat():
            chat_id = new_chat_var.get().strip()
            if chat_id:
                self.db.add_telegram_chat(chat_id)
                tree.insert('', tk.END, values=(chat_id, '', 'Si'))
                new_chat_var.set('')
        
        def remove_chat():
            selected = tree.selection()
            for item in selected:
                values = tree.item(item)['values']
                if values:
                    self.db.remove_telegram_chat(values[0])
                    tree.delete(item)
        
        ttk.Button(add_frame, text="Aggiungi", command=add_chat).pack(side=tk.LEFT, padx=5)
        ttk.Button(add_frame, text="Rimuovi", command=remove_chat).pack(side=tk.LEFT)
        
        ttk.Label(frame, text="Suggerimento: Per trovare l'ID di un gruppo, inoltra un messaggio a @userinfobot").pack(anchor=tk.W)
    
    def _show_telegram_signals(self):
        """Show received Telegram signals."""
        dialog = tk.Toplevel(self.root)
        dialog.title("Segnali Telegram Ricevuti")
        dialog.geometry("700x500")
        dialog.transient(self.root)
        
        frame = ttk.Frame(dialog, padding=20)
        frame.pack(fill=tk.BOTH, expand=True)
        
        ttk.Label(frame, text="Segnali Ricevuti", style='Title.TLabel').pack(anchor=tk.W)
        
        columns = ('data', 'selezione', 'tipo', 'quota', 'stake', 'stato')
        tree = ttk.Treeview(frame, columns=columns, show='headings', height=15)
        tree.heading('data', text='Data')
        tree.heading('selezione', text='Selezione')
        tree.heading('tipo', text='Tipo')
        tree.heading('quota', text='Quota')
        tree.heading('stake', text='Stake')
        tree.heading('stato', text='Stato')
        tree.column('data', width=120)
        tree.column('selezione', width=100)
        tree.column('tipo', width=60)
        tree.column('quota', width=60)
        tree.column('stake', width=60)
        tree.column('stato', width=80)
        
        scrollbar = ttk.Scrollbar(frame, orient=tk.VERTICAL, command=tree.yview)
        tree.configure(yscrollcommand=scrollbar.set)
        tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, pady=10)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y, pady=10)
        
        signals = self.db.get_recent_signals(50)
        for sig in signals:
            tree.insert('', tk.END, iid=str(sig['id']), values=(
                sig.get('received_at', '')[:16] if sig.get('received_at') else '',
                sig.get('parsed_selection', ''),
                sig.get('parsed_side', ''),
                f"{sig.get('parsed_odds', 0):.2f}" if sig.get('parsed_odds') else '',
                f"{sig.get('parsed_stake', 0):.2f}" if sig.get('parsed_stake') else '',
                sig.get('status', '')
            ))
        
        def process_selected():
            selected = tree.selection()
            if not selected:
                return
            if not self.client:
                messagebox.showwarning("Attenzione", "Connettiti prima a Betfair")
                return
            messagebox.showinfo("Info", "Funzionalita in sviluppo: cerca mercato e piazza scommessa")
        
        btn_frame = ttk.Frame(frame)
        btn_frame.pack(fill=tk.X, pady=10)
        ttk.Button(btn_frame, text="Processa Selezionato", command=process_selected).pack(side=tk.LEFT)
    
    def _start_telegram_listener(self):
        """Start the Telegram listener."""
        settings = self.db.get_telegram_settings()
        if not settings or not settings.get('api_id') or not settings.get('api_hash'):
            messagebox.showwarning("Attenzione", "Configura prima le credenziali Telegram")
            return
        
        try:
            self.telegram_listener = TelegramListener(
                api_id=int(settings['api_id']),
                api_hash=settings['api_hash'],
                session_string=settings.get('session_string')
            )
            
            chats = self.db.get_telegram_chats()
            chat_ids = [int(c['chat_id']) for c in chats if c.get('enabled')]
            self.telegram_listener.set_monitored_chats(chat_ids)
            
            def on_signal(signal):
                self.telegram_signal_queue.add(signal)
                self.db.save_telegram_signal(
                    signal.get('chat_id', ''),
                    signal.get('sender_id', ''),
                    signal.get('raw_text', ''),
                    signal
                )
                self.root.after(0, lambda: self._notify_new_signal(signal))
            
            def on_status(status, message):
                self.telegram_status = status
                if status == 'AUTH_REQUIRED':
                    self.root.after(0, self._show_telegram_auth)
                elif status == 'CONNECTED':
                    self.root.after(0, lambda: messagebox.showinfo("Telegram", "Connesso a Telegram"))
            
            self.telegram_listener.set_callbacks(on_signal=on_signal, on_status=on_status)
            self.telegram_listener.start()
            
            self.telegram_status = 'STARTING'
            messagebox.showinfo("Telegram", "Listener Telegram avviato")
            
        except Exception as e:
            messagebox.showerror("Errore", f"Errore avvio Telegram: {e}")
    
    def _stop_telegram_listener(self):
        """Stop the Telegram listener."""
        if self.telegram_listener:
            self.telegram_listener.stop()
            self.telegram_listener = None
        self.telegram_status = 'STOPPED'
        messagebox.showinfo("Telegram", "Listener Telegram fermato")
    
    def _show_telegram_auth(self):
        """Show Telegram authentication dialog for entering code."""
        settings = self.db.get_telegram_settings()
        phone = settings.get('phone_number', '')
        
        dialog = tk.Toplevel(self.root)
        dialog.title("Autenticazione Telegram")
        dialog.geometry("400x200")
        dialog.transient(self.root)
        dialog.grab_set()
        
        frame = ttk.Frame(dialog, padding=20)
        frame.pack(fill=tk.BOTH, expand=True)
        
        ttk.Label(frame, text=f"Inserisci il codice inviato a {phone}").pack(pady=10)
        
        code_var = tk.StringVar()
        ttk.Entry(frame, textvariable=code_var, width=20).pack(pady=10)
        
        ttk.Label(frame, text="Password 2FA (se attiva):").pack()
        password_var = tk.StringVar()
        ttk.Entry(frame, textvariable=password_var, width=20, show='*').pack(pady=5)
        
        def submit_code():
            import asyncio
            
            async def do_auth():
                success, result = await self.telegram_listener.sign_in(
                    phone, code_var.get(), password_var.get() or None
                )
                if success:
                    self.db.save_telegram_session(result)
                    self.root.after(0, lambda: messagebox.showinfo("Successo", "Autenticazione completata"))
                    self.root.after(0, dialog.destroy)
                else:
                    self.root.after(0, lambda: messagebox.showerror("Errore", result))
            
            if self.telegram_listener and self.telegram_listener.loop:
                asyncio.run_coroutine_threadsafe(do_auth(), self.telegram_listener.loop)
        
        ttk.Button(frame, text="Conferma", command=submit_code).pack(pady=10)
    
    def _notify_new_signal(self, signal):
        """Notify user of new betting signal."""
        settings = self.db.get_telegram_settings() or {}
        
        msg = f"Nuovo segnale ricevuto:\n"
        msg += f"Tipo: {signal.get('side', 'N/A')}\n"
        msg += f"Selezione: {signal.get('selection', 'N/A')}\n"
        msg += f"Quota: {signal.get('odds', 'N/A')}\n"
        
        if settings.get('require_confirmation') or not settings.get('auto_bet'):
            messagebox.showinfo("Segnale Telegram", msg)
        else:
            pass
    
    def run(self):
        """Start the application."""
        self.root.mainloop()


def main():
    app = PickfairApp()
    app.run()


if __name__ == "__main__":
    main()
