// Production server entry point for Electron
import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import path from "path";
import fs from "fs";
import { localStorage } from "./db-local";
import { BetfairClient } from "./betfair";
import { z } from "zod";

const LOCAL_USER_ID = "local-user";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Determine base path
const isPackaged = process.env.ELECTRON_PACKAGED === 'true';
const basePath = isPackaged ? (process as any).resourcesPath : path.join(import.meta.dirname, '..');

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path.startsWith("/api")) {
      console.log(`${req.method} ${req.path} ${res.statusCode} in ${Date.now() - start}ms`);
    }
  });
  next();
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Auth endpoints
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

// Betfair status
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
    message: "Connesso a Betfair",
    expiresAt: settings.session_expiry,
    hasCertificate: true,
    hasAppKey: true,
  });
});

// Certificate upload
const uploadCertificateSchema = z.object({
  appKey: z.string().min(1),
  certificate: z.string().min(1),
  privateKey: z.string().min(1),
});

app.post("/api/betfair/certificate", async (req, res) => {
  try {
    const data = uploadCertificateSchema.parse(req.body);
    localStorage.updateBetfairCertificate(LOCAL_USER_ID, data.appKey, data.certificate, data.privateKey);
    res.json({ success: true, message: "Certificato salvato" });
  } catch (error: any) {
    res.status(400).json({ message: error.message || "Errore nel salvare il certificato" });
  }
});

// Connect to Betfair
const connectSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

app.post("/api/betfair/connect", async (req, res) => {
  try {
    const data = connectSchema.parse(req.body);
    const settings = localStorage.getBetfairSettings(LOCAL_USER_ID);
    
    if (!settings?.app_key || !settings?.certificate || !settings?.private_key) {
      return res.status(400).json({ message: "Certificato non configurato" });
    }

    const result = await BetfairClient.loginWithCertificate(
      settings.app_key,
      data.username,
      data.password,
      settings.certificate,
      settings.private_key
    );

    localStorage.updateBetfairSession(LOCAL_USER_ID, result.sessionToken, result.expiry);

    res.json({ success: true, message: "Connesso a Betfair", expiresAt: result.expiry });
  } catch (error: any) {
    console.error("Betfair connect error:", error);
    res.status(400).json({ message: error.message || "Errore di connessione" });
  }
});

// Disconnect
app.post("/api/betfair/disconnect", (req, res) => {
  localStorage.updateBetfairSession(LOCAL_USER_ID, null, null);
  res.json({ success: true });
});

// Helper to get Betfair client
function getBetfairClient(): BetfairClient | null {
  const settings = localStorage.getBetfairSettings(LOCAL_USER_ID);
  if (!settings?.session_token || !settings?.app_key) return null;
  if (settings.session_expiry && new Date(settings.session_expiry) < new Date()) return null;
  return new BetfairClient(settings.app_key, settings.session_token);
}

// Account funds
app.get("/api/betfair/account-funds", async (req, res) => {
  const client = getBetfairClient();
  if (!client) return res.status(400).json({ message: "Non connesso a Betfair" });
  try {
    const funds = await client.getAccountFunds();
    res.json(funds);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// Football events
app.get("/api/betfair/football/events", async (req, res) => {
  const client = getBetfairClient();
  if (!client) return res.status(400).json({ message: "Non connesso a Betfair" });
  try {
    const events = await client.getFootballEvents();
    res.json(events);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// Markets for event (returns correct score market with prices)
app.get("/api/betfair/markets/:eventId", async (req, res) => {
  const client = getBetfairClient();
  if (!client) return res.status(400).json({ message: "Non connesso a Betfair" });
  try {
    const market = await client.getCorrectScoreMarket(req.params.eventId);
    res.json(market);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// Place bets
app.post("/api/betfair/place-bets", async (req, res) => {
  const client = getBetfairClient();
  if (!client) return res.status(400).json({ message: "Non connesso a Betfair" });
  try {
    const { marketId, eventName, marketName, betType, selections, totalStake } = req.body;
    
    const instructions = selections.map((sel: any) => ({
      selectionId: sel.selectionId,
      handicap: 0,
      side: betType.toUpperCase(),
      orderType: "LIMIT",
      limitOrder: {
        size: sel.stake,
        price: sel.price,
        persistenceType: "LAPSE",
      },
    }));

    const result = await client.placeOrders(marketId, instructions);
    
    // Log bet to history
    localStorage.createBet({
      userId: LOCAL_USER_ID,
      marketId: marketId,
      eventName: eventName,
      marketName: marketName,
      betType: betType,
      selections: selections,
      totalStake: String(totalStake),
      status: result.status === "SUCCESS" ? "placed" : "failed",
    });

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// Recent bets
app.get("/api/bets/recent", (req, res) => {
  const bets = localStorage.getRecentBets(LOCAL_USER_ID, 50);
  res.json(bets);
});

// Error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || "Internal Server Error" });
});

// Serve static files
const distPath = isPackaged
  ? path.join(basePath, "dist", "public")
  : path.join(basePath, "dist", "public");

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
} else {
  console.warn("Static files not found at:", distPath);
  app.get("*", (_req, res) => {
    res.status(500).send("Frontend not built. Run 'npm run build' first.");
  });
}

// Start server
const port = 5000;
const server = createServer(app);

server.listen(port, "127.0.0.1", () => {
  console.log("");
  console.log("========================================");
  console.log("  BETFAIR DUTCHING - RISULTATI ESATTI");
  console.log("========================================");
  console.log("");
  console.log(`  Server: http://localhost:${port}`);
  console.log("========================================");
  
  // Signal ready to Electron
  if (process.send) {
    process.send("ready");
  }
});
