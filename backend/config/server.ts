import { Application, Router, oakCors, dotenvConfig, isHttpError, Status } from "../deps.ts";
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { hashPassword, verifyPassword } from "../utils/passwordUtils.ts";

// Charger les variables d'environnement
const env = await dotenvConfig({ export: true });
const PORT = parseInt(env.PORT || "3000");
const WS_PORT = 3001;
const FRONTEND_URL = env.FRONTEND_URL || "http://localhost:8080";

// Configuration PostgreSQL
export const db = new Client({
  user: env.DB_USER || "postgres",
  password: env.DB_PASSWORD || "1234",
  database: env.DB_NAME || "postgres",
  hostname: env.DB_HOST || "localhost",
  port: parseInt(env.DB_PORT || "5432"),
});

// Types pour le jeu
interface Player {
  id: string;
  username: string;
  score: number;
  isDrawing: boolean;
}

interface GameRoom {
  players: Map<string, Player>;
  currentWord: string | null;
  currentDrawer: string | null;
  gameState: 'waiting' | 'playing' | 'roundEnd';
  timeLeft: number;
  timerInterval?: number;
}

// Variables globales pour le jeu
const gameRoom: GameRoom = {
  players: new Map(),
  currentWord: null,
  currentDrawer: null,
  gameState: 'waiting',
  timeLeft: 60
};

const connectedClients = new Map<WebSocket, Player>();

// Créer l'application Oak
const app = new Application();
const router = new Router();

// Configuration CORS optimale
app.use(oakCors({
  origin: FRONTEND_URL,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

// Middleware pour gérer les erreurs
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error("Erreur:", err);
    ctx.response.status = err.status || 500;
    ctx.response.body = {
      error: isHttpError(err) ? err.message : "Erreur serveur",
      ...(Deno.env.get("DEV") && { details: err.stack })
    };
  }
});

// Middleware pour gérer les routes non trouvées
function notFoundHandler(ctx) {
  ctx.response.status = Status.NotFound;
  ctx.response.body = { error: "Route non trouvée." };
}

// Route de test - VERSION SANS DB
router.get("/api/test", (ctx) => {
  ctx.response.body = {
    message: "API fonctionne SANS base de données!",
    time: new Date().toISOString()
  };
});

// Route de word aléatoire
router.get("/api/random-word", async (ctx) => {
  try {
    // Se connecter à la base de données si ce n'est pas déjà fait
    if (!db.connected) {
      await db.connect();
    }

    // Exécuter la requête SQL corrigée
    const result = await db.queryObject(
      "SELECT word, difficulty, category FROM words ORDER BY RANDOM() LIMIT 1"
    );

    // Vérifier et retourner le résultat
    if (result.rows.length > 0) {
      ctx.response.body = result.rows[0];
    } else {
      // Fallback sur des données en dur si la DB est vide
      const words = [
        { word: "chat", difficulty: 1, category: "animaux" },
        { word: "maison", difficulty: 1, category: "objets" },
        { word: "voiture", difficulty: 2, category: "objets" },
        { word: "soleil", difficulty: 1, category: "nature" }
      ];
      const randomWord = words[Math.floor(Math.random() * words.length)];
      ctx.response.body = randomWord;
    }

  } catch (error) {
    console.error("Erreur DB:", error);
    // Fallback sur des données en dur en cas d'erreur
    const words = [
      { word: "chat", difficulty: 1, category: "animaux" },
      { word: "maison", difficulty: 1, category: "objets" },
      { word: "voiture", difficulty: 2, category: "objets" }
    ];
    const randomWord = words[Math.floor(Math.random() * words.length)];
    ctx.response.body = randomWord;
  }
});

// WebSocket amélioré pour le jeu multijoueur
async function handleWS(req: Request) {
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("WebSocket required", { status: 400 });
  }
  
  const { socket, response } = Deno.upgradeWebSocket(req);
  
  socket.onopen = () => {
    console.log("Nouvelle connexion WebSocket établie");
  };
  
  socket.onmessage = async (e) => {
    try {
      const message = JSON.parse(e.data);
      
      switch(message.type) {
        case 'join':
          handlePlayerJoin(socket, message.username);
          break;
          
        case 'chat':
          handleChatMessage(socket, message.content);
          break;
          
        case 'draw':
          handleDrawData(socket, message.drawData);
          break;
          
        case 'guess':
          handleGuess(socket, message.guess);
          break;
          
        case 'clearCanvas':
          broadcastMessage({ type: 'clearCanvas' }, socket);
          break;
      }
    } catch (err) {
      console.error("Erreur traitement message:", err);
    }
  };
  
  socket.onclose = () => {
    handlePlayerLeave(socket);
  };
  
  socket.onerror = (error) => {
    console.error("Erreur WebSocket:", error);
  };
  
  return response;
}

// Fonctions de gestion du jeu
function handlePlayerJoin(socket: WebSocket, username: string) {
  const playerId = crypto.randomUUID();
  const player: Player = {
    id: playerId,
    username: username,
    score: 0,
    isDrawing: false
  };
  
  connectedClients.set(socket, player);
  gameRoom.players.set(playerId, player);
  
  // Envoyer l'état actuel au nouveau joueur
  socket.send(JSON.stringify({
    type: 'gameState',
    players: Array.from(gameRoom.players.values()),
    currentWord: player.isDrawing ? gameRoom.currentWord : null,
    currentDrawer: gameRoom.currentDrawer,
    gameState: gameRoom.gameState,
    timeLeft: gameRoom.timeLeft
  }));
  
  // Notifier les autres joueurs
  broadcastMessage({
    type: 'playerJoined',
    player: player
  }, socket);
  
  // Démarrer le jeu si assez de joueurs
  checkAndStartGame();
}

