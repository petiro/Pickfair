interface BetfairResponse<T> {
  result?: T;
  error?: {
    code: string;
    message: string;
  };
}

interface LoginResponse {
  token?: string;
  sessionToken?: string;
  status: string;
  error?: string;
  loginStatus?: string;
}

interface AccountFunds {
  availableToBetBalance: number;
  exposure: number;
  retainedCommission: number;
  exposureLimit: number;
  discountRate: number;
  pointsBalance: number;
  wallet: string;
}

interface Event {
  id: string;
  name: string;
  countryCode: string;
  timezone: string;
  openDate: string;
}

interface Competition {
  id: string;
  name: string;
  region: string;
}

interface MarketCatalogue {
  marketId: string;
  marketName: string;
  totalMatched: number;
  runners: Runner[];
}

interface Runner {
  selectionId: number;
  runnerName: string;
  handicap: number;
  sortPriority: number;
}

interface MarketBook {
  marketId: string;
  status: string;
  totalMatched: number;
  runners: RunnerBook[];
}

interface RunnerBook {
  selectionId: number;
  status: string;
  lastPriceTraded?: number;
  totalMatched: number;
  ex: {
    availableToBack: PriceSize[];
    availableToLay: PriceSize[];
  };
}

interface PriceSize {
  price: number;
  size: number;
}

interface PlaceInstruction {
  selectionId: number;
  handicap: number;
  side: "BACK" | "LAY";
  orderType: "LIMIT";
  limitOrder: {
    size: number;
    price: number;
    persistenceType: "LAPSE" | "PERSIST" | "MARKET_ON_CLOSE";
  };
}

interface PlaceExecutionReport {
  status: string;
  marketId: string;
  instructionReports: InstructionReport[];
}

interface InstructionReport {
  status: string;
  instruction: PlaceInstruction;
  betId?: string;
  errorCode?: string;
}

const BETFAIR_IT_LOGIN_URL = "https://identitysso.betfair.it/api/login";
const BETFAIR_API_URL = "https://api.betfair.com/exchange/betting/rest/v1.0";
const BETFAIR_ACCOUNT_URL = "https://api.betfair.com/exchange/account/rest/v1.0";

export class BetfairClient {
  private appKey: string;
  private sessionToken: string;

  constructor(appKey: string, sessionToken: string) {
    this.appKey = appKey;
    this.sessionToken = sessionToken;
  }

  static async login(
    appKey: string,
    username: string,
    password: string
  ): Promise<{ sessionToken: string; expiry: Date }> {
    const response = await fetch(BETFAIR_IT_LOGIN_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "X-Application": appKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
    });

    const text = await response.text();
    
