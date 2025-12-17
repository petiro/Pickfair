"""
Betfair Dutching - Risultati Esatti
Main application with Tkinter GUI for Windows desktop.
"""

import tkinter as tk
from tkinter import ttk, messagebox, filedialog, scrolledtext
import threading
import json
from datetime import datetime

from database import Database
from betfair_client import BetfairClient
from dutching import calculate_dutching_stakes, validate_selections, format_currency

# App configuration
APP_NAME = "Betfair Dutching - Risultati Esatti"
APP_VERSION = "1.0.0"
WINDOW_WIDTH = 1200
WINDOW_HEIGHT = 800

class BetfairDutchingApp:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title(f"{APP_NAME} v{APP_VERSION}")
        self.root.geometry(f"{WINDOW_WIDTH}x{WINDOW_HEIGHT}")
        self.root.minsize(900, 600)
        
        # Set icon if available
        try:
            self.root.iconbitmap("icon.ico")
        except:
            pass
        
        # Initialize components
        self.db = Database()
        self.client = None
        self.current_event = None
        self.current_market = None
        self.selected_runners = {}  # {selection_id: runner_data}
        
        # Create UI
        self._create_menu()
        self._create_main_layout()
        self._load_settings()
        
        # Style configuration
        self._configure_styles()
    
    def _configure_styles(self):
        """Configure ttk styles."""
        style = ttk.Style()
        style.theme_use('clam')
        
        # Configure colors
        style.configure('TFrame', background='#f5f5f5')
        style.configure('TLabel', background='#f5f5f5', font=('Segoe UI', 10))
        style.configure('TButton', font=('Segoe UI', 10))
        style.configure('Header.TLabel', font=('Segoe UI', 12, 'bold'))
        style.configure('Title.TLabel', font=('Segoe UI', 14, 'bold'))
        style.configure('Success.TLabel', foreground='green')
        style.configure('Error.TLabel', foreground='red')
        style.configure('Money.TLabel', font=('Segoe UI', 11, 'bold'), foreground='#1a73e8')
    
    def _create_menu(self):
        """Create application menu."""
        menubar = tk.Menu(self.root)
        self.root.config(menu=menubar)
        
        # File menu
        file_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="File", menu=file_menu)
        file_menu.add_command(label="Configura Credenziali", command=self._show_credentials_dialog)
        file_menu.add_separator()
        file_menu.add_command(label="Esci", command=self.root.quit)
        
        # Help menu
        help_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="Aiuto", menu=help_menu)
        help_menu.add_command(label="Informazioni", command=self._show_about)
    
    def _create_main_layout(self):
        """Create main application layout."""
        # Main container
        self.main_frame = ttk.Frame(self.root, padding=10)
        self.main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Top bar - Connection status
        self._create_status_bar()
        
        # Content area with panels
        content_frame = ttk.Frame(self.main_frame)
        content_frame.pack(fill=tk.BOTH, expand=True, pady=10)
        
        # Left panel - Events list
        self._create_events_panel(content_frame)
        
        # Center panel - Market and runners
        self._create_market_panel(content_frame)
        
        # Right panel - Dutching calculator
        self._create_dutching_panel(content_frame)
    
    def _create_status_bar(self):
        """Create status bar with connection info."""
        status_frame = ttk.Frame(self.main_frame)
        status_frame.pack(fill=tk.X, pady=(0, 10))
        
        # Connection status
        self.status_label = ttk.Label(status_frame, text="Non connesso", style='Error.TLabel')
        self.status_label.pack(side=tk.LEFT)
        
        # Balance
        self.balance_label = ttk.Label(status_frame, text="", style='Money.TLabel')
        self.balance_label.pack(side=tk.LEFT, padx=20)
        
        # Connect/Disconnect button
        self.connect_btn = ttk.Button(status_frame, text="Connetti", command=self._toggle_connection)
        self.connect_btn.pack(side=tk.RIGHT)
        
        # Refresh button
        self.refresh_btn = ttk.Button(status_frame, text="Aggiorna", command=self._refresh_data, state=tk.DISABLED)
        self.refresh_btn.pack(side=tk.RIGHT, padx=5)
    
    def _create_events_panel(self, parent):
        """Create events list panel."""
        events_frame = ttk.LabelFrame(parent, text="Partite", padding=10)
        events_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 5))
        
        # Search
        search_frame = ttk.Frame(events_frame)
        search_frame.pack(fill=tk.X, pady=(0, 5))
        
        self.search_var = tk.StringVar()
        self.search_var.trace('w', self._filter_events)
        search_entry = ttk.Entry(search_frame, textvariable=self.search_var)
        search_entry.pack(fill=tk.X)
        
        # Events treeview
        columns = ('name', 'date', 'country')
        self.events_tree = ttk.Treeview(events_frame, columns=columns, show='headings', height=20)
        self.events_tree.heading('name', text='Partita')
        self.events_tree.heading('date', text='Data')
        self.events_tree.heading('country', text='Paese')
        self.events_tree.column('name', width=200)
        self.events_tree.column('date', width=100)
        self.events_tree.column('country', width=50)
        
        # Scrollbar
        scrollbar = ttk.Scrollbar(events_frame, orient=tk.VERTICAL, command=self.events_tree.yview)
        self.events_tree.configure(yscrollcommand=scrollbar.set)
        
        self.events_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Bind selection
        self.events_tree.bind('<<TreeviewSelect>>', self._on_event_selected)
        
        self.all_events = []
    
    def _create_market_panel(self, parent):
        """Create market/runners panel."""
        market_frame = ttk.LabelFrame(parent, text="Mercato Risultato Esatto", padding=10)
        market_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=5)
        
        # Event name
        self.event_name_label = ttk.Label(market_frame, text="Seleziona una partita", style='Header.TLabel')
        self.event_name_label.pack(anchor=tk.W, pady=(0, 10))
        
        # Runners treeview
        columns = ('select', 'name', 'back', 'lay')
        self.runners_tree = ttk.Treeview(market_frame, columns=columns, show='headings', height=20)
        self.runners_tree.heading('select', text='')
        self.runners_tree.heading('name', text='Risultato')
        self.runners_tree.heading('back', text='Back')
        self.runners_tree.heading('lay', text='Lay')
        self.runners_tree.column('select', width=30)
        self.runners_tree.column('name', width=100)
        self.runners_tree.column('back', width=60)
        self.runners_tree.column('lay', width=60)
        
        # Scrollbar
        scrollbar = ttk.Scrollbar(market_frame, orient=tk.VERTICAL, command=self.runners_tree.yview)
        self.runners_tree.configure(yscrollcommand=scrollbar.set)
        
        self.runners_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Bind click to toggle selection
        self.runners_tree.bind('<ButtonRelease-1>', self._on_runner_clicked)
    
    def _create_dutching_panel(self, parent):
        """Create dutching calculator panel."""
        dutch_frame = ttk.LabelFrame(parent, text="Calcolo Dutching", padding=10)
        dutch_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(5, 0))
        
        # Bet type
        type_frame = ttk.Frame(dutch_frame)
        type_frame.pack(fill=tk.X, pady=5)
        
        ttk.Label(type_frame, text="Tipo:").pack(side=tk.LEFT)
        self.bet_type_var = tk.StringVar(value='BACK')
        ttk.Radiobutton(type_frame, text="Back", variable=self.bet_type_var, value='BACK', 
                       command=self._recalculate).pack(side=tk.LEFT, padx=5)
        ttk.Radiobutton(type_frame, text="Lay", variable=self.bet_type_var, value='LAY',
                       command=self._recalculate).pack(side=tk.LEFT)
        
        # Total stake
        stake_frame = ttk.Frame(dutch_frame)
        stake_frame.pack(fill=tk.X, pady=5)
        
        ttk.Label(stake_frame, text="Stake Totale (EUR):").pack(side=tk.LEFT)
        self.stake_var = tk.StringVar(value='10.00')
        self.stake_var.trace('w', lambda *args: self._recalculate())
        stake_entry = ttk.Entry(stake_frame, textvariable=self.stake_var, width=10)
        stake_entry.pack(side=tk.LEFT, padx=5)
        
        # Selected runners
        ttk.Label(dutch_frame, text="Selezioni:", style='Header.TLabel').pack(anchor=tk.W, pady=(10, 5))
        
        self.selections_text = scrolledtext.ScrolledText(dutch_frame, height=10, width=30)
        self.selections_text.pack(fill=tk.BOTH, expand=True)
        self.selections_text.config(state=tk.DISABLED)
        
        # Summary
        summary_frame = ttk.Frame(dutch_frame)
        summary_frame.pack(fill=tk.X, pady=10)
        
        self.profit_label = ttk.Label(summary_frame, text="Profitto: -", style='Money.TLabel')
        self.profit_label.pack(anchor=tk.W)
        
        self.prob_label = ttk.Label(summary_frame, text="Probabilita Implicita: -")
        self.prob_label.pack(anchor=tk.W)
        
        # Buttons
        btn_frame = ttk.Frame(dutch_frame)
        btn_frame.pack(fill=tk.X, pady=10)
        
        ttk.Button(btn_frame, text="Cancella Selezioni", command=self._clear_selections).pack(side=tk.LEFT)
        self.place_btn = ttk.Button(btn_frame, text="Piazza Scommesse", command=self._place_bets, state=tk.DISABLED)
        self.place_btn.pack(side=tk.RIGHT)
    
    def _load_settings(self):
        """Load saved settings."""
        settings = self.db.get_settings()
        if settings and settings.get('session_token'):
            # Try to restore session
            self._try_restore_session(settings)
    
    def _try_restore_session(self, settings):
        """Try to restore previous session."""
        if not all([settings.get('username'), settings.get('app_key'), 
                   settings.get('certificate'), settings.get('private_key')]):
            return
        
        # Check if session is still valid
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
        
        # Username
        ttk.Label(frame, text="Username Betfair:").pack(anchor=tk.W)
        username_var = tk.StringVar(value=settings.get('username', ''))
        ttk.Entry(frame, textvariable=username_var, width=50).pack(fill=tk.X, pady=(0, 10))
        
        # App Key
        ttk.Label(frame, text="App Key:").pack(anchor=tk.W)
        appkey_var = tk.StringVar(value=settings.get('app_key', ''))
        ttk.Entry(frame, textvariable=appkey_var, width=50).pack(fill=tk.X, pady=(0, 10))
        
        # Certificate
        ttk.Label(frame, text="Certificato SSL (.pem):").pack(anchor=tk.W)
        cert_text = scrolledtext.ScrolledText(frame, height=6, width=50)
        cert_text.pack(fill=tk.X, pady=(0, 5))
        if settings.get('certificate'):
            cert_text.insert('1.0', settings['certificate'])
        
        def load_cert():
            path = filedialog.askopenfilename(filetypes=[("PEM files", "*.pem"), ("All files", "*.*")])
            if path:
                with open(path, 'r') as f:
                    cert_text.delete('1.0', tk.END)
                    cert_text.insert('1.0', f.read())
        
        ttk.Button(frame, text="Carica da file...", command=load_cert).pack(anchor=tk.W, pady=(0, 10))
        
        # Private Key
        ttk.Label(frame, text="Chiave Privata (.pem):").pack(anchor=tk.W)
        key_text = scrolledtext.ScrolledText(frame, height=6, width=50)
        key_text.pack(fill=tk.X, pady=(0, 5))
        if settings.get('private_key'):
            key_text.insert('1.0', settings['private_key'])
        
        def load_key():
            path = filedialog.askopenfilename(filetypes=[("PEM files", "*.pem"), ("All files", "*.*")])
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
        
        # Ask for password
        pwd_dialog = tk.Toplevel(self.root)
        pwd_dialog.title("Password Betfair")
        pwd_dialog.geometry("300x120")
        pwd_dialog.transient(self.root)
        pwd_dialog.grab_set()
        
        frame = ttk.Frame(pwd_dialog, padding=20)
        frame.pack(fill=tk.BOTH, expand=True)
        
        ttk.Label(frame, text="Password:").pack(anchor=tk.W)
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
                    
                    # Save session
                    self.db.save_session(result['session_token'], result['expiry'])
                    
                    # Update UI
                    self.root.after(0, self._on_connected)
                except Exception as e:
                    self.root.after(0, lambda: self._on_connection_error(str(e)))
            
            threading.Thread(target=login_thread, daemon=True).start()
        
        pwd_entry.bind('<Return>', lambda e: do_login())
        ttk.Button(frame, text="Connetti", command=do_login).pack(pady=10)
    
    def _on_connected(self):
        """Handle successful connection."""
        self.status_label.config(text="Connesso a Betfair Italia", style='Success.TLabel')
        self.connect_btn.config(text="Disconnetti", state=tk.NORMAL)
        self.refresh_btn.config(state=tk.NORMAL)
        
        # Get balance
        self._update_balance()
        
        # Load events
        self._load_events()
    
    def _on_connection_error(self, error):
        """Handle connection error."""
        self.status_label.config(text=f"Errore: {error}", style='Error.TLabel')
        self.connect_btn.config(text="Connetti", state=tk.NORMAL)
        self.client = None
        messagebox.showerror("Errore Connessione", error)
    
    def _disconnect(self):
        """Disconnect from Betfair."""
        if self.client:
            self.client.logout()
            self.client = None
        
        self.db.clear_session()
        self.status_label.config(text="Non connesso", style='Error.TLabel')
        self.connect_btn.config(text="Connetti")
        self.refresh_btn.config(state=tk.DISABLED)
        self.balance_label.config(text="")
        
        # Clear data
        self.events_tree.delete(*self.events_tree.get_children())
        self.runners_tree.delete(*self.runners_tree.get_children())
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
        """Display events in treeview."""
        self.all_events = events
        self.events_tree.delete(*self.events_tree.get_children())
        
        for event in events:
            date_str = ""
            if event.get('openDate'):
                try:
                    dt = datetime.fromisoformat(event['openDate'].replace('Z', '+00:00'))
                    date_str = dt.strftime('%d/%m %H:%M')
                except:
                    date_str = event['openDate'][:16]
            
            self.events_tree.insert('', tk.END, iid=event['id'], values=(
                event['name'],
                date_str,
                event.get('countryCode', '')
            ))
    
    def _filter_events(self, *args):
        """Filter events by search text."""
        search = self.search_var.get().lower()
        self.events_tree.delete(*self.events_tree.get_children())
        
        for event in self.all_events:
            if search in event['name'].lower():
                date_str = ""
                if event.get('openDate'):
                    try:
                        dt = datetime.fromisoformat(event['openDate'].replace('Z', '+00:00'))
                        date_str = dt.strftime('%d/%m %H:%M')
                    except:
                        pass
                
                self.events_tree.insert('', tk.END, iid=event['id'], values=(
                    event['name'],
                    date_str,
                    event.get('countryCode', '')
                ))
    
    def _refresh_data(self):
        """Refresh all data."""
        self._update_balance()
        self._load_events()
        if self.current_event:
            self._load_market(self.current_event['id'])
    
    def _on_event_selected(self, event):
        """Handle event selection."""
        selection = self.events_tree.selection()
        if not selection:
            return
        
        event_id = selection[0]
        
        # Find event in list
        for evt in self.all_events:
            if evt['id'] == event_id:
                self.current_event = evt
                self.event_name_label.config(text=evt['name'])
                break
        
        self._clear_selections()
        self._load_market(event_id)
    
    def _load_market(self, event_id):
        """Load correct score market for event."""
        self.runners_tree.delete(*self.runners_tree.get_children())
        
        def fetch():
            try:
                market = self.client.get_correct_score_market(event_id)
                self.root.after(0, lambda: self._display_market(market))
            except Exception as e:
                self.root.after(0, lambda: messagebox.showerror("Errore", f"Mercato non disponibile: {e}"))
        
        threading.Thread(target=fetch, daemon=True).start()
    
    def _display_market(self, market):
        """Display market runners."""
        self.current_market = market
        self.runners_tree.delete(*self.runners_tree.get_children())
        
        for runner in market['runners']:
            back_price = f"{runner['backPrice']:.2f}" if runner.get('backPrice') else "-"
            lay_price = f"{runner['layPrice']:.2f}" if runner.get('layPrice') else "-"
            
            self.runners_tree.insert('', tk.END, iid=str(runner['selectionId']), values=(
                '',  # Checkbox placeholder
                runner['runnerName'],
                back_price,
                lay_price
            ))
    
    def _on_runner_clicked(self, event):
        """Handle runner row click to toggle selection."""
        item = self.runners_tree.identify_row(event.y)
        if not item:
            return
        
        selection_id = int(item)
        
        if selection_id in self.selected_runners:
            # Deselect
            del self.selected_runners[selection_id]
            self.runners_tree.item(item, values=('', *self.runners_tree.item(item)['values'][1:]))
        else:
            # Select
            for runner in self.current_market['runners']:
                if runner['selectionId'] == selection_id:
                    bet_type = self.bet_type_var.get()
                    price = runner['backPrice'] if bet_type == 'BACK' else runner['layPrice']
                    
                    if not price:
                        messagebox.showwarning("Attenzione", f"Quota {bet_type} non disponibile")
                        return
                    
                    self.selected_runners[selection_id] = {
                        'selectionId': selection_id,
                        'runnerName': runner['runnerName'],
                        'price': price
                    }
                    self.runners_tree.item(item, values=('X', *self.runners_tree.item(item)['values'][1:]))
                    break
        
        self._recalculate()
    
    def _clear_selections(self):
        """Clear all selections."""
        self.selected_runners = {}
        
        # Update treeview
        for item in self.runners_tree.get_children():
            values = self.runners_tree.item(item)['values']
            self.runners_tree.item(item, values=('', *values[1:]))
        
        self._recalculate()
    
    def _recalculate(self):
        """Recalculate dutching stakes."""
        self.selections_text.config(state=tk.NORMAL)
        self.selections_text.delete('1.0', tk.END)
        
        if not self.selected_runners:
            self.profit_label.config(text="Profitto: -")
            self.prob_label.config(text="Probabilita Implicita: -")
            self.place_btn.config(state=tk.DISABLED)
            self.selections_text.config(state=tk.DISABLED)
            return
        
        try:
            total_stake = float(self.stake_var.get().replace(',', '.'))
        except ValueError:
            total_stake = 10.0
        
        bet_type = self.bet_type_var.get()
        selections = list(self.selected_runners.values())
        
        try:
            results, profit, implied_prob = calculate_dutching_stakes(
                selections, total_stake, bet_type
            )
            
            # Display results
            text_lines = []
            for r in results:
                text_lines.append(f"{r['runnerName']}")
                text_lines.append(f"  Quota: {r['price']:.2f}")
                text_lines.append(f"  Stake: {format_currency(r['stake'])}")
                text_lines.append(f"  Profitto se vince: {format_currency(r['profitIfWins'])}")
                text_lines.append("")
            
            self.selections_text.insert('1.0', '\n'.join(text_lines))
            
            # Update summary
            self.profit_label.config(text=f"Profitto Atteso: {format_currency(profit)}")
            self.prob_label.config(text=f"Probabilita Implicita: {implied_prob:.1f}%")
            
            # Enable place button if valid
            errors = validate_selections(results, bet_type)
            if not errors:
                self.place_btn.config(state=tk.NORMAL)
            else:
                self.place_btn.config(state=tk.DISABLED)
                self.selections_text.insert(tk.END, "\nErrori:\n" + "\n".join(errors))
            
            # Store calculated stakes for placement
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
        
        # Confirm
        total_stake = sum(r['stake'] for r in self.calculated_results)
        msg = f"Confermi il piazzamento di {len(self.calculated_results)} scommesse?\n\n"
        msg += f"Stake Totale: {format_currency(total_stake)}"
        
        if not messagebox.askyesno("Conferma Scommesse", msg):
            return
        
        bet_type = self.bet_type_var.get()
        
        # Build instructions
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
                
                # Save to database
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
        messagebox.showinfo(
            "Informazioni",
            f"{APP_NAME}\n"
            f"Versione {APP_VERSION}\n\n"
            "Applicazione per dutching su Betfair Exchange Italia.\n"
            "Mercato: Risultati Esatti (Correct Score)\n\n"
            "Requisiti:\n"
            "- Account Betfair Italia\n"
            "- Certificato SSL per API\n"
            "- App Key Betfair"
        )
    
    def run(self):
        """Start the application."""
        self.root.mainloop()


if __name__ == "__main__":
    app = BetfairDutchingApp()
    app.run()
