import mongoose from "mongoose";

let connection: Promise<typeof mongoose> | null = null;

/**
 * Conexión perezosa y cacheada: en serverless el módulo se reutiliza entre
 * invocaciones, así que no se debe reconectar por request ni matar el proceso.
 */
export async function dbConnect() {
  const DB_URI = process.env.DB_URI;

  if (!DB_URI) {
    throw new Error("DB_URI is not defined in environment variables");
  }

  if (!connection) {
    connection = mongoose
      .connect(DB_URI)
      .then((m) => {
        console.log("Connected to MongoDB");
        return m;
      })
      .catch((error) => {
        connection = null;
        console.error("MongoDB connection error:", error);
        throw error;
      });
  }

  return connection;
}
