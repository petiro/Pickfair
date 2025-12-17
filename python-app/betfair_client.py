"""
Betfair API client using betfairlightweight library.
Handles SSL certificate authentication for Betfair Italy.
"""

import os
import tempfile
import betfairlightweight
from betfairlightweight import filters
from datetime import datetime, timedelta

# Betfair Italy endpoints
ITALY_LOGIN_URL = "https://identitysso-cert.betfair.it/api/certlogin"
ITALY_EXCHANGE_URL = "https://api.betfair.it/exchange"

# Sport IDs
FOOTBALL_ID = "1"
CORRECT_SCORE_MARKET = "CORRECT_SCORE"

class BetfairClient:
    def __init__(self, username, app_key, cert_pem, key_pem):
        self.username = username
        self.app_key = app_key
        self.cert_pem = cert_pem
        self.key_pem = key_pem
        self.client = None
        self.temp_cert_file = None
        self.temp_key_file = None
    
    def _create_temp_cert_files(self):
        """Create temporary certificate files for betfairlightweight."""
        self.temp_cert_file = tempfile.NamedTemporaryFile(
            mode='w', suffix='.pem', delete=False
        )
        self.temp_cert_file.write(self.cert_pem)
        self.temp_cert_file.close()
        
        self.temp_key_file = tempfile.NamedTemporaryFile(
            mode='w', suffix='.pem', delete=False
        )
        self.temp_key_file.write(self.key_pem)
        self.temp_key_file.close()
        
        return self.temp_cert_file.name, self.temp_key_file.name
    
    def _cleanup_temp_files(self):
        """Clean up temporary certificate files."""
        try:
            if self.temp_cert_file and os.path.exists(self.temp_cert_file.name):
                os.unlink(self.temp_cert_file.name)
            if self.temp_key_file and os.path.exists(self.temp_key_file.name):
                os.unlink(self.temp_key_file.name)
        except:
            pass
    
    def login(self, password):
        """
        Login to Betfair Italy using SSL certificate authentication.
        Returns session token on success.
        
        Uses locale="italy" which configures betfairlightweight to:
        - Login via https://identitysso.betfair.it/api/certlogin
        - After login, API calls use standard endpoints with Italian session
        """
        cert_path, key_path = self._create_temp_cert_files()
        
        try:
            # Create client with Italy locale for .it endpoints
            self.client = betfairlightweight.APIClient(
                username=self.username,
                password=password,
                app_key=self.app_key,
                certs=(cert_path, key_path),
                locale="italy"  # Use "italy" not "it" for Italian Exchange
            )
            
            # Login using SSL certificate authentication
            # This calls identitysso.betfair.it for Italian accounts
            self.client.login()
            
            return {
                'session_token': self.client.session_token,
                'expiry': (datetime.now() + timedelta(hours=8)).isoformat()
            }
        except Exception as e:
            self._cleanup_temp_files()
            raise Exception(f"Login fallito: {str(e)}")
    
    def logout(self):
        """Logout from Betfair."""
        if self.client:
            try:
                self.client.logout()
            except:
                pass
        self._cleanup_temp_files()
        self.client = None
    
    def get_account_funds(self):
        """Get account balance."""
        if not self.client:
            raise Exception("Non connesso a Betfair")
        
        account = self.client.account.get_account_funds()
        return {
            'available': account.available_to_bet_balance,
            'exposure': account.exposure,
            'total': account.available_to_bet_balance + abs(account.exposure)
        }
    
    def get_football_events(self):
        """Get upcoming football events."""
        if not self.client:
            raise Exception("Non connesso a Betfair")
        
        # Get events for today and tomorrow
        time_filter = filters.time_range(
            from_=datetime.now(),
            to=datetime.now() + timedelta(days=2)
        )
        
        events = self.client.betting.list_events(
            filter=filters.market_filter(
                event_type_ids=[FOOTBALL_ID],
                market_start_time=time_filter
            )
        )
        
        result = []
        for event in events:
            result.append({
                'id': event.event.id,
                'name': event.event.name,
                'countryCode': event.event.country_code,
                'openDate': event.event.open_date.isoformat() if event.event.open_date else None,
                'marketCount': event.market_count
            })
        
        # Sort by date
        result.sort(key=lambda x: x['openDate'] or '')
        return result
    
    def get_correct_score_market(self, event_id):
        """Get correct score market for an event with prices."""
        if not self.client:
            raise Exception("Non connesso a Betfair")
        
        # Find correct score market
        markets = self.client.betting.list_market_catalogue(
            filter=filters.market_filter(
                event_ids=[event_id],
                market_type_codes=[CORRECT_SCORE_MARKET]
            ),
            market_projection=['RUNNER_DESCRIPTION', 'MARKET_START_TIME'],
            max_results=1
        )
        
        if not markets:
            raise Exception("Mercato Risultato Esatto non trovato")
        
        market = markets[0]
        market_id = market.market_id
        
        # Get prices
        price_data = self.client.betting.list_market_book(
            market_ids=[market_id],
            price_projection=filters.price_projection(
                price_data=['EX_BEST_OFFERS']
            )
        )
        
        if not price_data:
            raise Exception("Quote non disponibili")
        
        # Build runners with prices
        runners = []
        price_book = price_data[0]
        
        for runner in market.runners:
            runner_prices = None
            for pb_runner in price_book.runners:
                if pb_runner.selection_id == runner.selection_id:
                    runner_prices = pb_runner
                    break
            
            back_price = None
            lay_price = None
            
            if runner_prices and runner_prices.ex:
                if runner_prices.ex.available_to_back:
                    back_price = runner_prices.ex.available_to_back[0].price
                if runner_prices.ex.available_to_lay:
                    lay_price = runner_prices.ex.available_to_lay[0].price
            
            runners.append({
                'selectionId': runner.selection_id,
                'runnerName': runner.runner_name,
                'sortPriority': runner.sort_priority,
                'backPrice': back_price,
                'layPrice': lay_price,
                'status': runner_prices.status if runner_prices else 'ACTIVE'
            })
        
        return {
            'marketId': market_id,
            'marketName': market.market_name,
            'startTime': market.market_start_time.isoformat() if market.market_start_time else None,
            'runners': runners
        }
    
    def place_bets(self, market_id, instructions):
        """
        Place bets on Betfair.
        
        instructions: list of {
            'selectionId': int,
            'side': 'BACK' or 'LAY',
            'price': float,
            'size': float
        }
        """
        if not self.client:
            raise Exception("Non connesso a Betfair")
        
        # Validate Italian regulations
        for inst in instructions:
            if inst['side'] == 'BACK' and inst['size'] < 2.0:
                raise Exception(f"Puntata minima BACK: 2.00 EUR (richiesto: {inst['size']:.2f})")
        
        # Build limit orders
        limit_orders = []
        for inst in instructions:
            limit_orders.append(
                betfairlightweight.filters.limit_order(
                    size=inst['size'],
                    price=inst['price'],
                    persistence_type='LAPSE'
                )
            )
        
        place_instructions = []
        for i, inst in enumerate(instructions):
            place_instructions.append(
                betfairlightweight.filters.place_instruction(
                    selection_id=inst['selectionId'],
                    side=inst['side'],
                    order_type='LIMIT',
                    limit_order=limit_orders[i]
                )
            )
        
        result = self.client.betting.place_orders(
            market_id=market_id,
            instructions=place_instructions
        )
        
        return {
            'status': result.status,
            'marketId': result.market_id,
            'instructionReports': [
                {
                    'status': ir.status,
                    'betId': ir.bet_id,
                    'placedDate': ir.placed_date.isoformat() if ir.placed_date else None,
                    'averagePriceMatched': ir.average_price_matched,
                    'sizeMatched': ir.size_matched
                }
                for ir in result.instruction_reports
            ] if result.instruction_reports else []
        }