function handlePlayerLeave(socket: WebSocket) {
  const player = connectedClients.get(socket);
  if (player) {
    gameRoom.players.delete(player.id);
    connectedClients.delete(socket);
    
    broadcastMessage({
      type: 'playerLeft',
      playerId: player.id
    });
    
    // Si le joueur qui part était en train de dessiner, passer au tour suivant
    if (player.id === gameRoom.currentDrawer) {
      endRound();
    }
  }
}

function handleChatMessage(socket: WebSocket, content: string) {
  const player = connectedClients.get(socket);
  if (!player) return;
  
  broadcastMessage({
    type: 'chat',
    sender: player.username,
    content: content
  });
}

function handleDrawData(socket: WebSocket, drawData: any) {
  const player = connectedClients.get(socket);
  if (!player || !player.isDrawing) return;
  
  broadcastMessage({
    type: 'draw',
    drawData: drawData
  }, socket);
}

function handleGuess(socket: WebSocket, guess: string) {
  const player = connectedClients.get(socket);
  if (!player || !gameRoom.currentWord || player.isDrawing) return;
  
  if (guess.toLowerCase() === gameRoom.currentWord.toLowerCase()) {
    player.score += 100;
    
    broadcastMessage({
      type: 'correctGuess',
      winner: player.username,
      word: gameRoom.currentWord,
      scores: Array.from(gameRoom.players.values())
    });
    
    // Terminer le round
    endRound();
  }
}

function broadcastMessage(message: any, excludeSocket?: WebSocket) {
  const messageStr = JSON.stringify(message);
  connectedClients.forEach((player, socket) => {
    if (socket !== excludeSocket && socket.readyState === WebSocket.OPEN) {
      socket.send(messageStr);
    }
  });
}

async function startNewRound() {
  // Choisir un joueur au hasard pour dessiner
  const players = Array.from(gameRoom.players.values());
  if (players.length < 2) return;
  
  // Trouver l'index du dessinateur actuel
  let currentIndex = -1;
  if (gameRoom.currentDrawer) {
    currentIndex = players.findIndex(p => p.id === gameRoom.currentDrawer);
  }
  
  // Passer au joueur suivant
  const nextIndex = (currentIndex + 1) % players.length;
  const drawer = players[nextIndex];
  
  // Réinitialiser l'état des joueurs
  players.forEach(p => p.isDrawing = false);
  drawer.isDrawing = true;
  
  // Obtenir un mot aléatoire
  try {
    const response = await fetch('http://localhost:3000/api/random-word');
    const wordData = await response.json();
    
    gameRoom.currentWord = wordData.word;
    gameRoom.currentDrawer = drawer.id;
    gameRoom.gameState = 'playing';
    gameRoom.timeLeft = 60;
    
    // Envoyer l'état du jeu à tous les joueurs
    connectedClients.forEach((player, socket) => {
      if (player.id === drawer.id) {
        // Le dessinateur voit le mot
        socket.send(JSON.stringify({
          type: 'newRound',
          role: 'drawer',
          word: gameRoom.currentWord,
          timeLeft: gameRoom.timeLeft
        }));
      } else {
        // Les autres voient des tirets
        socket.send(JSON.stringify({
          type: 'newRound',
          role: 'guesser',
          wordHint: gameRoom.currentWord.replace(/[^ ]/g, '_'),
          timeLeft: gameRoom.timeLeft,
          drawer: drawer.username
        }));
      }
    });
    
    // Démarrer le timer
    startRoundTimer();
  } catch (error) {
    console.error('Erreur lors du démarrage du round:', error);
  }
}

function startRoundTimer() {
  if (gameRoom.timerInterval) {
    clearInterval(gameRoom.timerInterval);
  }
  
  gameRoom.timerInterval = setInterval(() => {
    gameRoom.timeLeft--;
    
    if (gameRoom.timeLeft <= 0) {
      endRound();
    } else {
      broadcastMessage({
        type: 'timeUpdate',
        timeLeft: gameRoom.timeLeft
      });
    }
  }, 1000);
}

function endRound() {
  if (gameRoom.timerInterval) {
    clearInterval(gameRoom.timerInterval);
  }
  
  gameRoom.gameState = 'roundEnd';
  
  broadcastMessage({
    type: 'roundEnd',
    word: gameRoom.currentWord,
    scores: Array.from(gameRoom.players.values())
  });
  
  // Démarrer un nouveau round après 5 secondes
  setTimeout(() => {
    if (gameRoom.players.size >= 2) {
      startNewRound();
    } else {
      gameRoom.gameState = 'waiting';
      gameRoom.currentWord = null;
      gameRoom.currentDrawer = null;
    }
  }, 5000);
}

function checkAndStartGame() {
  if (gameRoom.players.size >= 2 && gameRoom.gameState === 'waiting') {
    setTimeout(() => {
      startNewRound();
    }, 2000);
  }
}

// Configurer le serveur
app.use(router.routes());
app.use(router.allowedMethods());
app.use(notFoundHandler);

// Démarrer les serveurs
app.addEventListener("listen", () => {
  serve(handleWS, { port: WS_PORT });
  console.log(`HTTP: http://localhost:${PORT} | WS: ws://localhost:${WS_PORT}`);
});

await app.listen({ port: PORT });