import express from "express";
import cors from "cors";
import http from "http";
import routerApi from "./routes";
import { dbConnect } from "./config/mongo";
import { globalErrorHandler } from "./middlewares/globalErrorHandler.middleware";

const whitelist = [
  "http://localhost:8100",
  "http://localhost:8080",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:8101",
  "https://importadoratapia.app",
  "https://www.importadoratapia.app",
  // Orígenes adicionales de producción vía env (separados por coma)
  ...(process.env.CORS_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
];

function isVercelPreview(origin: string): boolean {
  try {
    return new URL(origin).hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || whitelist.includes(origin) || isVercelPreview(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
};

const ensureMongo = async (_req: any, res: any, next: any) => {
  try {
    await dbConnect();
    next();
  } catch {
    res.status(503).json({
      success: false,
      message: "Base de datos no disponible temporalmente. Reintenta en unos segundos.",
    });
  }
};

export function createApp() {
  const app = express();

  app.use(cors(corsOptions));
  app.use(express.json({ limit: "50mb" }));

  app.get("/", (_req, res) => {
    res.send("Server is alive");
  });

  // Serverless: garantizar que Mongo esté conectado antes de las rutas que lo
  // usan (auth, users). Es idempotente y sólo espera en el primer request tras
  // un cold start. Las rutas ERP (MySQL) no dependen de esto.
  app.use("/api/auth", ensureMongo);
  app.use("/api/users", ensureMongo);
  app.use("/api/cobros", ensureMongo);
  app.use("/api/pedidos", ensureMongo);

  routerApi(app);

  app.use(globalErrorHandler);

  const server = http.createServer(app);

  return { app, server };
}
