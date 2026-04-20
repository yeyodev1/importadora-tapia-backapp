import express, { Application } from "express";
import erpRouter from "./erp.routes";

function routerApi(app: Application) {
  const router = express.Router();
  app.use("/api", router);

  router.use("/erp", erpRouter);
}

export default routerApi;
