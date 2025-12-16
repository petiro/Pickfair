import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { isAuthenticated } from "./replit_integrations/auth";
import { BetfairClient } from "./betfair";
import { z } from "zod";

const uploadCertificateSchema = z.object({
  appKey: z.string().min(1, "Application Key required"),
  certificate: z.string().min(1, "Certificate required"),
  privateKey: z.string().min(1, "Private key required"),
});

const connectSchema = z.object({
  username: z.string().min(1, "Username required"),
  password: z.string().min(1, "Password required"),
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
    stake: z.number().min(2, "Minimum stake is €2.00"),
  })).min(1, "At least one selection required"),
  totalStake: z.number().positive(),
  totalLiability: z.number().optional(),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.get("/api/betfair/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const settings = await storage.getBetfairSettings(userId);
      
      if (!settings?.sessionToken || !settings?.sessionExpiry) {
        return res.json({ 
          connected: false, 
          message: "No active session",
          hasCertificate: !!(settings?.certificate && settings?.privateKey),
          hasAppKey: !!settings?.appKey,
        });
      }

      const now = new Date();
      if (new Date(settings.sessionExpiry) < now) {
        return res.json({ 
          connected: false, 
          message: "Session expired",
          hasCertificate: !!(settings?.certificate && settings?.privateKey),
          hasAppKey: !!settings?.appKey,
        });
      }

      res.json({
        connected: true,
        message: "Connected",
        sessionExpiry: settings.sessionExpiry,
        hasCertificate: !!(settings?.certificate && settings?.privateKey),
        hasAppKey: !!settings?.appKey,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/betfair/settings", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const settings = await storage.getBetfairSettings(userId);
      
      res.json({
        appKey: settings?.appKey || "",
        hasCertificate: !!(settings?.certificate && settings?.privateKey),
        sessionToken: settings?.sessionToken ? "***" : null,
        sessionExpiry: settings?.sessionExpiry,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/betfair/upload-certificate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const validation = uploadCertificateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: validation.error.errors[0]?.message || "Invalid request" 
        });
      }

      const { appKey, certificate, privateKey } = validation.data;

      await storage.updateBetfairCertificate(userId, appKey, certificate, privateKey);

      res.json({ success: true, message: "Certificate uploaded successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/betfair/connect", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const validation = connectSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: validation.error.errors[0]?.message || "Invalid request" 
        });
      }

      const { username, password } = validation.data;

      const settings = await storage.getBetfairSettings(userId);
      
      if (!settings?.appKey || !settings?.certificate || !settings?.privateKey) {
        return res.status(400).json({ 
          message: "Please upload your certificate and App Key first" 
        });
      }

      const { sessionToken, expiry } = await BetfairClient.loginWithCertificate(
        settings.appKey,
        username,
        password,
        settings.certificate,
        settings.privateKey
      );

      await storage.updateBetfairSession(userId, sessionToken, expiry);

      res.json({ success: true, sessionExpiry: expiry });
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Connection failed" });
    }
  });

  app.post("/api/betfair/disconnect", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      await storage.updateBetfairSession(userId, null, null);
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/betfair/account-funds", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const settings = await storage.getBetfairSettings(userId);
      
      if (!settings?.sessionToken || !settings?.appKey) {
        return res.status(400).json({ message: "Not connected to Betfair" });
      }

      const client = new BetfairClient(settings.appKey, settings.sessionToken);
      const funds = await client.getAccountFunds();
      
      res.json(funds);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/betfair/events", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const settings = await storage.getBetfairSettings(userId);
      
      if (!settings?.sessionToken || !settings?.appKey) {
        return res.status(400).json({ message: "Not connected to Betfair" });
      }

      const competitionId = req.query.competitionId as string | undefined;

      const client = new BetfairClient(settings.appKey, settings.sessionToken);
      const events = await client.getFootballEvents(competitionId);
      
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/betfair/competitions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const settings = await storage.getBetfairSettings(userId);
      
      if (!settings?.sessionToken || !settings?.appKey) {
        return res.status(400).json({ message: "Not connected to Betfair" });
      }

      const client = new BetfairClient(settings.appKey, settings.sessionToken);
      const competitions = await client.getCompetitions();
      
      res.json(competitions);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/betfair/market", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const eventId = req.query.eventId as string | undefined;
      
      if (!eventId) {
        return res.status(400).json({ message: "Event ID required" });
      }

      const settings = await storage.getBetfairSettings(userId);
      
      if (!settings?.sessionToken || !settings?.appKey) {
        return res.status(400).json({ message: "Not connected to Betfair" });
      }

      const client = new BetfairClient(settings.appKey, settings.sessionToken);
      const market = await client.getCorrectScoreMarket(eventId);
      
      if (!market) {
        return res.status(404).json({ message: "Market not found" });
      }

      res.json(market);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/bets/place", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const validation = placeBetsSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: validation.error.errors[0]?.message || "Invalid request" 
        });
      }

      const { marketId, eventName, marketName, betType, selections, totalStake, totalLiability } = validation.data;

      const settings = await storage.getBetfairSettings(userId);
      
      if (!settings?.sessionToken || !settings?.appKey) {
        return res.status(400).json({ message: "Not connected to Betfair" });
      }

      const client = new BetfairClient(settings.appKey, settings.sessionToken);
      
      const instructions = selections.map((sel) => ({
        selectionId: sel.selectionId,
        side: betType.toUpperCase() as "BACK" | "LAY",
        price: sel.price,
        stake: sel.stake,
      }));

      const result = await client.placeOrders(marketId, instructions);

      const bet = await storage.createBet({
        userId,
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

  app.get("/api/bets", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const bets = await storage.getBets(userId);
      res.json(bets);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/bets/recent", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const limit = parseInt(req.query.limit as string) || 10;
      const bets = await storage.getRecentBets(userId, limit);
      res.json(bets);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
