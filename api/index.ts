import "dotenv/config";
import { createApp } from "../src/app";
import { dbConnect } from "../src/config/mongo";

/**
 * Entrada serverless para Vercel.
 * Vercel compila este archivo con @vercel/node; no se llama a listen().
 * Mongo se conecta en segundo plano: las rutas /api/erp usan MySQL y no deben
 * bloquearse si Mongo tarda o falla.
 */
if (process.env.DB_URI) {
  dbConnect().catch((err) =>
    console.error("[Mongo] conexión fallida:", err.message)
  );
}

const { app } = createApp();

export default app;
