import { WebSocketServer, path, exists, dotenvConfig } from "../deps.ts";
import { Application } from "../deps.ts";

// Charger les variables d'environnement
const env = await dotenvConfig({ export: true });
const PORT = parseInt(env.PORT || "3000");
const FRONTEND_URL = env.FRONTEND_URL || "http://localhost:8080";

// Fonction pour configurer le serveur HTTPS
export function setupHttpsServer(app: Application): void {
  // Les options HTTPS
  const options = {
    port: PORT,
    secure: false, // Deno gère automatiquement HTTPS
  };

  // Message de démarrage
  app.addEventListener("listen", ({ secure, hostname, port }) => {
    const protocol = secure ? "https://" : "http://";
    const url = `${protocol}${hostname ?? "localhost"}:${port}`;
    console.log(`Serveur démarré sur ${url}`);
  });

  // Démarrer le serveur
  app.listen(options);
}

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

export async function setupWebSockets(): Promise<void> {
  const wsPort = 3001;

  console.log(`Serveur WebSocket démarré sur ws://localhost:${wsPort}`);

  await serve(async (req) => {
    if (req.headers.get("upgrade") !== "websocket") {
      return new Response("Expected WebSocket connection", { status: 400 });
    }

    const { socket, response } = Deno.upgradeWebSocket(req);

    socket.onopen = () => {
      console.log("Nouvelle connexion WebSocket établie");
      socket.send(JSON.stringify({ type: "info", message: "Bienvenue sur le serveur WebSocket!" }));
    };

    socket.onmessage = (event) => {
      console.log("Message WebSocket reçu :", event.data);

      // Répondre au client
      socket.send(JSON.stringify({ type: "echo", data: event.data }));
    };

    socket.onclose = () => console.log("Connexion WebSocket fermée");
    socket.onerror = (err) => console.error("Erreur WebSocket :", err);

    return response;
  }, { port: wsPort });
}