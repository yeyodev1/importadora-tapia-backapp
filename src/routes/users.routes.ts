import { Router } from "express";
import { UsersController } from "../controllers/users.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { adminOnly } from "../middlewares/adminOnly.middleware";

const usersRouter = Router();

usersRouter.use(authMiddleware, adminOnly);

usersRouter.get("/", UsersController.list);
usersRouter.post("/", UsersController.create);
usersRouter.patch("/:id", UsersController.update);
usersRouter.delete("/:id", UsersController.remove);

export default usersRouter;
