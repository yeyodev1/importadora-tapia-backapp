import { Router } from "express";
import { UsersController } from "../controllers/users.controller";
import { VendedoresOcultosController } from "../controllers/vendedoresOcultos.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { adminOnly } from "../middlewares/adminOnly.middleware";

const usersRouter = Router();

usersRouter.use(authMiddleware, adminOnly);

// Vendedores del ERP que ya no trabajan con Tapia (se ocultan en la app).
usersRouter.get("/vendedores-ocultos", VendedoresOcultosController.list);
usersRouter.post("/vendedores-ocultos", VendedoresOcultosController.ocultar);
usersRouter.delete("/vendedores-ocultos/:venCodigo", VendedoresOcultosController.restaurar);

usersRouter.get("/", UsersController.list);
usersRouter.post("/", UsersController.create);
usersRouter.patch("/:id", UsersController.update);
usersRouter.delete("/:id", UsersController.remove);

export default usersRouter;
