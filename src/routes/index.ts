import express, { Application } from "express";
import usersRouter from "./users.routes";
import erpRouter from "./erp.routes";
import healthRouter from "./health.routes";
import authRouter from "./auth.routes";
import cobrosRouter from "./cobros.routes";

function routerApi(app: Application) {
  const router = express.Router();
  app.use("/api", router);

  router.use("/health", healthRouter);
  router.use("/auth", authRouter);
  router.use("/erp", erpRouter);
  router.use("/users", usersRouter);
  router.use("/cobros", cobrosRouter);
}

export default routerApi;
