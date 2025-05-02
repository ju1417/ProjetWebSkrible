import { Router } from "../deps.ts";
import { registerUser } from "../controllers/authController.ts";

const authRouter = new Router();

// Route pour l'inscription
authRouter.post("/api/register", registerUser);

export default authRouter;