import express, { Application } from "express";
import usersRouter from "./users.routes";
import erpRouter from "./erp.routes";
import healthRouter from "./health.routes";
import authRouter from "./auth.routes";
import cobrosRouter from "./cobros.routes";
import pedidosRouter from "./pedidos.routes";
import inventarioRouter from "./inventario.routes";
import estadoRouter from "./estado.routes";
import visitasRouter from "./visitas.routes";

function routerApi(app: Application) {
  const router = express.Router();
  app.use("/api", router);

  router.use("/health", healthRouter);
  router.use("/auth", authRouter);
  router.use("/erp", erpRouter);
  router.use("/users", usersRouter);
  router.use("/cobros", cobrosRouter);
  router.use("/pedidos", pedidosRouter);
  router.use("/inventario", inventarioRouter);
  router.use("/estado", estadoRouter);
  router.use("/visitas", visitasRouter);
}

export default routerApi;
