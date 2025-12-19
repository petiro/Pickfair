"""
Auto-Update System for Pickfair
Checks GitHub releases for new versions and allows one-click updates.
"""

import os
import sys
import json
import threading
import webbrowser
import tempfile
import subprocess
from urllib.request import urlopen, Request
from urllib.error import URLError

# Default configuration - Can be overridden via settings
DEFAULT_UPDATE_URL = ""  # Set your update URL here or configure in app settings


def parse_version(version_str):
    """Parse version string like '3.4.0' into tuple (3, 4, 0)."""
    try:
        # Remove 'v' prefix if present
        version_str = version_str.lstrip('v').strip()
        parts = version_str.split('.')
        return tuple(int(p) for p in parts[:3])
    except:
        return (0, 0, 0)


def compare_versions(current, latest):
    """Compare two version strings. Returns True if latest > current."""
    current_tuple = parse_version(current)
    latest_tuple = parse_version(latest)
    return latest_tuple > current_tuple


def check_for_updates(current_version, callback=None, update_url=None):
    """
    Check GitHub for new releases.
    
    Args:
        current_version: Current app version string (e.g., "3.4.0")
        callback: Function to call with result (update_available, version, download_url, release_notes)
        update_url: URL to check for updates (GitHub API releases/latest endpoint)
    
    Returns dict with update info or None if no update available.
    """
    check_url = update_url or DEFAULT_UPDATE_URL
    
    if not check_url:
        # No update URL configured
        if callback:
            callback({'update_available': False, 'error': 'No update URL configured'})
        return None
    
    def do_check():
        try:
            # Create request with User-Agent (required by GitHub API)
            req = Request(
                check_url,
                headers={'User-Agent': 'Pickfair-Updater/1.0'}
            )
            
            with urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode('utf-8'))
            
            latest_version = data.get('tag_name', '').lstrip('v')
            
            if compare_versions(current_version, latest_version):
                # Find the Windows executable asset
                download_url = None
                for asset in data.get('assets', []):
                    name = asset.get('name', '').lower()
                    if name.endswith('.exe') or name.endswith('.zip'):
                        download_url = asset.get('browser_download_url')
                        break
                
                # Fallback to release page if no direct download
                if not download_url:
                    download_url = data.get('html_url', '')
                
                result = {
                    'update_available': True,
                    'current_version': current_version,
                    'latest_version': latest_version,
                    'download_url': download_url,
                    'release_notes': data.get('body', ''),
                    'release_page': data.get('html_url', ''),
                    'published_at': data.get('published_at', '')
                }
                
                if callback:
                    callback(result)
                return result
            else:
                result = {'update_available': False}
                if callback:
                    callback(result)
                return result
                
        except URLError as e:
            print(f"Update check failed (network): {e}")
            if callback:
                callback({'update_available': False, 'error': str(e)})
            return None
        except Exception as e:
            print(f"Update check failed: {e}")
            if callback:
                callback({'update_available': False, 'error': str(e)})
            return None
    
    # Run in background thread to not block UI
    thread = threading.Thread(target=do_check, daemon=True)
    thread.start()


def open_download_page(url):
    """Open the download URL in the default browser."""
    webbrowser.open(url)


