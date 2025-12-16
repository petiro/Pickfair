import https from "https";

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

interface EventType {
  id: string;
  name: string;
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

interface PlaceOrdersRequest {
  marketId: string;
  instructions: PlaceInstruction[];
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

const BETFAIR_IT_CERT_LOGIN_URL = "https://identitysso-cert.betfair.it/api/certlogin";
const BETFAIR_API_URL = "https://api.betfair.com/exchange/betting/rest/v1.0";
const BETFAIR_ACCOUNT_URL = "https://api.betfair.com/exchange/account/rest/v1.0";

export class BetfairClient {
  private appKey: string;
  private sessionToken: string;

  constructor(appKey: string, sessionToken: string) {
    this.appKey = appKey;
    this.sessionToken = sessionToken;
  }

  static async loginWithCertificate(
    appKey: string,
    username: string,
    password: string,
    certificate: string,
    privateKey: string
  ): Promise<{ sessionToken: string; expiry: Date }> {
    return new Promise((resolve, reject) => {
      const postData = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
      
      const options: https.RequestOptions = {
        hostname: "identitysso-cert.betfair.it",
        port: 443,
        path: "/api/certlogin",
        method: "POST",
        cert: certificate,
        key: privateKey,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Application": appKey,
          "Content-Length": Buffer.byteLength(postData),
        },
        rejectUnauthorized: true,
      };

      const req = https.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            const response: LoginResponse = JSON.parse(data);

            if (response.loginStatus !== "SUCCESS" || !response.sessionToken) {
              reject(new Error(response.loginStatus || response.error || "Login failed"));
              return;
            }

            const expiry = new Date();
            expiry.setHours(expiry.getHours() + 8);

            resolve({
              sessionToken: response.sessionToken,
              expiry,
            });
          } catch (e: any) {
            reject(new Error(`Failed to parse response: ${data.substring(0, 200)}`));
          }
        });
      });

      req.on("error", (e) => {
        reject(new Error(`Connection error: ${e.message}`));
      });

      req.write(postData);
      req.end();
    });
  }

  private async request<T>(
    endpoint: string,
    body: object,
    baseUrl = BETFAIR_API_URL
  ): Promise<T> {
    const response = await fetch(`${baseUrl}/${endpoint}/`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Application": this.appKey,
        "X-Authentication": this.sessionToken,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
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
