import type { Express } from "express";
import type { Server } from "http";
import { localStorage } from "./db-local";
import { BetfairClient } from "./betfair";
import { z } from "zod";

const LOCAL_USER_ID = "local-user";

const uploadCertificateSchema = z.object({
  appKey: z.string().min(1, "Application Key obbligatoria"),
  certificate: z.string().min(1, "Certificato obbligatorio"),
  privateKey: z.string().min(1, "Chiave privata obbligatoria"),
});

const connectSchema = z.object({
  username: z.string().min(1, "Username obbligatorio"),
  password: z.string().min(1, "Password obbligatoria"),
});

const placeBetsSchema = z.object({
  marketId: z.string().min(1, "Market ID required"),
  eventName: z.string().min(1, "Event name required"),
  marketName: z.string().min(1, "Market name required"),
  betType: z.enum(["back", "lay"]),
  selections: z.array(z.object({
    selectionId: z.number(),
    selectionName: z.string(),
    price: z.number().positive(),
    stake: z.number().min(2, "Stake minimo 2.00"),
  })).min(1, "Almeno una selezione richiesta"),
  totalStake: z.number().positive(),
  totalLiability: z.number().optional(),
});

export async function registerLocalRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.get("/api/auth/user", (req, res) => {
    const user = localStorage.getUser(LOCAL_USER_ID);
    if (!user) {
      return res.status(401).json({ message: "Non autenticato" });
    }
    res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      profileImageUrl: user.profile_image_url,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    });
  });

  app.get("/api/betfair/status", (req, res) => {
    const settings = localStorage.getBetfairSettings(LOCAL_USER_ID);
    
    if (!settings?.session_token || !settings?.session_expiry) {
      return res.json({ 
        connected: false, 
        message: "Nessuna sessione attiva",
        hasCertificate: !!(settings?.certificate && settings?.private_key),
        hasAppKey: !!settings?.app_key,
      });
    }

    const now = new Date();
    if (new Date(settings.session_expiry) < now) {
      return res.json({ 
        connected: false, 
        message: "Sessione scaduta",
        hasCertificate: !!(settings?.certificate && settings?.private_key),
        hasAppKey: !!settings?.app_key,
      });
    }

    res.json({
      connected: true,
      message: "Connesso",
      sessionExpiry: settings.session_expiry,
      hasCertificate: !!(settings?.certificate && settings?.private_key),
      hasAppKey: !!settings?.app_key,
    });
  });

  app.get("/api/betfair/settings", (req, res) => {
    const settings = localStorage.getBetfairSettings(LOCAL_USER_ID);
    
    res.json({
      appKey: settings?.app_key || "",
      hasCertificate: !!(settings?.certificate && settings?.private_key),
      sessionToken: settings?.session_token ? "***" : null,
      sessionExpiry: settings?.session_expiry,
    });
  });

  app.post("/api/betfair/upload-certificate", (req, res) => {
    try {
      const validation = uploadCertificateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: validation.error.errors[0]?.message || "Richiesta non valida" 
        });
      }

      const { appKey, certificate, privateKey } = validation.data;
      localStorage.updateBetfairCertificate(LOCAL_USER_ID, appKey, certificate, privateKey);

      res.json({ success: true, message: "Certificato salvato" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/betfair/connect", async (req, res) => {
    try {
      const validation = connectSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: validation.error.errors[0]?.message || "Richiesta non valida" 
        });
      }

      const { username, password } = validation.data;

      const settings = localStorage.getBetfairSettings(LOCAL_USER_ID);
      
      if (!settings?.app_key || !settings?.certificate || !settings?.private_key) {
        return res.status(400).json({ 
          message: "Carica prima il certificato e l'App Key" 
        });
      }

      const { sessionToken, expiry } = await BetfairClient.loginWithCertificate(
        settings.app_key,
        username,
        password,
        settings.certificate,
        settings.private_key
      );

      localStorage.updateBetfairSession(LOCAL_USER_ID, sessionToken, expiry);

      res.json({ success: true, sessionExpiry: expiry });
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Connessione fallita" });
    }
  });

  app.post("/api/betfair/disconnect", (req, res) => {
    try {
      localStorage.updateBetfairSession(LOCAL_USER_ID, null, null);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/betfair/account-funds", async (req, res) => {
    try {
      const settings = localStorage.getBetfairSettings(LOCAL_USER_ID);
      
      if (!settings?.session_token || !settings?.app_key) {
        return res.status(400).json({ message: "Non connesso a Betfair" });
      }

      const client = new BetfairClient(settings.app_key, settings.session_token);
      const funds = await client.getAccountFunds();
      
      res.json(funds);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/betfair/events", async (req, res) => {
    try {
      const settings = localStorage.getBetfairSettings(LOCAL_USER_ID);
      
      if (!settings?.session_token || !settings?.app_key) {
        return res.status(400).json({ message: "Non connesso a Betfair" });
      }

      const competitionId = req.query.competitionId as string | undefined;

      const client = new BetfairClient(settings.app_key, settings.session_token);
      const events = await client.getFootballEvents(competitionId);
      
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/betfair/competitions", async (req, res) => {
    try {
      const settings = localStorage.getBetfairSettings(LOCAL_USER_ID);
      
      if (!settings?.session_token || !settings?.app_key) {
        return res.status(400).json({ message: "Non connesso a Betfair" });
      }

      const client = new BetfairClient(settings.app_key, settings.session_token);
      const competitions = await client.getCompetitions();
      
      res.json(competitions);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/betfair/market", async (req, res) => {
    try {
      const eventId = req.query.eventId as string | undefined;
      
      if (!eventId) {
        return res.status(400).json({ message: "Event ID richiesto" });
      }

      const settings = localStorage.getBetfairSettings(LOCAL_USER_ID);
      
      if (!settings?.session_token || !settings?.app_key) {
        return res.status(400).json({ message: "Non connesso a Betfair" });
      }

      const client = new BetfairClient(settings.app_key, settings.session_token);
      const market = await client.getCorrectScoreMarket(eventId);
      
      if (!market) {
        return res.status(404).json({ message: "Mercato non trovato" });
      }

      res.json(market);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/bets/place", async (req, res) => {
    try {
      const validation = placeBetsSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: validation.error.errors[0]?.message || "Richiesta non valida" 
        });
      }

      const { marketId, eventName, marketName, betType, selections, totalStake, totalLiability } = validation.data;

      const settings = localStorage.getBetfairSettings(LOCAL_USER_ID);
      
      if (!settings?.session_token || !settings?.app_key) {
        return res.status(400).json({ message: "Non connesso a Betfair" });
      }

      const client = new BetfairClient(settings.app_key, settings.session_token);
      
      const instructions = selections.map((sel) => ({
        selectionId: sel.selectionId,
        side: betType.toUpperCase() as "BACK" | "LAY",
        price: sel.price,
        stake: sel.stake,
      }));

      const result = await client.placeOrders(marketId, instructions);

      const bet = localStorage.createBet({
        userId: LOCAL_USER_ID,
        marketId,
        eventName,
        marketName,
        betType,
        selections,
        totalStake: totalStake.toString(),
        totalLiability: totalLiability?.toString(),
        status: result.status === "SUCCESS" ? "placed" : "failed",
      });

      res.json({ success: result.status === "SUCCESS", bet, result });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/bets", (req, res) => {
    try {
      const bets = localStorage.getBets(LOCAL_USER_ID);
      const formattedBets = bets.map(bet => ({
        ...bet,
        selections: JSON.parse(bet.selections),
      }));
      res.json(formattedBets);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/bets/recent", (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const bets = localStorage.getRecentBets(LOCAL_USER_ID, limit);
      const formattedBets = bets.map(bet => ({
        ...bet,
        selections: JSON.parse(bet.selections),
      }));
      res.json(formattedBets);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