def download_update(download_url, progress_callback=None):
    """
    Download the update file.
    
    Args:
        download_url: URL to download from
        progress_callback: Function(bytes_downloaded, total_bytes) for progress
    
    Returns path to downloaded file or None on failure.
    """
    try:
        req = Request(
            download_url,
            headers={'User-Agent': 'Pickfair-Updater/1.0'}
        )
        
        with urlopen(req, timeout=60) as response:
            total_size = int(response.headers.get('content-length', 0))
            
            # Get filename from URL
            filename = download_url.split('/')[-1]
            download_path = os.path.join(tempfile.gettempdir(), filename)
            
            downloaded = 0
            chunk_size = 8192
            
            with open(download_path, 'wb') as f:
                while True:
                    chunk = response.read(chunk_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    
                    if progress_callback and total_size > 0:
                        progress_callback(downloaded, total_size)
            
            return download_path
            
    except Exception as e:
        print(f"Download failed: {e}")
        return None


def install_update(update_path):
    """
    Install the downloaded update.
    For .exe files, run installer. For .zip, extract and replace.
    """
    try:
        if update_path.endswith('.exe'):
            # Run the installer
            subprocess.Popen([update_path], shell=True)
            return True
        elif update_path.endswith('.zip'):
            # For zip files, open the folder (Windows-specific)
            folder = os.path.dirname(update_path)
            if sys.platform == 'win32':
                subprocess.run(['explorer', folder])
            return True
        else:
            # Open containing folder (Windows-specific)
            folder = os.path.dirname(update_path)
            if sys.platform == 'win32':
                subprocess.run(['explorer', folder])
            return True
    except Exception as e:
        print(f"Install failed: {e}")
        return False


class UpdateDialog:
    """Tkinter dialog for showing update notification."""
    
    def __init__(self, parent, update_info):
        import tkinter as tk
        from tkinter import ttk
        
        self.result = None
        self.update_info = update_info
        
        self.dialog = tk.Toplevel(parent)
        self.dialog.title("Aggiornamento Disponibile")
        self.dialog.geometry("450x350")
        self.dialog.transient(parent)
        self.dialog.grab_set()
        
        # Center on parent
        self.dialog.update_idletasks()
        x = parent.winfo_x() + (parent.winfo_width() - 450) // 2
        y = parent.winfo_y() + (parent.winfo_height() - 350) // 2
        self.dialog.geometry(f"+{x}+{y}")
        
        frame = ttk.Frame(self.dialog, padding=20)
        frame.pack(fill=tk.BOTH, expand=True)
        
        # Title
        title_label = ttk.Label(frame, text="Nuovo Aggiornamento!", 
                               font=('Segoe UI', 14, 'bold'))
        title_label.pack(pady=(0, 10))
        
        # Version info
        version_text = f"Versione attuale: {update_info['current_version']}\n"
        version_text += f"Nuova versione: {update_info['latest_version']}"
        version_label = ttk.Label(frame, text=version_text, font=('Segoe UI', 11))
        version_label.pack(pady=5)
        
        # Release notes
        notes_frame = ttk.LabelFrame(frame, text="Note di rilascio", padding=10)
        notes_frame.pack(fill=tk.BOTH, expand=True, pady=10)
        
        notes_text = tk.Text(notes_frame, wrap=tk.WORD, height=8, font=('Segoe UI', 9))
        notes_text.insert('1.0', update_info.get('release_notes', 'Nessuna nota disponibile'))
        notes_text.config(state=tk.DISABLED)
        notes_text.pack(fill=tk.BOTH, expand=True)
        
        # Buttons
        btn_frame = ttk.Frame(frame)
        btn_frame.pack(fill=tk.X, pady=(10, 0))
        
        download_btn = tk.Button(btn_frame, text="Scarica Aggiornamento", 
                                bg='#28a745', fg='white', font=('Segoe UI', 10, 'bold'),
                                command=self._download)
        download_btn.pack(side=tk.LEFT, padx=5)
        
        later_btn = ttk.Button(btn_frame, text="Ricordamelo Dopo", 
                              command=self._later)
        later_btn.pack(side=tk.LEFT, padx=5)
        
        skip_btn = ttk.Button(btn_frame, text="Salta Versione", 
                             command=self._skip)
        skip_btn.pack(side=tk.RIGHT, padx=5)
    
    def _download(self):
        self.result = 'download'
        open_download_page(self.update_info['release_page'])
        self.dialog.destroy()
    
    def _later(self):
        self.result = 'later'
        self.dialog.destroy()
    
    def _skip(self):
        self.result = 'skip'
        self.dialog.destroy()
    
    def show(self):
        self.dialog.wait_window()
        return self.result


def show_update_dialog(parent, update_info):
    """Show update dialog and return user choice."""
    dialog = UpdateDialog(parent, update_info)
    return dialog.show()