    let data: LoginResponse;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error(`Risposta non valida da Betfair: ${text.substring(0, 100)}`);
    }

    if (data.status !== "SUCCESS") {
      const errorMessage = data.error || data.status || "Login fallito";
      
      if (errorMessage.includes("INVALID_USERNAME_OR_PASSWORD")) {
        throw new Error("Username o password non corretti");
      }
      if (errorMessage.includes("ACCOUNT_NOW_LOCKED")) {
        throw new Error("Account bloccato. Contatta Betfair");
      }
      if (errorMessage.includes("ACCOUNT_ALREADY_LOCKED")) {
        throw new Error("Account gia bloccato");
      }
      if (errorMessage.includes("INPUT_VALIDATION_ERROR")) {
        throw new Error("Dati non validi. Controlla username e password");
      }
      if (errorMessage.includes("CERT_AUTH_REQUIRED")) {
        throw new Error("Autenticazione certificato richiesta. La tua App Key richiede whitelisting - contatta Betfair");
      }
      if (errorMessage.includes("CHANGE_PASSWORD_REQUIRED")) {
        throw new Error("Cambio password richiesto. Accedi a betfair.it per cambiare la password");
      }
      
      throw new Error(errorMessage);
    }

    const sessionToken = data.token || data.sessionToken;
    
    if (!sessionToken) {
      throw new Error("Token di sessione non ricevuto");
    }

    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 20);

    return { sessionToken, expiry };
  }

  private async request<T>(
    endpoint: string,
    body: object,
    baseUrl = BETFAIR_API_URL
  ): Promise<T> {
    const response = await fetch(`${baseUrl}/${endpoint}/`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Application": this.appKey,
        "X-Authentication": this.sessionToken,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Errore API: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message || data.error);
    }

    return data;
  }

  async getAccountFunds(): Promise<AccountFunds> {
    return this.request<AccountFunds>("getAccountFunds", {}, BETFAIR_ACCOUNT_URL);
  }

  async getFootballEvents(competitionId?: string): Promise<Event[]> {
    const filter: any = {
      eventTypeIds: ["1"],
    };

    if (competitionId && competitionId !== "all") {
      filter.competitionIds = [competitionId];
    }

    filter.marketStartTime = {
      from: new Date().toISOString(),
      to: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const result = await this.request<{ event: Event; marketCount: number }[]>(
      "listEvents",
      { filter }
    );

    return result.map((r) => r.event);
  }

  async getCompetitions(): Promise<Competition[]> {
    const filter = {
      eventTypeIds: ["1"],
      marketStartTime: {
        from: new Date().toISOString(),
        to: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    };

    const result = await this.request<{ competition: Competition; marketCount: number }[]>(
      "listCompetitions",
      { filter }
    );

    return result.map((r) => ({
      ...r.competition,
      region: r.competition.region || "",
    }));
  }

  async getCorrectScoreMarket(eventId: string): Promise<{
    marketId: string;
    marketName: string;
    selections: {
      selectionId: number;
      selectionName: string;
      backPrice: number;
      layPrice: number;
      backSize: number;
      laySize: number;
    }[];
  } | null> {
    const catalogues = await this.request<MarketCatalogue[]>("listMarketCatalogue", {
      filter: {
        eventIds: [eventId],
        marketTypeCodes: ["CORRECT_SCORE"],
      },
      maxResults: 1,
      marketProjection: ["RUNNER_DESCRIPTION"],
    });

    if (catalogues.length === 0) {
      return null;
    }

    const market = catalogues[0];

    const books = await this.request<MarketBook[]>("listMarketBook", {
      marketIds: [market.marketId],
      priceProjection: {
        priceData: ["EX_BEST_OFFERS"],
        virtualise: false,
      },
    });

    if (books.length === 0) {
      return null;
    }

    const book = books[0];

    const selections = market.runners.map((runner) => {
      const runnerBook = book.runners.find(
        (rb) => rb.selectionId === runner.selectionId
      );

      const backOffer = runnerBook?.ex.availableToBack[0];
      const layOffer = runnerBook?.ex.availableToLay[0];

      return {
        selectionId: runner.selectionId,
        selectionName: runner.runnerName,
        backPrice: backOffer?.price || 1000,
        layPrice: layOffer?.price || 1000,
        backSize: backOffer?.size || 0,
        laySize: layOffer?.size || 0,
      };
    });

    return {
      marketId: market.marketId,
      marketName: market.marketName,
      selections,
    };
  }

  async placeOrders(
    marketId: string,
    instructions: {
      selectionId: number;
      side: "BACK" | "LAY";
      price: number;
      stake: number;
    }[]
  ): Promise<PlaceExecutionReport> {
    const placeInstructions: PlaceInstruction[] = instructions.map((inst) => ({
      selectionId: inst.selectionId,
      handicap: 0,
      side: inst.side,
      orderType: "LIMIT" as const,
      limitOrder: {
        size: Math.max(2, Math.round(inst.stake * 100) / 100),
        price: Math.round(inst.price * 100) / 100,
        persistenceType: "LAPSE" as const,
      },
    }));

    return this.request<PlaceExecutionReport>("placeOrders", {
      marketId,
      instructions: placeInstructions,
    });
  }
}
