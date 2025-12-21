"""
API Cache module for Betfair API responses.
Provides TTL-based caching for data that doesn't change frequently.
"""

import time
import threading
from functools import wraps


class APICache:
    """Thread-safe cache with TTL support."""
    
    def __init__(self):
        self._cache = {}
        self._lock = threading.RLock()
        
        self.TTL_EVENTS = 60
        self.TTL_MARKETS = 30
        self.TTL_ACCOUNT = 10
        self.TTL_PRICES = 2
    
    def get(self, key):
        """Get value from cache if not expired."""
        with self._lock:
            if key in self._cache:
                value, expiry = self._cache[key]
                if time.time() < expiry:
                    return value
                else:
                    del self._cache[key]
            return None
    
    def set(self, key, value, ttl):
        """Set value in cache with TTL in seconds."""
        with self._lock:
            self._cache[key] = (value, time.time() + ttl)
    
    def invalidate(self, key):
        """Remove specific key from cache."""
        with self._lock:
            if key in self._cache:
                del self._cache[key]
    
    def invalidate_prefix(self, prefix):
        """Remove all keys starting with prefix."""
        with self._lock:
            keys_to_delete = [k for k in self._cache if k.startswith(prefix)]
            for key in keys_to_delete:
                del self._cache[key]
    
    def clear(self):
        """Clear entire cache."""
        with self._lock:
            self._cache.clear()
    
    def stats(self):
        """Get cache statistics."""
        with self._lock:
            total = len(self._cache)
            valid = sum(1 for _, (_, exp) in self._cache.items() if time.time() < exp)
            return {'total': total, 'valid': valid, 'expired': total - valid}


cache = APICache()


def cached(cache_key_func, ttl):
    """
    Decorator to cache function results.
    
    Args:
        cache_key_func: Function that takes same args as decorated function 
                        and returns cache key string
        ttl: Time to live in seconds
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            key = cache_key_func(*args, **kwargs)
            
            result = cache.get(key)
            if result is not None:
                return result
            
            result = func(*args, **kwargs)
            
            if result is not None:
                cache.set(key, result, ttl)
            
            return result
        return wrapper
    return decorator


class AsyncRunner:
    """Run functions asynchronously without blocking the UI."""
    
    @staticmethod
    def run(func, callback=None, error_callback=None, *args, **kwargs):
        """
        Execute function in background thread.
        
        Args:
            func: Function to execute
            callback: Optional callback(result) on success
            error_callback: Optional callback(exception) on error
            *args, **kwargs: Arguments for func
        """
        def worker():
            try:
                result = func(*args, **kwargs)
                if callback:
                    callback(result)
            except Exception as e:
                if error_callback:
                    error_callback(e)
        
        thread = threading.Thread(target=worker, daemon=True)
        thread.start()
        return thread
    
    @staticmethod
    def run_with_ui(root, func, callback=None, error_callback=None, *args, **kwargs):
        """
        Execute function in background, callbacks run in main thread.
        
        Args:
            root: Tk root window (for after() scheduling)
            func: Function to execute
            callback: Optional callback(result) on success - runs in UI thread
            error_callback: Optional callback(exception) on error - runs in UI thread
            *args, **kwargs: Arguments for func
        """
        def worker():
            try:
                result = func(*args, **kwargs)
                if callback:
                    root.after(0, lambda: callback(result))
            except Exception as e:
                if error_callback:
                    root.after(0, lambda: error_callback(e))
        
        thread = threading.Thread(target=worker, daemon=True)
        thread.start()
        return thread
