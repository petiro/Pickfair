import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { registerLocalRoutes } from "./routes-local";
import { setupViteLocal } from "./vite-local";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const reqPath = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (reqPath.startsWith("/api")) {
      let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse).substring(0, 100)}`;
      }
      console.log(logLine);
    }
  });

  next();
});

(async () => {
  const httpServer = createServer(app);
  await registerLocalRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    console.error(err);
  });

  // Use simplified Vite setup for local Windows execution
  await setupViteLocal(httpServer, app);

  const port = 5000;
  httpServer.listen(port, "0.0.0.0", () => {
    console.log("");
    console.log("========================================");
    console.log("  BETFAIR DUTCHING - RISULTATI ESATTI");
    console.log("========================================");
    console.log("");
    console.log(`  App disponibile su: http://localhost:${port}`);
    console.log("");
    console.log("  Premi Ctrl+C per chiudere");
    console.log("========================================");
    console.log("");
  });
})();
