import "dotenv/config";

import express from "express";
import helmet from "helmet";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rateLimit } from "express-rate-limit";

import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import farmRoutes from "./routes/farm.routes.js";
import datasetRoutes from "./routes/datasets.routes.js";
import nasaPowerRoutes from "./routes/nasa-power.routes.js";
import { prisma } from "./config/prisma.js";

const app = express();
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT) || 5000;

const BACKEND_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(BACKEND_DIR, "../frontend");

const { Pool } = pg;

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is missing from backend/.env");
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing from backend/.env");
}

// PostgreSQL connection for persistent login sessions
const sessionPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const PgSession = connectPgSimple(session);

// Security headers.
// CSP is temporarily disabled because the existing frontend uses inline scripts.
app.use(helmet({
  contentSecurityPolicy: false,
}));

app.use(express.json({ limit: "10kb" }));

// API rate limiting
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Persistent session configuration
app.use(
  session({
    store: new PgSession({
      pool: sessionPool,
      tableName: "user_sessions",
      createTableIfMissing: true,
    }),
    name: "cropswitch.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    },
  })
);

// API routes
app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/farms", farmRoutes);
app.use("/api/datasets", datasetRoutes);
app.use("/api/nasa-power", nasaPowerRoutes);

// Protect the dashboard HTML page
function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.redirect("/login.html");
  }

  next();
}

app.get("/dashboard.html", requireAuth, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "dashboard.html"));
});

// Serve the existing frontend
app.use(express.static(FRONTEND_DIR));

// Unknown routes
app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: "Route not found",
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`CropSwitch API running at http://localhost:${PORT}`);
});

// Graceful shutdown
async function shutdown(signal) {
  console.log(`${signal} received. Shutting down...`);

  server.close(async () => {
    try {
      await prisma.$disconnect();
      await sessionPool.end();
      console.log("Database connections closed.");
      process.exit(0);
    } catch (error) {
      console.error("Shutdown error:", error.message);
      process.exit(1);
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));


