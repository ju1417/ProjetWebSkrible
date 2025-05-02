import { Application, Router, oakCors, dotenvConfig } from "./deps.ts";
import { errorHandler, notFoundHandler } from "./middleware/errorMiddleware.ts";
import { getDB } from "./config/database.ts";
import { setupWebSockets } from "./config/server.ts";
import authRouter from "./routes/authRoutes.ts";

// Charger les variables d'environnement
const env = await dotenvConfig({ export: true });
const PORT = parseInt(env.PORT || "3000");
const FRONTEND_URL = env.FRONTEND_URL || "http://localhost:8080"; // Passer en HTTP

// Initialiser la base de données
await getDB();

// Créer l'application Oak
const app = new Application();

// Middlewares globaux
app.use(errorHandler);

// Configuration CORS
app.use(
  oakCors({
    origin: "http://localhost:8080", // Autoriser le frontend
    credentials: true,
  })
);

// Router
const router = new Router();

// Route de test
router.get("/api/test", (ctx) => {
  ctx.response.body = { message: "API fonctionne correctement!" };
});

// Ajouter le router à l'application
app.use(router.routes());
app.use(router.allowedMethods());

// Ajouter les routes d'authentification avant le middleware pour les routes non trouvées
app.use(authRouter.routes());
app.use(authRouter.allowedMethods());

// Middleware pour les routes non trouvées
app.use(notFoundHandler);

// Fonction pour démarrer les serveurs
async function startServers() {
  // Démarrer le serveur WebSocket en parallèle
  setupWebSockets();

  // Démarrer le serveur HTTP
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
  await app.listen({ port: PORT });
}

// Démarrer les serveurs
startServers();